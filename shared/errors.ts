/**
 * IPC 错误编解码（Bug2 统一方案）—— 纯函数，无 electron / node 依赖，vitest 可直测。
 *
 * 背景：Electron ipcRenderer.invoke 拒绝时，跨进程只序列化 Error.message，
 * 自定义 `.code` 一律丢失 → 渲染进程 err.code 落空，错误映射退化为 unknown。
 *
 * 约定（主进程 electron/ipc.ts 的 handle 包装负责编码，渲染进程 parseIpcError 解码）：
 * - 主进程 catch 后先 redact()，再 throw new Error(IPC_ERROR_PREFIX + JSON.stringify({code, message}))；
 * - Electron 会再给 message 包一层 "Error invoking remote method '<channel>': Error: …"，
 *   所以解析端用 indexOf 找前缀而不是 startsWith；
 * - 识别不到前缀时回退启发式：自带 .code 的错误（mock 桥 / 本地逻辑）直接用；
 *   裸 code 作 message 的历史抛法（new Error('provider_not_found')）识别为 code；
 *   最终兜底 { code: 'unknown' }。
 */
import type { ApiError } from './types';

export const IPC_ERROR_PREFIX = 'EASYUI_ERR:';

/** 裸 code 形态（历史抛法 new Error('provider_not_found')，含 zod 之外的裸字符串码） */
const BARE_CODE_RE = /^[a-z][a-z0-9_]*$/;
/** Electron invoke 包装前缀："Error invoking remote method 'x': Error: " / "…: ZodError: " */
const INVOKE_WRAPPER_RE = /^Error invoking remote method '[^']*':\s*(?:[\w$]*Error:\s*)?/;

/**
 * 主进程侧：从任意抛出物推导稳定错误码。
 * - 显式 .code（GatewayError 等）优先；
 * - ZodError → invalid_input（渲染进程看到的是序列化后的 name）；
 * - 裸 code 作 message → 该 code；
 * - 其余 → unknown。
 */
export function deriveIpcCode(err: { name?: string; message?: string; code?: unknown }): string {
  if (typeof err.code === 'string' && err.code) return err.code;
  if (err.name === 'ZodError') return 'invalid_input';
  const msg = typeof err.message === 'string' ? err.message.trim() : '';
  if (BARE_CODE_RE.test(msg)) return msg;
  return 'unknown';
}

/** 主进程侧：把已脱敏的错误编码为可跨进程序列化的 Error（code 内嵌 message） */
export function serializeIpcError(err: { name?: string; message?: string; code?: unknown }): Error {
  const code = deriveIpcCode(err);
  // @req REQ-2026-001：ZodError 的 message 是完整 issue JSON（含字段路径/期望值），
  // 不回传渲染进程；细节由主进程 handle() 留在本地日志
  const message =
    err.name === 'ZodError'
      ? 'invalid_input'
      : typeof err.message === 'string'
        ? err.message
        : String(err);
  return new Error(IPC_ERROR_PREFIX + JSON.stringify({ code, message }));
}

/**
 * 渲染进程侧：把 invoke 拒绝（或 mock 桥抛错）解析回结构化 ApiError。
 * 永不抛异常；识别不到任何结构时兜底 { code: 'unknown' }。
 */
export function parseIpcError(err: unknown): ApiError {
  if (err == null) return { code: 'unknown', message: '' };

  let raw: string;
  if (typeof err === 'string') raw = err;
  else if (err instanceof Error) raw = err.message;
  else if (typeof err === 'object' && typeof (err as { message?: unknown }).message === 'string') {
    raw = (err as { message: string }).message;
  } else raw = String(err);

  // 1) EASYUI_ERR: 前缀（可能位于 Electron invoke 包装之后，故用 indexOf）
  const idx = raw.indexOf(IPC_ERROR_PREFIX);
  if (idx >= 0) {
    const json = raw.slice(idx + IPC_ERROR_PREFIX.length).trim();
    try {
      const parsed: unknown = JSON.parse(json);
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        typeof (parsed as { code?: unknown }).code === 'string' &&
        (parsed as { code: string }).code.length > 0
      ) {
        const p = parsed as { code: string; message?: unknown };
        return { code: p.code, message: typeof p.message === 'string' ? p.message : '' };
      }
    } catch {
      /* JSON 损坏 → 落兜底 */
    }
    return { code: 'unknown', message: raw };
  }

  // 2) 自带 .code（mock 桥、本地逻辑错误 —— 不经过 IPC 序列化）
  if (typeof err === 'object') {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string' && code) return { code, message: raw };
  }

  // 3) 剥离 Electron invoke 包装（理论上前缀分支已覆盖，留作旧主进程版本的兼容）
  const stripped = raw.replace(INVOKE_WRAPPER_RE, '').trim();

  // 4) 裸 code 作 message（mock 桥 throw new Error('provider_not_found') 等历史抛法）
  if (BARE_CODE_RE.test(stripped)) return { code: stripped, message: '' };

  // 5) 兜底
  return { code: 'unknown', message: stripped || raw };
}
