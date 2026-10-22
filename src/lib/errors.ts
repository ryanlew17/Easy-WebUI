/**
 * 错误归类（docs/design/ux-guidelines.md 三段式错误文案的"可能原因/建议操作"映射）。
 * 输入为主进程已脱敏的 ApiError；输出为 i18n 键后缀，UI 负责拼三段。
 *
 * parseIpcError（shared/errors.ts，本文件 re-export）：一切 invoke 拒绝 /
 * mock 桥抛错的统一解码入口 —— 渲染进程所有消费点不得再直接读 err.code / err.message。
 */
import type { ApiError } from '@shared/types';

export { parseIpcError } from '@shared/errors';
import { parseIpcError } from '@shared/errors';

export type ErrorKind = 'auth' | 'rate' | 'server' | 'network' | 'timeout' | 'config' | 'unknown';

export function classifyError(err: ApiError): ErrorKind {
  const text = `${err.code} ${err.message}`.toLowerCase();
  if (/\b(401|403)\b|unauthorized|forbidden|invalid_api_key|missing_api_key/.test(text)) {
    return 'auth';
  }
  if (/no_provider|no_model|provider_not_found|conversation_not_found|nothing_to_regenerate|invalid_json_schema|context_overflow|preset_not_found|global_preset_readonly/.test(text)) {
    return 'config';
  }
  if (/\b429\b|rate.?limit|quota/.test(text)) return 'rate';
  // @req REQ-2026-001：response_too_large=端点返回超限内容；redirect_rejected=端点发起重定向（地址配置存疑）
  if (/\b5\d\d\b|internal|bad_gateway|service_unavailable|response_too_large/.test(text)) return 'server';
  if (/timeout|timed?\s*out|idle/.test(text)) return 'timeout';
  if (/network|econn|enotfound|fetch failed|socket|unreachable|cors|redirect_rejected/.test(text)) return 'network';
  return 'unknown';
}

/** toast 用单行摘要：发生了什么（code + message）；message 与 code 相同或为空时不重复 */
export function summarizeError(err: ApiError): string {
  if (!err.code) return err.message;
  if (!err.message || err.message === err.code) return err.code;
  return `[${err.code}] ${err.message}`;
}

/** invoke 拒绝的一行摘要（toast 用）：parseIpcError + summarizeError 组合捷径 */
export function summarizeIpcError(e: unknown): string {
  return summarizeError(parseIpcError(e));
}
