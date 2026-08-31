/**
 * 生成编排（ChatOrchestrator）测试：真实 better-sqlite3 :memory: + 真实 DAO +
 * 假 CryptoService + mock 全局 fetch（沿用 tests/gateway.test.ts 的鸭子类型 Response）。
 *
 * 覆盖：
 * - send → regenerate×2：同级分支 count/index、active_leaf 切新分支、旧消息不删；
 * - switchBranch / setActiveLeaf 后 send 在其下开新分支（siblingOf 语义）；
 * - continue：delta 追加同一消息（无新行）、total_ms 累加、token_count 重计；
 * - generateResponse：激活叶为 user 才允许，否则 nothing_to_generate；
 * - reasoningOff：会话 reasoning_enabled=false 时三格式请求体各含对应关闭字段，
 *   开启时（默认）不含；
 * - 计时：流式 mock 断言 ttft_ms/total_ms > 0 且 ttft ≤ total、finish_reason 落库。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '@shared/types';
import { openDatabase, type DB } from '../electron/db';
import { createConversationsDao, type ConversationsDao } from '../electron/db/conversations';
import { createMessagesDao, type MessagesDao } from '../electron/db/messages';
import { createProvidersDao, type ProvidersDao } from '../electron/db/providers';
import { createSettingsDao, type SettingsDao } from '../electron/db/settings';
import { createPresetsDao, type PresetsDao } from '../electron/db/presets';
import { ChatOrchestrator } from '../electron/chat';
import { defaultTokenCounter } from '../electron/gateway/trim';
import { clearRegisteredSecrets } from '../electron/crypto/redact';
import type { CryptoService } from '../electron/crypto';
import type { ApiFormat } from '@shared/types';

/* ---------- fetch 假响应（同 gateway.test.ts 风格） ---------- */

function sseChunksOpenAi(parts: { content?: string; reasoning?: string; finish?: string }[]): string[] {
  const lines = parts.map((p) => {
    const delta: Record<string, string> = {};
    if (p.content) delta.content = p.content;
    if (p.reasoning) delta.reasoning_content = p.reasoning;
    const choice: Record<string, unknown> = { delta };
    if (p.finish) choice.finish_reason = p.finish;
    return `data: ${JSON.stringify({ choices: [choice] })}\n\n`;
  });
  lines.push('data: [DONE]\n\n');
  return lines;
}

function sseResponse(chunks: string[], delayMs = 0): Response {
  const enc = new TextEncoder();
  const queue = [...chunks];
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const c = queue.shift();
      if (c === undefined) {
        controller.close();
        return;
      }
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      controller.enqueue(enc.encode(c));
    },
  });
  return {
    ok: true,
    status: 200,
    statusText: '',
    body: stream,
    json: async () => ({}),
    text: async () => '',
  } as unknown as Response;
}

/** 最后一次 fetch 调用的请求体 JSON */
function lastFetchBody(): Record<string, unknown> {
  const calls = fetchMock.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  const init = calls[calls.length - 1][1] as { body: string };
  return JSON.parse(init.body) as Record<string, unknown>;
}

/* ---------- 装配 ---------- */

const fakeCrypto: CryptoService = {
  status: () => ({ method: 'machine-fallback', available: true }),
  encryptString: (p: string) => p,
  decryptString: (c: string) => c,
};

let db: DB;
let conversations: ConversationsDao;
let messages: MessagesDao;
let providers: ProvidersDao;
let settings: SettingsDao;
let presets: PresetsDao;
let orchestrator: ChatOrchestrator;
let fetchMock: ReturnType<typeof vi.fn>;
let events: { channel: string; payload: Record<string, unknown> }[];

function setup(format: ApiFormat = 'openai-chat'): { convId: string; providerId: string } {
  db = openDatabase(':memory:');
  conversations = createConversationsDao(db);
  messages = createMessagesDao(db);
  providers = createProvidersDao(db);
  settings = createSettingsDao(db);
  presets = createPresetsDao(db);
  settings.set({ auto_title: false }); // 关闭自动标题，避免额外 fetch
  // 闭包捕获本测试自己的数组：上一测试未结束的后台流不会污染当前测试
  const myEvents: { channel: string; payload: Record<string, unknown> }[] = [];
  events = myEvents;
  orchestrator = new ChatOrchestrator({
    conversations,
    messages,
    providers,
    settings,
    presets,
    crypto: fakeCrypto,
    send: (channel, payload) => {
      myEvents.push({ channel, payload: payload as Record<string, unknown> });
    },
  });
  const provider = providers.insert({
    name: 'Test',
    base_url: 'https://api.test.com',
    api_format: format,
    api_key_cipher: Buffer.from('sk-test-key', 'utf8'),
  });
  const conv = conversations.create();
  conversations.update(conv.id, { provider_id: provider.id, model: 'test-model' });
  return { convId: conv.id, providerId: provider.id };
}

/** 等待某通道事件出现（run 是后台异步的） */
async function waitEvent(channel: string, timeoutMs = 3000): Promise<Record<string, unknown>> {
  const t0 = Date.now();
  for (;;) {
    const hit = events.find((e) => e.channel === channel);
    if (hit) return hit.payload;
    if (Date.now() - t0 > timeoutMs) throw new Error(`timeout waiting for ${channel}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

function lastMessage(id: string): Message {
  const m = messages.get(id);
  if (!m) throw new Error(`message ${id} missing`);
  return m;
}

/** 断言 Promise 以指定 GatewayError.code 拒绝（toThrow 只匹配 message，不匹配 code） */
async function expectCode(p: Promise<unknown>, code: string): Promise<void> {
  try {
    await p;
  } catch (e) {
    expect((e as { code?: unknown }).code).toBe(code);
    return;
  }
  throw new Error(`expected rejection with code ${code}`);
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearRegisteredSecrets();
  db?.close();
});

/* ---------- 分支模型 ---------- */

describe('send / regenerate 分支模型', () => {
  it('send → regenerate×2：同级 count=3、index 正确、旧分支不删、active_leaf 切新分支', async () => {
    const { convId } = setup();
    fetchMock.mockImplementation(async () =>
      sseResponse(sseChunksOpenAi([{ content: 'v1', finish: 'stop' }])),
    );
    const sent = await orchestrator.sendMessage({ conversationId: convId, content: 'q1' });
    await waitEvent('chat:done');
    expect(sent.userMessageId).toBeTruthy();

    // 第一次 regenerate：同级分支 #2
    fetchMock.mockImplementation(async () =>
      sseResponse(sseChunksOpenAi([{ content: 'v2', finish: 'stop' }])),
    );
    const regen1 = await orchestrator.regenerateMessage({
      conversationId: convId,
      messageId: sent.assistantMessageId,
    });
    await waitEvent('chat:done', 3000).then(() => undefined);
    // 等第二个 done（events 里已有一个）
    const t0 = Date.now();
    while (events.filter((e) => e.channel === 'chat:done').length < 2 && Date.now() - t0 < 3000) {
      await new Promise((r) => setTimeout(r, 5));
    }

    let path = messages.list(convId);
    expect(path).toHaveLength(2); // user + 激活的 assistant
    const br = path[1].branch;
    expect(br).toBeDefined();
    expect(br!.count).toBe(2);
    expect(br!.index).toBe(2); // 最新分支激活
    expect(br!.ids).toEqual([sent.assistantMessageId, regen1.assistantMessageId]);
    expect(path[1].content).toBe('v2');
    // 旧分支消息仍在
    expect(lastMessage(sent.assistantMessageId).content).toBe('v1');

    // 第二次 regenerate：count=3
    fetchMock.mockImplementation(async () =>
      sseResponse(sseChunksOpenAi([{ content: 'v3', finish: 'stop' }])),
    );
    const regen2 = await orchestrator.regenerateMessage({
      conversationId: convId,
      messageId: regen1.assistantMessageId,
    });
    const t1 = Date.now();
    while (events.filter((e) => e.channel === 'chat:done').length < 3 && Date.now() - t1 < 3000) {
      await new Promise((r) => setTimeout(r, 5));
    }
    path = messages.list(convId);
    expect(path[1].branch!.count).toBe(3);
    expect(path[1].branch!.index).toBe(3);
    expect(path[1].branch!.ids).toEqual([
      sent.assistantMessageId,
      regen1.assistantMessageId,
      regen2.assistantMessageId,
    ]);
    // active_leaf 切到新分支
    const convRow = db
      .prepare('SELECT active_leaf_id FROM conversations WHERE id = ?')
      .get(convId) as { active_leaf_id: string };
    expect(convRow.active_leaf_id).toBe(regen2.assistantMessageId);
  });

  it('regenerate 非 assistant 目标 → invalid_target；生成中 → generation_in_progress', async () => {
    const { convId } = setup();
    fetchMock.mockImplementation(async () =>
      sseResponse(sseChunksOpenAi([{ content: 'x', finish: 'stop' }]), 20),
    );
    const sent = await orchestrator.sendMessage({ conversationId: convId, content: 'q' });
    // 生成中再发 → 锁
    await expectCode(
      orchestrator.sendMessage({ conversationId: convId, content: 'q2' }),
      'generation_in_progress',
    );
    await waitEvent('chat:done');
    await expectCode(
      orchestrator.regenerateMessage({ conversationId: convId, messageId: sent.userMessageId! }),
      'invalid_target',
    );
  });

  it('setActiveLeaf 后 send 在其下开新分支；siblingOf 以同级身份插入', async () => {
    const { convId } = setup();
    fetchMock.mockImplementation(async () =>
      sseResponse(sseChunksOpenAi([{ content: 'a1', finish: 'stop' }])),
    );
    const sent = await orchestrator.sendMessage({ conversationId: convId, content: 'q1' });
    await waitEvent('chat:done');

    // 激活叶回退到 user 消息，send → 新 user 挂在它下面（与旧 assistant 同 parent，形成分支）
    messages.setActiveLeaf(convId, sent.userMessageId!);
    fetchMock.mockImplementation(async () =>
      sseResponse(sseChunksOpenAi([{ content: 'a2', finish: 'stop' }])),
    );
    const sent2 = await orchestrator.sendMessage({ conversationId: convId, content: 'q2' });
    const t0 = Date.now();
    while (events.filter((e) => e.channel === 'chat:done').length < 2 && Date.now() - t0 < 3000) {
      await new Promise((r) => setTimeout(r, 5));
    }
    const userMsg = lastMessage(sent2.userMessageId!);
    expect(userMsg.parent_id).toBe(sent.userMessageId); // 挂在旧 user 下
    const path = messages.list(convId);
    expect(path.map((m) => m.id)).toEqual([sent.userMessageId, sent2.userMessageId, sent2.assistantMessageId]);
    // u1 的子 = [a1, u2] → 新 user 与旧 assistant 同级，count=2，新支 index=2
    expect(path[1].branch).toBeDefined();
    expect(path[1].branch!.count).toBe(2);
    expect(path[1].branch!.index).toBe(2);
    expect(path[1].branch!.ids).toEqual([sent.assistantMessageId, sent2.userMessageId]);

    // siblingOf：以 sent2 user 的同级身份再发一条（parent = 其 parent）
    fetchMock.mockImplementation(async () =>
      sseResponse(sseChunksOpenAi([{ content: 'a3', finish: 'stop' }])),
    );
    const sent3 = await orchestrator.sendMessage({
      conversationId: convId,
      content: 'q2-edit',
      siblingOf: sent2.userMessageId!,
    });
    const t1 = Date.now();
    while (events.filter((e) => e.channel === 'chat:done').length < 3 && Date.now() - t1 < 3000) {
      await new Promise((r) => setTimeout(r, 5));
    }
    const edited = lastMessage(sent3.userMessageId!);
    expect(edited.parent_id).toBe(sent.userMessageId); // 与原 user 同 parent
    const path3 = messages.list(convId);
    expect(path3.map((m) => m.id)).toEqual([sent.userMessageId, sent3.userMessageId, sent3.assistantMessageId]);
    const userBranch = path3[1].branch;
    expect(userBranch).toBeDefined();
    expect(userBranch!.count).toBe(3); // a1 / q2 / q2-edit 三支
    expect(userBranch!.index).toBe(3);
    expect(userBranch!.ids).toEqual([sent.assistantMessageId, sent2.userMessageId, sent3.userMessageId]);
  });
});

/* ---------- continue ---------- */

describe('continueMessage', () => {
  it('delta 追加到同一消息（无新行），total_ms 累加，token_count 重计总内容', async () => {
    const { convId } = setup();
    fetchMock.mockImplementation(async () =>
      sseResponse(sseChunksOpenAi([{ content: 'abc', finish: 'length' }]), 8),
    );
    const sent = await orchestrator.sendMessage({ conversationId: convId, content: 'q' });
    await waitEvent('chat:done');
    const before = lastMessage(sent.assistantMessageId);
    expect(before.content).toBe('abc');
    const firstTotal = before.stats!.total_ms!;
    const firstTtft = before.stats!.ttft_ms!;
    expect(firstTotal).toBeGreaterThan(0);

    const countBefore = messages.countByConversation(convId);
    fetchMock.mockImplementation(async () =>
      sseResponse(sseChunksOpenAi([{ content: 'def', finish: 'stop' }]), 8),
    );
    await orchestrator.continueMessage({ conversationId: convId, messageId: sent.assistantMessageId });
    const t0 = Date.now();
    while (events.filter((e) => e.channel === 'chat:done').length < 2 && Date.now() - t0 < 3000) {
      await new Promise((r) => setTimeout(r, 5));
    }

    const after = lastMessage(sent.assistantMessageId);
    expect(messages.countByConversation(convId)).toBe(countBefore); // 无新消息行
    expect(after.content).toBe('abcdef'); // 追加
    expect(after.stats!.total_ms!).toBeGreaterThan(firstTotal); // 累加
    expect(after.stats!.ttft_ms).toBe(firstTtft); // 首段 ttft 保留
    expect(after.stats!.finish_reason).toBe('stop'); // 取本次
    expect(after.token_count).toBe(defaultTokenCounter('abcdef')); // 重计总内容

    // continue 的 delta 事件 messageId 不变（渲染端直接拼）
    const deltas = events.filter((e) => e.channel === 'chat:delta');
    expect(deltas.length).toBeGreaterThan(0);
    expect(deltas.every((d) => d.payload.messageId === sent.assistantMessageId)).toBe(true);
  });

  it('continue 非 assistant 目标 → invalid_target', async () => {
    const { convId } = setup();
    fetchMock.mockImplementation(async () =>
      sseResponse(sseChunksOpenAi([{ content: 'x', finish: 'stop' }])),
    );
    const sent = await orchestrator.sendMessage({ conversationId: convId, content: 'q' });
    await waitEvent('chat:done');
    await expectCode(
      orchestrator.continueMessage({ conversationId: convId, messageId: sent.userMessageId! }),
      'invalid_target',
    );
  });
});

/* ---------- generateResponse ---------- */

describe('generateResponse', () => {
  it('激活叶为 assistant 或空会话 → nothing_to_generate；激活叶为 user → 正常生成', async () => {
    const { convId } = setup();
    // 空会话
    await expectCode(orchestrator.generateResponse({ conversationId: convId }), 'nothing_to_generate');

    // 手工插入一条 user 并设为激活叶（模拟 setActiveLeaf 后的状态）
    const u = messages.insert({ conversation_id: convId, role: 'user', content: 'ping' });
    messages.setActiveLeaf(convId, u.id);
    fetchMock.mockImplementation(async () =>
      sseResponse(sseChunksOpenAi([{ content: 'pong', finish: 'stop' }])),
    );
    const gen = await orchestrator.generateResponse({ conversationId: convId });
    await waitEvent('chat:done');
    const assistant = lastMessage(gen.assistantMessageId);
    expect(assistant.parent_id).toBe(u.id);
    expect(assistant.content).toBe('pong');

    // 现在激活叶是 assistant → 拒绝
    await expectCode(orchestrator.generateResponse({ conversationId: convId }), 'nothing_to_generate');
  });
});

/* ---------- 计时字段 ---------- */

describe('计时字段', () => {
  it('流式：ttft_ms/total_ms > 0 且 ttft ≤ total，finish_reason 落库；reasoning 先到时 reasoning_ms 记录', async () => {
    const { convId } = setup();
    fetchMock.mockImplementation(async () =>
      sseResponse(
        sseChunksOpenAi([
          { reasoning: 'think-' },
          { reasoning: 'more-' },
          { content: 'answer', finish: 'stop' },
        ]),
        10,
      ),
    );
    const sent = await orchestrator.sendMessage({ conversationId: convId, content: 'q' });
    await waitEvent('chat:done');
    const m = lastMessage(sent.assistantMessageId);
    expect(m.stats).toBeDefined();
    expect(m.stats!.ttft_ms!).toBeGreaterThan(0);
    expect(m.stats!.total_ms!).toBeGreaterThan(0);
    expect(m.stats!.ttft_ms!).toBeLessThanOrEqual(m.stats!.total_ms!);
    expect(m.stats!.finish_reason).toBe('stop');
    // 全程有 reasoning：reasoning_ms = 首 content delta − t0，应 ≥ ttft 且 ≤ total
    expect(m.stats!.reasoning_ms!).toBeGreaterThanOrEqual(m.stats!.ttft_ms!);
    expect(m.stats!.reasoning_ms!).toBeLessThanOrEqual(m.stats!.total_ms!);
    expect(m.reasoning).toBe('think-more-');
  });

  it('中止也落库已测得时间（partial:true）', async () => {
    const { convId } = setup();
    fetchMock.mockImplementation(async () =>
      sseResponse(
        sseChunksOpenAi([{ content: 'part1' }, { content: 'part2' }, { content: 'part3' }]),
        15,
      ),
    );
    const sent = await orchestrator.sendMessage({ conversationId: convId, content: 'q' });
    await waitEvent('chat:delta'); // 收到首个 delta 后中止
    orchestrator.stopGeneration(convId);
    await waitEvent('chat:done');
    const m = lastMessage(sent.assistantMessageId);
    expect(m.partial).toBe(true);
    expect(m.stats!.ttft_ms!).toBeGreaterThan(0);
    expect(m.stats!.total_ms!).toBeGreaterThanOrEqual(m.stats!.ttft_ms!);
  });
});

/* ---------- reasoningOff 三格式载荷 ---------- */

describe('reasoningOff（会话思考开关）', () => {
  const formats: Array<{ format: ApiFormat; offField: string; offValue: unknown }> = [
    { format: 'openai-chat', offField: 'thinking', offValue: { type: 'disabled' } },
    { format: 'openai-responses', offField: 'reasoning', offValue: { effort: 'none' } },
    { format: 'anthropic', offField: 'thinking', offValue: { type: 'disabled' } },
  ];

  for (const { format, offField, offValue } of formats) {
    it(`${format}：reasoning_enabled=false → 请求体含关闭字段；true → 不含`, async () => {
      const { convId } = setup(format);
      conversations.update(convId, { reasoning_enabled: false });

      if (format === 'openai-chat') {
        fetchMock.mockImplementation(async () =>
          sseResponse(sseChunksOpenAi([{ content: 'x', finish: 'stop' }])),
        );
      } else if (format === 'openai-responses') {
        fetchMock.mockImplementation(async () =>
          sseResponse([
            'data: {"type":"response.output_text.delta","delta":"x"}\n\n',
            'data: {"type":"response.completed","response":{"status":"completed"}}\n\n',
          ]),
        );
      } else {
        fetchMock.mockImplementation(async () =>
          sseResponse([
            'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"x"}}\n\n',
            'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n',
            'data: {"type":"message_stop"}\n\n',
          ]),
        );
      }

      await orchestrator.sendMessage({ conversationId: convId, content: 'q' });
      await waitEvent('chat:done');
      const body = lastFetchBody();
      expect(body[offField]).toEqual(offValue);

      // 开启（默认）→ 不含关闭字段
      fetchMock.mockClear();
      conversations.update(convId, { reasoning_enabled: true });
      await orchestrator.sendMessage({ conversationId: convId, content: 'q2' });
      const t0 = Date.now();
      while (events.filter((e) => e.channel === 'chat:done').length < 2 && Date.now() - t0 < 3000) {
        await new Promise((r) => setTimeout(r, 5));
      }
      const body2 = lastFetchBody();
      expect(body2[offField]).toBeUndefined();
    });
  }
});
