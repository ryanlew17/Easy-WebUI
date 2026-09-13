/**
 * 网关错误类型与归一化（docs/design/gateway.md，通用行为）：
 * - HTTP 非 2xx：读响应体 error.message（OpenAI 与 Anthropic 同构），映射 { code, message }；
 * - 所有出口消息过 redactString（依赖 crypto/redact 的密钥注册表）；
 * - 连接超时 / 流式空闲 / 主动取消 各有稳定 code，供 UI 阶段做 i18n 映射。
 */
import { redactString } from '../crypto/redact';
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

/** 把非 2xx 响应读成 GatewayError；响应体可能不是 JSON，做兜底。 */
export async function toApiError(res: {
  status: number;
  statusText?: string;
  text(): Promise<string>;
}): Promise<GatewayError> {
  let message = `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`;
  try {
    const raw = await res.text();
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
    code: typeof code === 'string' ? code : 'request_failed',
    message: redactString(msg),
  };
}
