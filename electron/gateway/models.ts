/**
 * 模型列表拉取与格式自动探测（kimi.md §3.2/§3.3）。
 * - openai-chat / openai-responses：GET {base}/v1/models，Authorization: Bearer；
 * - anthropic：GET {base}/v1/models，x-api-key + anthropic-version；
 * - 15s 超时；失败统一走 toApiError（message 已脱敏）。
 */
import type { ApiFormat } from '../../shared/types';
import { joinUrl } from './url';
import { CONNECT_TIMEOUT_MS, fetchWithTimeout } from './http';
import { toApiError } from './errors';
import { anthropicHeaders } from './anthropic';

export async function listModels(
  baseUrl: string,
  format: ApiFormat,
  apiKey: string,
): Promise<string[]> {
  const headers =
    format === 'anthropic'
      ? anthropicHeaders(apiKey)
      : { authorization: `Bearer ${apiKey}` };
  const res = await fetchWithTimeout(joinUrl(baseUrl, '/models'), { headers }, CONNECT_TIMEOUT_MS);
  if (!res.ok) throw await toApiError(res);
  const json = (await res.json()) as { data?: Array<{ id?: unknown; name?: unknown }> };
  const arr = Array.isArray(json?.data) ? json.data : [];
  return arr
    .map((m) => (typeof m?.id === 'string' ? m.id : typeof m?.name === 'string' ? m.name : ''))
    .filter((s): s is string => s.length > 0);
}

/**
 * 格式自动探测（尽力而为，可失败，kimi.md §3.3）：
 * ① Bearer 头试 /v1/models → openai-chat；② anthropic 头试 → anthropic；均失败 null。
 */
export async function detectFormat(baseUrl: string, apiKey: string): Promise<ApiFormat | null> {
  try {
    await listModels(baseUrl, 'openai-chat', apiKey);
    return 'openai-chat';
  } catch {
    /* 继续尝试 */
  }
  try {
    await listModels(baseUrl, 'anthropic', apiKey);
    return 'anthropic';
  } catch {
    /* 均失败 */
  }
  return null;
}

/** 简单并发池（testAll 并发=4，kimi.md §3.2） */
export async function runWithConcurrency<T>(
  items: readonly T[],
  worker: (item: T) => Promise<void>,
  concurrency = 4,
): Promise<void> {
  const queue = [...items];
  const lanes = Array.from(
    { length: Math.max(1, Math.min(concurrency, queue.length)) },
    async () => {
      for (;;) {
        const item = queue.shift();
        if (item === undefined) return;
        await worker(item);
      }
    },
  );
  await Promise.all(lanes);
}
