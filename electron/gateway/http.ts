/**
 * HTTP 辅助：连接超时与信号链接（docs/design/gateway.md 通用行为：连接 15s）。
 *
 * 说明：连接超时只覆盖"拿到响应头之前"的阶段；响应体（SSE 流）的空闲
 * 由 sse.ts 的 idleMs 单独判定（60s）。Node ≥18 的全局 fetch 即可，
 * 不用 AbortSignal.timeout/any（Node 20+ 才稳定），自行组合以求兼容。
 *
 * @req REQ-2026-001：
 * - C2：fetch 实现可注入（生产注入 Electron net.fetch，压缩解码在 Chromium
 *   网络栈完成、不经 Node 主进程）；未注入时回落 globalThis.fetch（测试/mock）。
 * - I4：redirect 一律 manual，3xx 直接拒绝——LLM API 无合法重定向，跨源
 *   307/308 会把 x-api-key 与请求体转发到重定向目标。
 */
import { GatewayError } from './errors';

export const CONNECT_TIMEOUT_MS = 15_000;

/** 网关 fetch 实现面：本网关永远以 string URL 调用（net.fetch 不接受 URL 对象） */
export type GatewayFetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

/** 生产注入点：main.ts 在 app ready 后注入 net.fetch（net 模块 ready 前不可用） */
let customFetch: GatewayFetchImpl | null = null;
export function setGatewayFetch(impl: GatewayFetchImpl): void {
  customFetch = impl;
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = CONNECT_TIMEOUT_MS,
): Promise<Response> {
  const ctrl = new AbortController();
  const external = init.signal ?? undefined;

  const timer = setTimeout(() => ctrl.abort(new Error('connect_timeout')), timeoutMs);
  let onExternalAbort: (() => void) | undefined;
  if (external) {
    if (external.aborted) {
      ctrl.abort(external.reason ?? new DOMException('aborted', 'AbortError'));
    } else {
      onExternalAbort = () =>
        ctrl.abort(external.reason ?? new DOMException('aborted', 'AbortError'));
      external.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  try {
    const impl = customFetch ?? globalThis.fetch;
    const res = await impl(url, { ...init, redirect: 'manual', signal: ctrl.signal });
    // manual 模式下重定向响应为 opaqueredirect（status 0）；双判兜底非规范实现
    if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) {
      throw new GatewayError('redirect_rejected', `redirect rejected (HTTP ${res.status}): ${url}`);
    }
    return res;
  } catch (e) {
    // 区分：外部（用户）取消 → 原样上抛；超时 → 稳定的 connect_timeout code
    const userAborted = external?.aborted === true;
    if (ctrl.signal.aborted && !userAborted) {
      throw new GatewayError('connect_timeout', `connect timeout after ${timeoutMs}ms: ${url}`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
    if (external && onExternalAbort) {
      external.removeEventListener('abort', onExternalAbort);
    }
  }
}
