/**
 * 网关错误类型与归一化（docs/design/gateway.md，通用行为）：
 * - HTTP 非 2xx：读响应体 error.message（OpenAI 与 Anthropic 同构），映射 { code, message }；
 * - 所有出口消息过 redactString（依赖 crypto/redact 的密钥注册表）；
 * - 连接超时 / 流式空闲 / 主动取消 各有稳定 code，供 UI 阶段做 i18n 映射。
 */
import { redactString } from '../crypto/redact';
import { MAX_ERROR_BYTES, readTextWithLimit } from './read';
import type { ApiError } from '../../shared/types';

export class GatewayError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'GatewayError';
    this.code = code;
  }
}

/** 流式空闲超时（60s 无数据，见 http/sse） */
export class StreamIdleError extends Error {
  code = 'stream_idle_timeout';
  constructor(message = 'stream idle timeout') {
    super(message);
    this.name = 'StreamIdleError';
  }
}

/** 把非 2xx 响应读成 GatewayError；响应体可能不是 JSON，做兜底。读取有上限（MAX_ERROR_BYTES）。 */
export async function toApiError(res: {
  status: number;
  statusText?: string;
  headers?: { get(name: string): string | null };
  body?: ReadableStream<Uint8Array> | null;
  text(): Promise<string>;
}): Promise<GatewayError> {
  let message = `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`;
  try {
    const raw = await readTextWithLimit(res, MAX_ERROR_BYTES);
    const json = JSON.parse(raw) as {
      error?: { message?: string };
      message?: string;
    };
    // OpenAI: { error: { message } }；Anthropic: { error: { message } }；部分中转站直接 { message }
    const extracted = json?.error?.message ?? json?.message;
    if (typeof extracted === 'string' && extracted.length > 0) {
      message = extracted;
    }
  } catch {
    /* 响应体非 JSON，保留 HTTP 状态码文案 */
  }
  return new GatewayError(String(res.status), redactString(message));
}

/**
 * 服务商可控的 error code/type 整形（@req REQ-2026-001 M2）：
 * 脱敏 + 截断 + 字符白名单——恶意端点注入的超长/畸形 code 会入库并广播给 UI。
 */
export function sanitizeErrorCode(raw: unknown, fallback = 'request_failed'): string {
  if (typeof raw !== 'string' || raw.length === 0) return fallback;
  const cleaned = redactString(raw).slice(0, 128).replace(/[^A-Za-z0-9_.:-]/g, '_');
  return cleaned.length > 0 ? cleaned : fallback;
}

/** 任意异常 → 统一 ApiError（message 已过脱敏） */
export function normalizeError(e: unknown): ApiError {
  if (e instanceof GatewayError) {
    return { code: e.code, message: redactString(e.message) };
  }
  if (e instanceof StreamIdleError) {
    return { code: e.code, message: redactString(e.message) };
  }
  if (e instanceof Error && e.name === 'AbortError') {
    return { code: 'aborted', message: 'request aborted' };
  }
  const msg = e instanceof Error ? e.message : String(e);
  const code = (e as { code?: unknown })?.code;
  return {
    code: sanitizeErrorCode(code),
    message: redactString(msg),
  };
}
