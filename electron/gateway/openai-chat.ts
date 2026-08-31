/**
 * openai-chat 适配器（契约 §5 / kimi.md §6.1）：Chat Completions API。
 * - POST {base}/v1/chat/completions，Authorization: Bearer；
 * - 参数映射（params 为 resolveParams 后的生效值）：
 *   temperature 总是发送；top_p 仅 top_p_enabled；max_tokens 仅 limit_response_length 开；
 *   stop 仅 stop_strings 非空；presence_penalty 仅 presence_penalty_enabled；
 *   repeat_penalty_enabled 且 > 1 → frequency_penalty = repeat_penalty - 1
 *   （近似语义：OpenAI 的 frequency_penalty 是按词频比例惩罚，与"重复惩罚"并不等价）；
 * - OpenRouter 专属（仅 base_url host 含 openrouter.ai 才额外发送）：
 *   top_k（>0）、min_p（min_p_enabled）、repetition_penalty（=repeat_penalty，enabled）；
 * - structured_output_enabled → response_format json_schema（strict），schema 不可解析
 *   时在发送前抛 invalid_json_schema（buildRequest 阶段，请求不发出）；
 * - 流式：SSE `data:` 行、`[DONE]` 终止；choices[0].delta.content → delta；
 *   choices[0].delta.reasoning_content（DeepSeek 等）→ reasoning_delta。
 */
import type { ChatChunk } from '../../shared/types';
import type { AdapterChatInput, BuiltRequest, ProtocolAdapter } from './api';
import { joinUrl } from './url';
import { CONNECT_TIMEOUT_MS, fetchWithTimeout } from './http';
import { toApiError } from './errors';
import { iterateSse } from './sse';
import { parseStructuredSchema, STRUCTURED_OUTPUT_NAME } from './structured';

/** base_url → hostname（解析失败回退原串做子串匹配） */
export function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return baseUrl;
  }
}

export function buildRequest(input: AdapterChatInput): BuiltRequest {
  const { params } = input;
  const body: Record<string, unknown> = {
    model: input.model,
    messages: input.messages,
    stream: input.stream,
    temperature: params.temperature,
  };
  if (params.top_p_enabled) body.top_p = params.top_p;
  if (params.limit_response_length) body.max_tokens = params.max_tokens;
  if (params.stop_strings.length > 0) body.stop = params.stop_strings;
  if (params.presence_penalty_enabled) body.presence_penalty = params.presence_penalty;
  if (params.repeat_penalty_enabled && params.repeat_penalty > 1) {
    body.frequency_penalty = params.repeat_penalty - 1; // 近似语义，见文件头注释
  }
  // OpenRouter 专属扩展参数（其它服务商一律不发，避免 400）
  if (hostOf(input.baseUrl).includes('openrouter.ai')) {
    if (params.top_k > 0) body.top_k = params.top_k;
    if (params.min_p_enabled) body.min_p = params.min_p;
    if (params.repeat_penalty_enabled) body.repetition_penalty = params.repeat_penalty;
  }
  if (params.structured_output_enabled) {
    body.response_format = {
      type: 'json_schema',
      json_schema: {
        name: STRUCTURED_OUTPUT_NAME,
        schema: parseStructuredSchema(params.structured_output_schema), // 不可解析 → 抛 invalid_json_schema
        strict: true,
      },
    };
  }
  return {
    url: joinUrl(input.baseUrl, '/chat/completions'),
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${input.apiKey}`,
    },
    body,
  };
}

function mapUsage(u: unknown): ChatChunk['usage'] {
  if (!u || typeof u !== 'object') return undefined;
  const o = u as Record<string, unknown>;
  return {
    prompt_tokens: typeof o.prompt_tokens === 'number' ? o.prompt_tokens : undefined,
    completion_tokens: typeof o.completion_tokens === 'number' ? o.completion_tokens : undefined,
    total_tokens: typeof o.total_tokens === 'number' ? o.total_tokens : undefined,
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
    const json = (await res.json()) as Record<string, unknown>;
    const choice = (json.choices as Record<string, unknown>[] | undefined)?.[0];
    const message = choice?.message as Record<string, unknown> | undefined;
    yield {
      delta: typeof message?.content === 'string' ? message.content : '',
      reasoning_delta:
        typeof message?.reasoning_content === 'string' ? message.reasoning_content : undefined,
      finishReason: typeof choice?.finish_reason === 'string' ? choice.finish_reason : undefined,
      usage: mapUsage(json.usage),
    };
    return;
  }

  if (!res.body) throw await toApiError({ status: res.status, text: async () => '' });
  for await (const data of iterateSse(res.body, input.signal, input.idleMs)) {
    if (data === '[DONE]') return;
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(data) as Record<string, unknown>;
    } catch {
      continue; // 非 JSON 行（极少数中转站混入）跳过
    }
    const choice = (json.choices as Record<string, unknown>[] | undefined)?.[0];
    const delta = choice?.delta as Record<string, unknown> | undefined;
    const content = typeof delta?.content === 'string' ? delta.content : undefined;
    const reasoning =
      typeof delta?.reasoning_content === 'string' ? delta.reasoning_content : undefined;
    const finishReason =
      typeof choice?.finish_reason === 'string' ? choice.finish_reason : undefined;
    if (content || reasoning || finishReason) {
      yield { delta: content, reasoning_delta: reasoning, finishReason, usage: mapUsage(json.usage) };
    }
  }
}

export const openaiChatAdapter: ProtocolAdapter = { buildRequest, chat };
