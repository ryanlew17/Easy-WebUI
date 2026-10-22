/**
 * anthropic 适配器（docs/contracts/protocol-mapping.md）：Messages API。
 * - POST {base}/v1/messages；Header：x-api-key + anthropic-version: 2023-06-01；
 * - system 是顶层字符串字段，messages 中不得含 system 角色；
 * - max_tokens 必填：limit_response_length 开用其值，关用 4096 兜底（docs/contracts/protocol-mapping.md，anthropic）；
 * - temperature 总是；top_p 仅 top_p_enabled；top_k 仅 > 0；stop_sequences 仅非空；
 * - structured output / min_p / presence_penalty / repeat_penalty：Anthropic 协议
 *   不支持，静默省略（契约：协议差异适配层内部消化）；
 * - 流式：content_block_delta（delta.type === 'text_delta'）→ delta.text；
 *   message_delta → stop_reason/usage；message_stop → 结束；error 事件 → 抛错。
 */
import type { ChatChunk } from '../../shared/types';
import { reasoningOffPayload } from '../../shared/reasoning';
import type { AdapterChatInput, BuiltRequest, ProtocolAdapter } from './api';
import { joinUrl } from './url';
import { CONNECT_TIMEOUT_MS, fetchWithTimeout } from './http';
import { GatewayError, sanitizeErrorCode, sanitizeErrorMessage, toApiError } from './errors';
import { readJsonWithLimit } from './read';
import { iterateSse } from './sse';

export const ANTHROPIC_VERSION = '2023-06-01';
export const ANTHROPIC_DEFAULT_MAX_TOKENS = 4096;

export function anthropicHeaders(apiKey: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': ANTHROPIC_VERSION,
  };
}

export function buildRequest(input: AdapterChatInput): BuiltRequest {
  const { params } = input;
  const systems = input.messages.filter((m) => m.role === 'system');
  const system = systems.map((m) => m.content).join('\n');
  const messages = input.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }));

  const body: Record<string, unknown> = {
    model: input.model,
    messages,
    max_tokens: params.limit_response_length ? params.max_tokens : ANTHROPIC_DEFAULT_MAX_TOKENS,
    temperature: params.temperature,
    stream: input.stream,
  };
  if (system.length > 0) body.system = system;
  if (params.top_p_enabled) body.top_p = params.top_p;
  if (params.top_k > 0) body.top_k = params.top_k;
  if (params.stop_strings.length > 0) body.stop_sequences = params.stop_strings;
  if (input.reasoningOff) {
    // 会话关闭思考：thinking:{type:'disabled'}（Anthropic 显式关闭形态）
    Object.assign(body, reasoningOffPayload('anthropic'));
  }

  return {
    url: joinUrl(input.baseUrl, '/messages'),
    headers: anthropicHeaders(input.apiKey),
    body,
  };
}

export async function* chat(input: AdapterChatInput): AsyncGenerator<ChatChunk> {
  const req = buildRequest(input);
  const res = await fetchWithTimeout(
    req.url,
    {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify(req.body),
      signal: input.signal,
    },
    CONNECT_TIMEOUT_MS,
  );
  if (!res.ok) throw await toApiError(res);

  if (!input.stream) {
    const json = (await readJsonWithLimit(res)) as Record<string, unknown>;
    const content = json.content as Record<string, unknown>[] | undefined;
    const text = Array.isArray(content)
      ? content
          .filter((b) => b?.type === 'text' && typeof b.text === 'string')
          .map((b) => b.text as string)
          .join('')
      : '';
    const usage = json.usage as { input_tokens?: number; output_tokens?: number } | undefined;
    yield {
      delta: text,
      finishReason: typeof json.stop_reason === 'string' ? json.stop_reason : undefined,
      usage: usage
        ? {
            prompt_tokens: usage.input_tokens,
            completion_tokens: usage.output_tokens,
            total_tokens:
              usage.input_tokens != null || usage.output_tokens != null
                ? (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0)
                : undefined,
          }
        : undefined,
    };
    return;
  }

  if (!res.body) throw await toApiError({ status: res.status, text: async () => '' });
  let promptTokens: number | undefined;
  let completionTokens: number | undefined;
  for await (const data of iterateSse(res.body, input.signal, input.idleMs)) {
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(data) as Record<string, unknown>;
    } catch {
      continue;
    }
    const type = typeof json.type === 'string' ? json.type : '';
    if (type === 'message_start') {
      const message = json.message as Record<string, unknown> | undefined;
      const usage = message?.usage as { input_tokens?: number } | undefined;
      if (typeof usage?.input_tokens === 'number') promptTokens = usage.input_tokens;
    } else if (type === 'content_block_delta') {
      const delta = json.delta as { type?: string; text?: string } | undefined;
      if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
        yield { delta: delta.text };
      }
    } else if (type === 'message_delta') {
      const delta = json.delta as { stop_reason?: string } | undefined;
      const usage = json.usage as { output_tokens?: number } | undefined;
      if (typeof usage?.output_tokens === 'number') completionTokens = usage.output_tokens;
      yield {
        finishReason: typeof delta?.stop_reason === 'string' ? delta.stop_reason : undefined,
        usage:
          promptTokens != null || completionTokens != null
            ? {
                prompt_tokens: promptTokens,
                completion_tokens: completionTokens,
                total_tokens: (promptTokens ?? 0) + (completionTokens ?? 0),
              }
            : undefined,
      };
    } else if (type === 'message_stop') {
      return;
    } else if (type === 'error') {
      const err = json.error as { type?: string; message?: string } | undefined;
      throw new GatewayError(
        sanitizeErrorCode(err?.type),
        sanitizeErrorMessage(err?.message, 'anthropic stream error'),
      );
    }
    // ping / content_block_start/stop 等事件忽略
  }
}

export const anthropicAdapter: ProtocolAdapter = { buildRequest, chat };
