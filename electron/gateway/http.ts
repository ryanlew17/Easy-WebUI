/**
 * HTTP 辅助：连接超时与信号链接（docs/design/gateway.md 通用行为：连接 15s）。
 *
 * 说明：连接超时只覆盖"拿到响应头之前"的阶段；响应体（SSE 流）的空闲
 * 由 sse.ts 的 idleMs 单独判定（60s）。Node ≥18 的全局 fetch 即可，
 * 不用 AbortSignal.timeout/any（Node 20+ 才稳定），自行组合以求兼容。
 */
import { GatewayError } from './errors';

export const CONNECT_TIMEOUT_MS = 15_000;

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
    return await fetch(url, { ...init, signal: ctrl.signal });
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
