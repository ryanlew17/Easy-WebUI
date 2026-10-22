/**
 * gateway 适配层测试：mock 全局 fetch，覆盖三种协议的流式/非流式/错误分支、
 * joinUrl 规则、reasoning_content 解析、参数旗标语义（enabled/limit 才发送）、
 * OpenRouter 专属字段、结构化输出、anthropic 顶层 system 与 max_tokens 兜底、
 * 流式空闲重试策略（chat() 注入小 idleMs 触发）。
 *
 * Response 用鸭子类型假对象（不依赖 Node 内置 Response 对流式 body 的支持细节）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatChunk } from '@shared/types';
import { FACTORY_DEFAULTS } from '@shared/params';
import { joinUrl } from '../electron/gateway/url';
import { chat, listModels, testModel, MAX_ERROR_MESSAGE_CHARS, sanitizeErrorMessage } from '../electron/gateway';
import { iterateSse } from '../electron/gateway/sse';
import {
  MAX_NONSTREAM_BYTES,
  readJsonWithLimit,
  readTextWithLimit,
} from '../electron/gateway/read';
import * as openaiChat from '../electron/gateway/openai-chat';
import * as openaiResponses from '../electron/gateway/openai-responses';
import * as anthropic from '../electron/gateway/anthropic';
import { clearRegisteredSecrets, registerSecret } from '../electron/crypto/redact';
import type { AdapterChatInput } from '../electron/gateway/api';

/* ---------- fetch 假响应 ---------- */

function sseResponse(chunks: string[], status = 200): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    body: stream,
    json: async () => JSON.parse(chunks.join('')),
    text: async () => chunks.join(''),
  } as unknown as Response;
}

/** 永不产出也永不结束的流：用于触发空闲超时 */
function idleStreamResponse(): Response {
  const stream = new ReadableStream<Uint8Array>({ start() {} });
  return {
    ok: true,
    status: 200,
    body: stream,
    text: async () => '',
    json: async () => ({}),
  } as unknown as Response;
}

function jsonResponse(obj: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    body: null,
    json: async () => obj,
    text: async () => JSON.stringify(obj),
  } as unknown as Response;
}

async function collect(gen: AsyncGenerator<ChatChunk>): Promise<ChatChunk[]> {
  const out: ChatChunk[] = [];
  for await (const c of gen) out.push(c);
  return out;
}

const baseInput = (over: Partial<AdapterChatInput> = {}): AdapterChatInput => ({
  baseUrl: 'https://api.test.com',
  apiKey: 'sk-test-key',
  model: 'test-model',
  messages: [{ role: 'user', content: 'hi' }],
  params: { ...FACTORY_DEFAULTS },
  stream: true,
  signal: new AbortController().signal,
  ...over,
});

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearRegisteredSecrets();
});

/* ---------- joinUrl ---------- */

describe('joinUrl', () => {
  it('裸域名补 /v1', () => {
    expect(joinUrl('https://api.openai.com', '/chat/completions')).toBe(
      'https://api.openai.com/v1/chat/completions',
    );
  });
  it('去末尾斜杠', () => {
    expect(joinUrl('https://api.openai.com///', '/models')).toBe(
      'https://api.openai.com/v1/models',
    );
  });
  it('已含版本段不再叠加', () => {
    expect(joinUrl('https://open.bigmodel.cn/api/paas/v4', '/chat/completions')).toBe(
      'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    );
    expect(joinUrl('https://api.siliconflow.cn/v1', '/models')).toBe(
      'https://api.siliconflow.cn/v1/models',
    );
  });
  it('anthropic 兼容前缀', () => {
    expect(joinUrl('https://api.xiaomimimo.com/anthropic', '/messages')).toBe(
      'https://api.xiaomimimo.com/anthropic/v1/messages',
    );
    expect(joinUrl('https://api.anthropic.com', '/messages')).toBe(
      'https://api.anthropic.com/v1/messages',
    );
  });
});

/* ---------- openai-chat ---------- */

describe('openai-chat 适配器', () => {
  it('非流式：content + reasoning_content + usage', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        choices: [
          { message: { content: 'hello', reasoning_content: 'think...' }, finish_reason: 'stop' },
        ],
        usage: { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 },
      }),
    );
    const chunks = await collect(openaiChat.chat(baseInput({ stream: false })));
    expect(chunks).toHaveLength(1);
    expect(chunks[0].delta).toBe('hello');
    expect(chunks[0].reasoning_delta).toBe('think...');
    expect(chunks[0].finishReason).toBe('stop');
    expect(chunks[0].usage).toEqual({ prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 });
  });

  it('默认（出厂）参数：仅 temperature/stream，其余可选参数一律不传', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: '' } }] }));
    await collect(openaiChat.chat(baseInput({ stream: false })));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.test.com/v1/chat/completions');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-test-key');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.temperature).toBe(FACTORY_DEFAULTS.temperature);
    expect(body.stream).toBe(false);
    for (const k of [
      'top_p',
      'max_tokens',
      'stop',
      'presence_penalty',
      'frequency_penalty',
      'top_k',
      'min_p',
      'repetition_penalty',
      'response_format',
    ]) {
      expect(body).not.toHaveProperty(k);
    }
  });

  it('旗标语义：top_p/limit/stop/presence/repeat 开启后按规则映射', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: '' } }] }));
    const input = baseInput({
      stream: false,
      params: {
        ...FACTORY_DEFAULTS,
        temperature: 0.5,
        top_p_enabled: true,
        top_p: 0.9,
        limit_response_length: true,
        max_tokens: 64,
        stop_strings: ['###', 'END'],
        presence_penalty_enabled: true,
        presence_penalty: 0.5,
        repeat_penalty_enabled: true,
        repeat_penalty: 1.3,
        top_k: 40,
      },
    });
    await collect(openaiChat.chat(input));
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.temperature).toBe(0.5);
    expect(body.top_p).toBe(0.9);
    expect(body.max_tokens).toBe(64);
    expect(body.stop).toEqual(['###', 'END']);
    expect(body.presence_penalty).toBe(0.5);
    expect(body.frequency_penalty).toBeCloseTo(0.3); // 1.3 - 1
    expect(body).not.toHaveProperty('top_k'); // 非 openrouter host 不发
    expect(body).not.toHaveProperty('repetition_penalty');
  });

  it('repeat_penalty 开启但 ≤ 1 时不传 frequency_penalty', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: '' } }] }));
    await collect(
      openaiChat.chat(
        baseInput({
          stream: false,
          params: { ...FACTORY_DEFAULTS, repeat_penalty_enabled: true, repeat_penalty: 1 },
        }),
      ),
    );
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body).not.toHaveProperty('frequency_penalty');
  });

  it('OpenRouter host：额外发送 top_k(>0)/min_p(enabled)/repetition_penalty(enabled)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: '' } }] }));
    await collect(
      openaiChat.chat(
        baseInput({
          baseUrl: 'https://openrouter.ai/api',
          stream: false,
          params: {
            ...FACTORY_DEFAULTS,
            top_k: 40,
            min_p_enabled: true,
            min_p: 0.05,
            repeat_penalty_enabled: true,
            repeat_penalty: 1.2,
          },
        }),
      ),
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.top_k).toBe(40);
    expect(body.min_p).toBe(0.05);
    expect(body.repetition_penalty).toBe(1.2);
    expect(body.frequency_penalty).toBeCloseTo(0.2); // 1.2 - 1，OpenRouter 也走通用映射
  });

  it('OpenRouter host：top_k=0 / min_p 未开启时不发扩展字段', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: '' } }] }));
    await collect(
      openaiChat.chat(
        baseInput({
          baseUrl: 'https://openrouter.ai',
          stream: false,
          params: { ...FACTORY_DEFAULTS, top_k: 0 },
        }),
      ),
    );
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    for (const k of ['top_k', 'min_p', 'repetition_penalty']) {
      expect(body).not.toHaveProperty(k);
    }
  });

  it('结构化输出：response_format json_schema strict（buildRequest 直接断言）', () => {
    const req = openaiChat.buildRequest(
      baseInput({
        stream: false,
        params: {
          ...FACTORY_DEFAULTS,
          structured_output_enabled: true,
          structured_output_schema: '{"type":"object","properties":{"a":{"type":"string"}}}',
        },
      }),
    );
    expect(req.body.response_format).toEqual({
      type: 'json_schema',
      json_schema: {
        name: 'easyui_output',
        schema: { type: 'object', properties: { a: { type: 'string' } } },
        strict: true,
      },
    });
  });

  it('结构化输出：schema 不可解析 → 发送前抛 invalid_json_schema，请求不发出', async () => {
    expect(() =>
      openaiChat.buildRequest(
        baseInput({
          params: {
            ...FACTORY_DEFAULTS,
            structured_output_enabled: true,
            structured_output_schema: 'not-json{{',
          },
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: 'invalid_json_schema' }) as Error);
    // chat() 走 buildRequest，同样应在 fetch 之前抛出
    await expect(
      collect(
        openaiChat.chat(
          baseInput({
            params: {
              ...FACTORY_DEFAULTS,
              structured_output_enabled: true,
              structured_output_schema: '[1,2]',
            },
          }),
        ),
      ),
    ).rejects.toMatchObject({ code: 'invalid_json_schema' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('流式：SSE 半行缓冲 + [DONE] 终止 + reasoning_delta', async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse([
        'data: {"choices":[{"delta":{"cont', // 半行切断
        'ent":"Hel"}}]}\n\ndata: {"choices":[{"delta":{"content":"lo","reasoning_content":"r1"},"finish_reason":null}]}\n\n',
        'data: [D',
        'ONE]\n\n',
      ]),
    );
    const chunks = await collect(openaiChat.chat(baseInput()));
    expect(chunks.map((c) => c.delta).join('')).toBe('Hello');
    expect(chunks[1].reasoning_delta).toBe('r1');
  });

  it('错误分支：非 2xx 提取 error.message 并脱敏已知密钥', async () => {
    registerSecret('sk-test-key');
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { message: 'invalid api key sk-test-key provided' } }, 401),
    );
    await expect(collect(openaiChat.chat(baseInput({ stream: false })))).rejects.toMatchObject({
      code: '401',
    });
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { message: 'invalid api key sk-test-key provided' } }, 401),
    );
    try {
      await collect(openaiChat.chat(baseInput({ stream: false })));
      expect.unreachable();
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain('sk-***');
      expect(msg).not.toContain('sk-test-key');
    }
  });
});

/* ---------- openai-responses ---------- */

describe('openai-responses 适配器', () => {
  it('payload：system → 顶层 instructions，input 形态，limit 开才发 max_output_tokens', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'completed', output: [] }));
    const input = baseInput({
      stream: false,
      messages: [
        { role: 'system', content: 'be brief' },
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
        { role: 'user', content: 'again' },
      ],
      params: { ...FACTORY_DEFAULTS, limit_response_length: true, max_tokens: 128 },
    });
    await collect(openaiResponses.chat(input));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.test.com/v1/responses');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.instructions).toBe('be brief');
    expect(body.max_output_tokens).toBe(128);
    const inputItems = body.input as Array<{ role: string; content: Array<{ type: string }> }>;
    expect(inputItems).toHaveLength(3); // 不含 system
    expect(inputItems[0].content[0].type).toBe('input_text');
    expect(inputItems[1].content[0].type).toBe('output_text'); // assistant
    expect(body).not.toHaveProperty('top_k');
  });

  it('默认参数：max_output_tokens/top_p 均不传', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'completed', output: [] }));
    await collect(openaiResponses.chat(baseInput({ stream: false })));
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body).not.toHaveProperty('max_output_tokens');
    expect(body).not.toHaveProperty('top_p');
    expect(body).not.toHaveProperty('instructions');
    expect(body).not.toHaveProperty('text');
  });

  it('top_p_enabled → 传 top_p；结构化输出 → text.format json_schema strict', () => {
    const req = openaiResponses.buildRequest(
      baseInput({
        stream: false,
        params: {
          ...FACTORY_DEFAULTS,
          top_p_enabled: true,
          top_p: 0.7,
          structured_output_enabled: true,
          structured_output_schema: '{"type":"object"}',
        },
      }),
    );
    expect(req.body.top_p).toBe(0.7);
    expect(req.body.text).toEqual({
      format: {
        type: 'json_schema',
        name: 'easyui_output',
        schema: { type: 'object' },
        strict: true,
      },
    });
  });

  it('结构化输出：schema 不可解析 → invalid_json_schema', () => {
    expect(() =>
      openaiResponses.buildRequest(
        baseInput({
          params: {
            ...FACTORY_DEFAULTS,
            structured_output_enabled: true,
            structured_output_schema: '',
          },
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: 'invalid_json_schema' }) as Error);
  });

  it('流式：output_text.delta / reasoning_summary delta / completed 带 usage', async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse([
        'data: {"type":"response.output_text.delta","delta":"AB"}\n\n',
        'data: {"type":"response.reasoning_summary_text.delta","delta":"rr"}\n\n',
        'data: {"type":"response.completed","response":{"usage":{"input_tokens":2,"output_tokens":4,"total_tokens":6}}}\n\n',
      ]),
    );
    const chunks = await collect(openaiResponses.chat(baseInput()));
    expect(chunks[0]).toEqual({ delta: 'AB' });
    expect(chunks[1]).toEqual({ reasoning_delta: 'rr' });
    expect(chunks[2].finishReason).toBe('stop');
    expect(chunks[2].usage).toEqual({ prompt_tokens: 2, completion_tokens: 4, total_tokens: 6 });
  });

  it('流式 response.failed → 抛错', async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse([
        'data: {"type":"response.failed","response":{"error":{"code":"server_error","message":"boom"}}}\n\n',
      ]),
    );
    await expect(collect(openaiResponses.chat(baseInput()))).rejects.toMatchObject({
      code: 'server_error',
      message: 'boom',
    });
  });

  it('非流式：从 output 数组提取文本', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        status: 'completed',
        output: [
          { type: 'message', content: [{ type: 'output_text', text: 'world' }] },
        ],
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    );
    const chunks = await collect(openaiResponses.chat(baseInput({ stream: false })));
    expect(chunks[0].delta).toBe('world');
    expect(chunks[0].usage?.total_tokens).toBe(2);
  });
});

/* ---------- anthropic ---------- */

describe('anthropic 适配器', () => {
  it('payload：顶层 system、messages 不含 system、limit 关时 max_tokens 兜底 4096、top_k>0 才传', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ content: [{ type: 'text', text: '' }] }));
    const input = baseInput({
      stream: false,
      messages: [
        { role: 'system', content: 'sys prompt' },
        { role: 'user', content: 'hi' },
      ],
      // limit_response_length 关（出厂默认）→ max_tokens 用 4096 兜底；top_k=0 不发送
      params: { ...FACTORY_DEFAULTS, top_k: 0, repeat_penalty_enabled: true, repeat_penalty: 1.5 },
    });
    await collect(anthropic.chat(input));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.test.com/v1/messages');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-test-key');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers.authorization).toBeUndefined();
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.system).toBe('sys prompt');
    expect(body.messages as unknown[]).toHaveLength(1);
    expect((body.messages as Array<{ role: string }>)[0].role).toBe('user');
    expect(body.max_tokens).toBe(4096); // limit 关 → 兜底
    expect(body).not.toHaveProperty('top_k'); // top_k=0 不发
    expect(body).not.toHaveProperty('frequency_penalty'); // anthropic 不支持，静默忽略
    expect(body).not.toHaveProperty('top_p'); // 未开启
  });

  it('limit 开 → max_tokens 用其值；top_k>0 / top_p / stop_sequences 按旗标发送', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ content: [] }));
    await collect(
      anthropic.chat(
        baseInput({
          stream: false,
          params: {
            ...FACTORY_DEFAULTS,
            limit_response_length: true,
            max_tokens: 512,
            top_k: 40,
            top_p_enabled: true,
            top_p: 0.8,
            stop_strings: ['###'],
          },
        }),
      ),
    );
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.max_tokens).toBe(512);
    expect(body.top_k).toBe(40);
    expect(body.top_p).toBe(0.8);
    expect(body.stop_sequences).toEqual(['###']);
  });

  it('非流式：content 数组拼 text + usage', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        content: [
          { type: 'text', text: 'he' },
          { type: 'text', text: 'llo' },
        ],
        stop_reason: 'end_turn',
        usage: { input_tokens: 5, output_tokens: 2 },
      }),
    );
    const chunks = await collect(anthropic.chat(baseInput({ stream: false })));
    expect(chunks[0].delta).toBe('hello');
    expect(chunks[0].finishReason).toBe('end_turn');
    expect(chunks[0].usage?.total_tokens).toBe(7);
  });

  it('流式：content_block_delta / message_delta / message_stop', async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse([
        'data: {"type":"message_start","message":{"usage":{"input_tokens":9}}}\n\n',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"AB"}}\n\n',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"C"}}\n\n',
        'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":3}}\n\n',
        'data: {"type":"message_stop"}\n\n',
      ]),
    );
    const chunks = await collect(anthropic.chat(baseInput()));
    const text = chunks.map((c) => c.delta ?? '').join('');
    expect(text).toBe('ABC');
    const withUsage = chunks.find((c) => c.usage);
    expect(withUsage?.usage).toEqual({ prompt_tokens: 9, completion_tokens: 3, total_tokens: 12 });
    expect(withUsage?.finishReason).toBe('end_turn');
  });

  it('错误分支：非 2xx 提取 error.message', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { type: 'authentication_error', message: 'bad key' } }, 401),
    );
    await expect(collect(anthropic.chat(baseInput({ stream: false })))).rejects.toMatchObject({
      code: '401',
      message: 'bad key',
    });
  });

  it('流式 error 事件 → 抛错', async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse(['data: {"type":"error","error":{"type":"overloaded_error","message":"busy"}}\n\n']),
    );
    await expect(collect(anthropic.chat(baseInput()))).rejects.toMatchObject({
      code: 'overloaded_error',
      message: 'busy',
    });
  });
});

/* ---------- 统一出口 chat()：流式空闲重试 ---------- */

describe('chat() 重试策略', () => {
  it('空闲超时且未收任何内容 → 自动重试 1 次并成功', async () => {
    fetchMock
      .mockImplementationOnce(async () => idleStreamResponse())
      .mockImplementationOnce(async () =>
        sseResponse(['data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n']),
      );
    const chunks = await collect(chat({
      baseUrl: 'https://api.test.com',
      apiFormat: 'openai-chat',
      apiKey: 'sk-test-key',
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
      params: { ...FACTORY_DEFAULTS },
      stream: true,
      signal: new AbortController().signal,
      idleMs: 50,
    }));
    expect(chunks.map((c) => c.delta).join('')).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('重试后仍空闲 → 产出 stream_idle_timeout 错误 chunk', async () => {
    fetchMock.mockImplementation(async () => idleStreamResponse());
    const chunks = await collect(chat({
      baseUrl: 'https://api.test.com',
      apiFormat: 'openai-chat',
      apiKey: 'sk-test-key',
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
      params: { ...FACTORY_DEFAULTS },
      stream: true,
      signal: new AbortController().signal,
      idleMs: 50,
    }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(chunks[chunks.length - 1]?.error?.code).toBe('stream_idle_timeout');
  });

  it('已收内容后空闲 → 不重试（防重复文本），直接报错', async () => {
    fetchMock.mockImplementation(async () => {
      let sent = false;
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          // 只发一次数据然后挂起
          if (!sent) {
            sent = true;
            c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"A"}}]}\n\n'));
          }
        },
      });
      return { ok: true, status: 200, body: stream, text: async () => '', json: async () => ({}) } as unknown as Response;
    });
    const chunks = await collect(chat({
      baseUrl: 'https://api.test.com',
      apiFormat: 'openai-chat',
      apiKey: 'sk-test-key',
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
      params: { ...FACTORY_DEFAULTS },
      stream: true,
      signal: new AbortController().signal,
      idleMs: 50,
    }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(chunks[0].delta).toBe('A');
    expect(chunks[chunks.length - 1]?.error?.code).toBe('stream_idle_timeout');
  });
});

/* ---------- testModel ---------- */

describe('testModel', () => {
  it('成功：status ok + latency', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: '' } }] }));
    const check = await testModel({
      baseUrl: 'https://api.test.com',
      apiFormat: 'openai-chat',
      apiKey: 'sk-test-key',
      model: 'm',
    });
    expect(check.status).toBe('ok');
    expect(typeof check.latency_ms).toBe('number');
    // ping 载荷：max_tokens=1 非流式（testModel 强制 limit on）
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.max_tokens).toBe(1);
    expect(body.stream).toBe(false);
  });

  it('失败：status fail + 脱敏 error', async () => {
    registerSecret('sk-test-key');
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { message: 'denied sk-test-key' } }, 403),
    );
    const check = await testModel({
      baseUrl: 'https://api.test.com',
      apiFormat: 'openai-chat',
      apiKey: 'sk-test-key',
      model: 'm',
    });
    expect(check.status).toBe('fail');
    expect(check.error).toContain('403');
    expect(check.error).toContain('sk-***');
    expect(check.error).not.toContain('sk-test-key');
  });
});

/* ---------- @req REQ-2026-001：redirect 拒绝 / 大小上限 / SSE 上限 ---------- */

const baseChatReq = (over: Record<string, unknown> = {}) => ({
  baseUrl: 'https://api.test.com',
  apiFormat: 'openai-chat' as const,
  apiKey: 'sk-test-key',
  model: 'm',
  messages: [{ role: 'user' as const, content: 'hi' }],
  params: { ...FACTORY_DEFAULTS },
  stream: false,
  signal: new AbortController().signal,
  ...over,
});

describe('redirect 拒绝（I4）', () => {
  it('请求一律带 redirect:manual', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: '' } }] }));
    await collect(chat(baseChatReq()));
    const init = (fetchMock.mock.calls[0] as [string, RequestInit])[1];
    expect(init.redirect).toBe('manual');
  });

  it('opaqueredirect（manual 模式下的 3xx）→ redirect_rejected', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 0,
      statusText: '',
      type: 'opaqueredirect',
      body: null,
      text: async () => '',
      json: async () => ({}),
    } as unknown as Response);
    await expect(collect(chat(baseChatReq()))).rejects.toMatchObject({ code: 'redirect_rejected' });
  });

  it('非规范实现直接返回 307 → 同样拒绝', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 307));
    await expect(collect(chat(baseChatReq()))).rejects.toMatchObject({ code: 'redirect_rejected' });
  });
});

describe('响应体大小上限（C2/M3）', () => {
  it('listModels：content-length 超限 → response_too_large', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: '',
      headers: {
        get: (n: string) =>
          n.toLowerCase() === 'content-length' ? String(MAX_NONSTREAM_BYTES + 1) : null,
      },
      body: null,
      text: async () => '{}',
      json: async () => ({}),
    } as unknown as Response);
    await expect(listModels('https://api.test.com', 'openai-chat', 'k')).rejects.toMatchObject({
      code: 'response_too_large',
    });
  });

  it('readTextWithLimit：body 流累计超限 → 抛错', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array(64));
        c.enqueue(new Uint8Array(64));
        c.close();
      },
    });
    await expect(
      readTextWithLimit({ body: stream, text: async () => '' }, 100),
    ).rejects.toMatchObject({ code: 'response_too_large' });
  });

  it('readTextWithLimit：无 body 回退 text() 按字节兜底', async () => {
    await expect(
      readTextWithLimit({ body: null, text: async () => 'x'.repeat(200) }, 100),
    ).rejects.toMatchObject({ code: 'response_too_large' });
  });

  it('readTextWithLimit/readJsonWithLimit：正常多 chunk 拼接', async () => {
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode('{"a":'));
        c.enqueue(enc.encode('1}'));
        c.close();
      },
    });
    await expect(readJsonWithLimit({ body: stream, text: async () => '' }, 100)).resolves.toEqual({
      a: 1,
    });
  });
});

describe('iterateSse 单事件上限（C2）', () => {
  async function collectSse(gen: AsyncGenerator<string>): Promise<string[]> {
    const out: string[] = [];
    for await (const s of gen) out.push(s);
    return out;
  }

  it('单事件 data 超限 → response_too_large', async () => {
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode(`data: ${'x'.repeat(200)}\n\n`));
        c.close();
      },
    });
    await expect(collectSse(iterateSse(stream, undefined, 1000, 100))).rejects.toMatchObject({
      code: 'response_too_large',
    });
  });

  it('永不换行的半行超限 → response_too_large', async () => {
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode('y'.repeat(200))); // 无 \n
        c.close();
      },
    });
    await expect(collectSse(iterateSse(stream, undefined, 1000, 100))).rejects.toMatchObject({
      code: 'response_too_large',
    });
  });

  it('上限内正常解析不受影响', async () => {
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode('data: hello\n\ndata: world\n\n'));
        c.close();
      },
    });
    await expect(collectSse(iterateSse(stream, undefined, 1000, 1000))).resolves.toEqual([
      'hello',
      'world',
    ]);
  });
});

/* ---------- @req REQ-2026-001：服务商错误 message 脱敏 + 截断 ---------- */

describe('错误 message 整形（sanitizeErrorMessage）', () => {
  it('超长 message 截断至 ≤2000 字符', () => {
    const out = sanitizeErrorMessage('x'.repeat(5000), 'fallback');
    expect(out.length).toBe(MAX_ERROR_MESSAGE_CHARS);
    expect(out).toBe('x'.repeat(MAX_ERROR_MESSAGE_CHARS));
  });

  it('先脱敏后截断——密钥先被整体替换，绝不留半截明文', () => {
    registerSecret('sk-secret-key-123456');
    // 密钥位于 message 前部，其后跟超长填充：脱敏先行，截断只作用于已脱敏文本
    const out = sanitizeErrorMessage(`sk-secret-key-123456${'y'.repeat(5000)}`, 'fallback');
    expect(out).not.toContain('sk-secret-key-123456');
    expect(out.length).toBeLessThanOrEqual(MAX_ERROR_MESSAGE_CHARS);
    // 密钥位于 2000 字符之后：截断直接丢弃尾部，同样不泄露
    const tail = sanitizeErrorMessage(`${'y'.repeat(3000)}sk-secret-key-123456`, 'fallback');
    expect(tail).not.toContain('sk-secret-key-123456');
  });

  it('非字符串/空串回退 fallback', () => {
    expect(sanitizeErrorMessage(undefined, 'fallback')).toBe('fallback');
    expect(sanitizeErrorMessage('', 'fallback')).toBe('fallback');
    expect(sanitizeErrorMessage(123, 'fallback')).toBe('fallback');
  });

  it('HTTP 非 2xx：toApiError 路径超长 message 同样截断', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { message: 'z'.repeat(9000) } }, 500),
    );
    await expect(collect(openaiChat.chat(baseInput({ stream: false })))).rejects.toMatchObject({
      code: '500',
      message: 'z'.repeat(MAX_ERROR_MESSAGE_CHARS),
    });
  });
});
