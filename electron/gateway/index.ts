/**
 * Provider Gateway 统一出口（docs/design/gateway.md / docs/contracts/protocol-mapping.md）。
 *
 * chat()：按 api_format 分发到三个适配器；实现"流式空闲 60s 重试 1 次"策略。
 *   重试取舍：仅在"本次尝试尚未收到任何 chunk"时才自动重发——这些 API 无法
 *   断点续传，若已收到部分内容再重发会导致渲染进程出现重复文本；已收内容的
 *   场景直接报 stream_idle_timeout，由 UI 给"重试"按钮（docs/design/chat.md）。
 *
 * testModel / testAllModels：最小开销 ping（max_tokens=1，非流式），
 * 结果（含脱敏 error）供 docs/design/provider.md 连接检测持久化。
 *
 * 本模块不依赖 electron / better-sqlite3，可纯单测（mock 全局 fetch）。
 */
import type { ApiFormat, ChatChunk, ModelCheck, ParamValues } from '../../shared/types';
import { FACTORY_DEFAULTS } from '../../shared/params';
import type { AdapterChatInput, ProtocolAdapter } from './api';
import { openaiChatAdapter } from './openai-chat';
import { openaiResponsesAdapter } from './openai-responses';
import { anthropicAdapter } from './anthropic';
import { StreamIdleError, normalizeError } from './errors';
import { runWithConcurrency } from './models';

export const ADAPTERS: Record<ApiFormat, ProtocolAdapter> = {
  'openai-chat': openaiChatAdapter,
  'openai-responses': openaiResponsesAdapter,
  anthropic: anthropicAdapter,
};

export interface GatewayChatRequest {
  baseUrl: string;
  apiFormat: ApiFormat;
  apiKey: string;
  model: string;
  messages: AdapterChatInput['messages'];
  params: ParamValues;
  stream: boolean;
  signal: AbortSignal;
  /** true = 会话 reasoning_enabled=false，请求体混入按协议的"关闭思考"参数 */
  reasoningOff?: boolean;
  idleMs?: number;
}

export async function* chat(req: GatewayChatRequest): AsyncGenerator<ChatChunk> {
  const adapter = ADAPTERS[req.apiFormat];
  if (!adapter) {
    yield { error: { code: 'unknown_api_format', message: `unknown api_format: ${req.apiFormat}` } };
    return;
  }

  const maxAttempts = 2; // 首次 + 重试 1 次（仅流式空闲且未收任何内容时）
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let received = false;
    try {
      const gen = adapter.chat({
        baseUrl: req.baseUrl,
        apiKey: req.apiKey,
        model: req.model,
        messages: req.messages,
        params: req.params,
        stream: req.stream,
        signal: req.signal,
        reasoningOff: req.reasoningOff,
        idleMs: req.idleMs,
      });
      for await (const chunk of gen) {
        received = true;
        yield chunk;
      }
      return;
    } catch (e) {
      const idleTimeout = e instanceof StreamIdleError;
      const canRetry = idleTimeout && !received && attempt < maxAttempts && !req.signal.aborted;
      if (canRetry) continue;
      if (idleTimeout) {
        // 归一化为 ApiError chunk 而非异常，编排层据此落库 error_json
        yield { error: normalizeError(e) };
        return;
      }
      throw e;
    }
  }
}

/** 单模型连通性检测（docs/design/provider.md）：ping + max_tokens=1，非流式 */
export async function testModel(input: {
  baseUrl: string;
  apiFormat: ApiFormat;
  apiKey: string;
  model: string;
}): Promise<ModelCheck> {
  const started = Date.now();
  const checkedAt = started;
  try {
    const params: ParamValues = {
      ...FACTORY_DEFAULTS,
      limit_response_length: true, // ping 必须带 max_tokens=1（最小开销）
      max_tokens: 1,
      stream: false,
    };
    const gen = chat({
      baseUrl: input.baseUrl,
      apiFormat: input.apiFormat,
      apiKey: input.apiKey,
      model: input.model,
      messages: [{ role: 'user', content: 'ping' }],
      params,
      stream: false,
      signal: new AbortController().signal,
    });
    for await (const chunk of gen) {
      if (chunk.error) {
        return {
          status: 'fail',
          latency_ms: Date.now() - started,
          checked_at: checkedAt,
          error: `${chunk.error.code}: ${chunk.error.message}`,
        };
      }
    }
    return { status: 'ok', latency_ms: Date.now() - started, checked_at: checkedAt };
  } catch (e) {
    const ae = normalizeError(e);
    return {
      status: 'fail',
      latency_ms: Date.now() - started,
      checked_at: checkedAt,
      error: `${ae.code}: ${ae.message}`,
    };
  }
}

/** 全部检测（并发=4；docs/design/provider.md）；每完成一个经 onEach 回报 */
export async function testAllModels(input: {
  baseUrl: string;
  apiFormat: ApiFormat;
  apiKey: string;
  modelIds: string[];
  onEach: (modelId: string, check: ModelCheck) => void;
  concurrency?: number;
}): Promise<void> {
  await runWithConcurrency(
    input.modelIds,
    async (modelId) => {
      const check = await testModel({
        baseUrl: input.baseUrl,
        apiFormat: input.apiFormat,
        apiKey: input.apiKey,
        model: modelId,
      });
      input.onEach(modelId, check);
    },
    input.concurrency ?? 4,
  );
}

export { listModels, detectFormat } from './models';
export { joinUrl } from './url';
export { trimMessages, defaultTokenCounter, truncateToTokens } from './trim';
export { GatewayError, StreamIdleError, normalizeError, toApiError } from './errors';
export { parseStructuredSchema, STRUCTURED_OUTPUT_NAME } from './structured';
export { iterateSse } from './sse';
export { CONNECT_TIMEOUT_MS, fetchWithTimeout } from './http';
