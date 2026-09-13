/**
 * openai-responses 适配器（docs/contracts/protocol-mapping.md）：Responses API。
 * - system 角色抽为顶层 instructions 字段；
 * - input 项：{ role, content: [{ type, text }] }；user 用 input_text，
 *   assistant 用 output_text（Responses API 文档形态；契约只写了 input_text，
 *   这里按官方文档对 assistant 做修正并注释说明）；
 * - 参数映射：temperature 总是；top_p 仅 top_p_enabled；max_output_tokens 仅
 *   limit_response_length 开；structured_output_enabled → text.format json_schema
 *   （strict；schema 不可解析发送前抛 invalid_json_schema）；
 * - 流式事件：response.output_text.delta → delta；
 *   response.reasoning_summary_text.delta → reasoning_delta（尽力而为）；
 *   response.completed → 结束（带 usage）；response.failed → 错误。
 * - top_k / min_p / penalties / stop 不支持，静默丢弃（契约：协议差异内部消化）。
 */
import type { ChatChunk } from '../../shared/types';
import { reasoningOffPayload } from '../../shared/reasoning';
import type { AdapterChatInput, BuiltRequest, ProtocolAdapter } from './api';
import { joinUrl } from './url';
import { CONNECT_TIMEOUT_MS, fetchWithTimeout } from './http';
import { GatewayError, toApiError } from './errors';
import { iterateSse } from './sse';
import { redactString } from '../crypto/redact';
import { parseStructuredSchema, STRUCTURED_OUTPUT_NAME } from './structured';

export function buildRequest(input: AdapterChatInput): BuiltRequest {
  const { params } = input;
  const systems = input.messages.filter((m) => m.role === 'system');
  const instructions = systems.map((m) => m.content).join('\n');
  const items = input.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role,
      content: [
        {
          // assistant 历史在 Responses API 中应为 output_text（见文件头注释）
          type: m.role === 'assistant' ? 'output_text' : 'input_text',
          text: m.content,
        },
      ],
    }));

  const body: Record<string, unknown> = {
    model: input.model,
    input: items,
    temperature: params.temperature,
    stream: input.stream,
  };
  if (params.top_p_enabled) body.top_p = params.top_p;
  if (params.limit_response_length) body.max_output_tokens = params.max_tokens;
  if (instructions.length > 0) body.instructions = instructions;
  if (params.structured_output_enabled) {
    // Responses API 的结构化输出走 text.format（json_schema, strict）
    body.text = {
      format: {
        type: 'json_schema',
        name: STRUCTURED_OUTPUT_NAME,
        schema: parseStructuredSchema(params.structured_output_schema),
        strict: true,
      },
    };
  }
  if (input.reasoningOff) {
    // 会话关闭思考：reasoning:{effort:'none'}（Responses API 推理档位关闭形态）
    Object.assign(body, reasoningOffPayload('openai-responses'));
  }

  return {
    url: joinUrl(input.baseUrl, '/responses'),
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
  const inputTokens = typeof o.input_tokens === 'number' ? o.input_tokens : undefined;
  const outputTokens = typeof o.output_tokens === 'number' ? o.output_tokens : undefined;
  const total = typeof o.total_tokens === 'number' ? o.total_tokens : undefined;
  return {
    prompt_tokens: inputTokens,
    completion_tokens: outputTokens,
    total_tokens: total ?? (inputTokens != null || outputTokens != null
      ? (inputTokens ?? 0) + (outputTokens ?? 0)
      : undefined),
  };
}

/** 非流式：从 output 数组中提取文本（output_text 快捷字段并非总有） */
function extractText(json: Record<string, unknown>): string {
  if (typeof json.output_text === 'string') return json.output_text;
  const output = json.output as Record<string, unknown>[] | undefined;
  if (!Array.isArray(output)) return '';
  let text = '';
  for (const item of output) {
    if (item?.type !== 'message') continue;
    const content = item.content as Record<string, unknown>[] | undefined;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part?.type === 'output_text' && typeof part.text === 'string') text += part.text;
    }
  }
  return text;
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
    if (json.status === 'failed') {
      const err = json.error as { message?: string; code?: string } | undefined;
      throw new GatewayError(
        typeof err?.code === 'string' ? err.code : 'request_failed',
        redactString(err?.message ?? 'response failed'),
      );
    }
    yield {
      delta: extractText(json),
      finishReason: json.status === 'completed' ? 'stop' : String(json.status ?? 'stop'),
      usage: mapUsage(json.usage),
    };
    return;
  }

  if (!res.body) throw await toApiError({ status: res.status, text: async () => '' });
  for await (const data of iterateSse(res.body, input.signal, input.idleMs)) {
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(data) as Record<string, unknown>;
    } catch {
      continue;
    }
    const type = typeof json.type === 'string' ? json.type : '';
    if (type === 'response.output_text.delta') {
      if (typeof json.delta === 'string') yield { delta: json.delta };
    } else if (type === 'response.reasoning_summary_text.delta') {
      if (typeof json.delta === 'string') yield { reasoning_delta: json.delta };
    } else if (type === 'response.completed') {
      const response = json.response as Record<string, unknown> | undefined;
      yield { finishReason: 'stop', usage: mapUsage(response?.usage) };
      return;
    } else if (type === 'response.incomplete') {
      const response = json.response as Record<string, unknown> | undefined;
      yield { finishReason: 'length', usage: mapUsage(response?.usage) };
      return;
    } else if (type === 'response.failed') {
      const response = json.response as Record<string, unknown> | undefined;
      const err = response?.error as { message?: string; code?: string } | undefined;
      throw new GatewayError(
        typeof err?.code === 'string' ? err.code : 'request_failed',
        redactString(err?.message ?? 'response failed'),
      );
    }
    // 其余事件（response.created / output_item.* 等）忽略
  }
}

export const openaiResponsesAdapter: ProtocolAdapter = { buildRequest, chat };
