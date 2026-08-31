/**
 * Web 预览 Mock 桥（契约 §6）——完整实现 EasyUiApi，只用 Web API
 * （localStorage / setInterval / crypto.randomUUID），不 import 任何 node 模块。
 * 目的：`npm run dev` 纯浏览器可完整演示 UI。
 *
 * 持久化 key 前缀 easyui_mock_；流式回复用 setInterval 逐段推送内置的
 * 中英双语 Markdown 演示文案（含标题、列表、代码块、表格与 reasoning 段；
 * 同 parent 的第 2 个分支用备用文案，便于目视区分分支切换），
 * 支持 stopGeneration 中断（中断后消息标记 partial:true）。
 *
 * 消息模型（schema v3 契约）：parent_id 树 + 每会话 active_leaf
 * （localStorage 'active_leaves'）。listMessages 返回根 → 激活叶的路径并填充
 * branch 元数据（同 parent 子消息 >1 时）。流式结束回填假但合理的 stats
 * （reasoning_ms / ttft_ms / total_ms / finish_reason:'stop'）；
 * reasoning_enabled=false 的会话不产 reasoning 段。
 *
 * 注意：本阶段全项目允许出现用户可见字符串的地方只有这里的演示常量。
 */
import type {
  ApiFormat,
  BackupFileInfo,
  Conversation,
  EasyUiApi,
  GeneralSettings,
  ImportResult,
  Message,
  MessageStats,
  ModelCheck,
  ParamPreset,
  PresetProvider,
  Provider,
  ProviderDraft,
  ProviderModel,
  UpdateCheckResult,
  UpdateDownloadResult,
  UpdateProgress,
  UpdateState,
} from '@shared/types';
import { DEFAULT_SETTINGS } from '@shared/types';
import {
  applyOverridePatch,
  FACTORY_DEFAULTS,
  GLOBAL_PRESET_ID,
  migrateLegacyParams,
  resolveParams,
  sanitizeParams,
} from '@shared/params';
import { PRESETS } from '@shared/presets';
import { resolveTitleTarget, sanitizeTitle } from '@shared/title';

const PREFIX = 'easyui_mock_';

/* ---------------- 存储辅助 ---------------- */

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* 存储满等异常忽略（mock 尽力而为） */
  }
}

/** 会话读取：旧版（含 params: SessionParams）localStorage 数据自动迁移到 preset_id+overrides */
function loadConversations(): Conversation[] {
  const raw = load<unknown[]>('conversations', []);
  let dirty = false;
  const out = raw.map((c) => {
    const o = c as Record<string, unknown>;
    if (o && typeof o === 'object' && 'params' in o && !('overrides' in o)) {
      dirty = true;
      const m = migrateLegacyParams(
        o.params,
        (o.provider_id as string | null) ?? null,
        (o.model as string | null) ?? null,
      );
      const rest = { ...o };
      delete rest.params;
      return {
        ...rest,
        provider_id: m.provider_id,
        model: m.model,
        preset_id: null,
        overrides: m.overrides,
        reasoning_enabled: true,
      } as unknown as Conversation;
    }
    // schema v3 前的会话补 reasoning_enabled（后端默认 1 = 默认思考）
    if (o && typeof o === 'object' && typeof o.reasoning_enabled !== 'boolean') {
      dirty = true;
      return { ...o, reasoning_enabled: true } as unknown as Conversation;
    }
    return c as Conversation;
  });
  if (dirty) save('conversations', out);
  return out;
}

/** 预设读取：无全局预设时补建行（全局恒在首位） */
function loadPresets(): ParamPreset[] {
  const list = load<ParamPreset[]>('param_presets', []).map((p) => ({
    ...p,
    params: sanitizeParams(p.params),
  }));
  if (!list.some((p) => p.is_global)) {
    const now = Date.now();
    list.unshift({
      id: GLOBAL_PRESET_ID,
      name: 'Global',
      is_global: true,
      params: { ...FACTORY_DEFAULTS },
      created_at: now,
      updated_at: now,
    });
    save('param_presets', list);
  }
  return list.slice().sort((a, b) => Number(b.is_global) - Number(a.is_global) || a.created_at - b.created_at);
}

const uuid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `mock-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

/* ---------------- 消息树（schema v3：parent_id + active_leaf） ---------------- */

/** 读取全部消息；旧数据（无 parent_id 的线性序列）自动迁移为链式树并回写 */
function loadMessages(): Message[] {
  const all = load<Message[]>('messages', []);
  let dirty = false;
  const byConv = new Map<string, Message[]>();
  for (const m of all) {
    if (!('parent_id' in m)) dirty = true;
    const list = byConv.get(m.conversation_id) ?? [];
    list.push(m);
    byConv.set(m.conversation_id, list);
  }
  if (dirty) {
    for (const list of byConv.values()) {
      list.sort((a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id));
      let prev: Message | null = null;
      for (const m of list) {
        if (!('parent_id' in m)) (m as Message).parent_id = prev ? prev.id : null;
        prev = m;
      }
    }
    save('messages', all);
  }
  return all;
}

function convMessages(all: Message[], convId: string): Message[] {
  return all
    .filter((m) => m.conversation_id === convId)
    .sort((a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id));
}

/** 同 parent 的子消息（含 parent=null 的根），按 created_at,id 排序 —— 分支排序的唯一依据 */
function childrenOf(all: Message[], convId: string, parentId: string | null): Message[] {
  return convMessages(all, convId).filter((m) => m.parent_id === parentId);
}

/** 沿"最新子"下潜到最深后代（分叉处取最新子，与契约 switchBranch 语义一致） */
function deepestLeaf(all: Message[], convId: string, id: string): string {
  let cur = id;
  for (;;) {
    const kids = childrenOf(all, convId, cur);
    if (kids.length === 0) return cur;
    cur = kids[kids.length - 1].id;
  }
}

function loadActiveLeaves(): Record<string, string | null> {
  return load<Record<string, string | null>>('active_leaves', {});
}

function getActiveLeaf(all: Message[], convId: string): string | null {
  const stored = loadActiveLeaves()[convId];
  if (stored && all.some((m) => m.id === stored && m.conversation_id === convId)) return stored;
  // active_leaf 为空 = 最新一条消息为叶
  const list = convMessages(all, convId);
  return list.length > 0 ? list[list.length - 1].id : null;
}

function setActiveLeafId(convId: string, leafId: string | null): void {
  const map = loadActiveLeaves();
  map[convId] = leafId;
  save('active_leaves', map);
}

/**
 * 解析激活路径：根 → 激活叶（沿 parent_id 上溯后反转），并为路径上
 * 有同级分支的消息填充 branch 元数据（index 从 1 起，ids 按排序序）。
 */
function resolvePath(convId: string): Message[] {
  const all = loadMessages();
  const leaf = getActiveLeaf(all, convId);
  if (!leaf) return [];
  const byId = new Map(all.map((m) => [m.id, m]));
  const chain: Message[] = [];
  let cur: Message | undefined = byId.get(leaf);
  while (cur && cur.conversation_id === convId) {
    chain.unshift(cur);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return chain.map((m) => {
    const siblings = childrenOf(all, convId, m.parent_id);
    if (siblings.length <= 1) {
      const { branch: _drop, ...rest } = m;
      return rest as Message;
    }
    const idx = siblings.findIndex((s) => s.id === m.id);
    return {
      ...m,
      branch: { index: idx + 1, count: siblings.length, ids: siblings.map((s) => s.id) },
    };
  });
}

/* ---------------- 事件总线 ---------------- */

type Cb<T> = (payload: T) => void;

function createEvent<T>() {
  const listeners = new Set<Cb<T>>();
  return {
    on(cb: Cb<T>): () => void {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    emit(payload: T): void {
      for (const cb of [...listeners]) {
        try {
          cb(payload);
        } catch {
          /* 单个订阅者异常不影响其它订阅者 */
        }
      }
    },
  };
}

const chatDeltaEvent = createEvent<{
  conversationId: string;
  messageId: string;
  delta: string;
  reasoning_delta?: string;
}>();
const chatDoneEvent = createEvent<{
  conversationId: string;
  messageId: string;
  message: Message;
}>();
const chatErrorEvent = createEvent<{
  conversationId: string;
  messageId: string;
  error: { code: string; message: string };
}>();
const modelCheckEvent = createEvent<{
  providerId: string;
  modelId: string;
  check: ModelCheck;
}>();
const titleUpdatedEvent = createEvent<{ conversationId: string; title: string }>();
const titleFailedEvent = createEvent<{
  conversationId: string;
  error: { code: string; message: string };
}>();
const updateProgressEvent = createEvent<UpdateProgress>();

/* ---------------- 标题生成（mock：延迟 600ms，据首条 user 消息演示生成） ---------------- */

function loadSettings(): GeneralSettings {
  return { ...DEFAULT_SETTINGS, ...load<Partial<GeneralSettings>>('settings', {}) };
}

/**
 * 与主进程 generateTitleCore 同语义：resolveTitleTarget 解析模型
 * （设置指定优先 → 会话模型回退；都无 → title_model_unavailable），
 * 成功落库并广播 titleUpdated；失败抛错由调用方决定 reject 还是转 titleFailed。
 */
async function mockGenerateTitle(conversationId: string): Promise<Conversation> {
  const conv = loadConversations().find((c) => c.id === conversationId);
  if (!conv) throw new Error('conversation_not_found');
  const target = resolveTitleTarget(loadSettings(), conv);
  if (!target) throw new Error('title_model_unavailable');
  await delay(600);
  const firstUser = load<Message[]>('messages', []).find(
    (m) => m.conversation_id === conversationId && m.role === 'user',
  );
  if (!firstUser) throw new Error('title_no_user_message');
  const title = sanitizeTitle(
    firstUser.content.length > 24 ? `${firstUser.content.slice(0, 24)}…` : firstUser.content,
  );
  if (!title) throw new Error('title_empty');
  const fresh = loadConversations();
  const idx = fresh.findIndex((c) => c.id === conversationId);
  if (idx === -1) throw new Error('conversation_not_found');
  fresh[idx] = { ...fresh[idx], title, updated_at: Date.now() };
  save('conversations', fresh);
  titleUpdatedEvent.emit({ conversationId, title });
  return fresh[idx];
}

/* ---------------- 演示回复（本阶段唯一允许的用户可见字符串常量） ---------------- */

const DEMO_REASONING_ZH = `用户想要一个流式输出的演示。我需要展示 Markdown 的多种元素：标题、列表、代码块和表格，并确认流式渲染与中断都工作正常。回复应当足够长，便于观察滚动与节流效果。`;

const DEMO_BODY_ZH = `## Easy WebUI 演示回复

这是一条通过 **Mock 桥** 生成的流式消息，用于验证渲染管线：

- 支持 *Markdown* 增量渲染
- 支持代码块高亮与复制
- 支持表格（GFM）
- 支持点击"停止"中断生成

\`\`\`ts
// 示例代码块
function greet(name: string): string {
  return \`你好，\${name}！\`;
}
\`\`\`

| 能力 | 状态 |
| --- | --- |
| 流式输出 | ✅ |
| 上下文裁剪 | ✅ |
| 密钥加密 | ✅ |

如果一切正常，你应该看到这些文字逐段出现，而不是一次性显示。`;

const DEMO_REASONING_EN = `The user asked for a streaming demo. I should showcase several Markdown elements — heading, list, code block, table — and make the reply long enough to observe incremental rendering, throttling and the stop button.`;

const DEMO_BODY_EN = `## Easy WebUI demo reply

This message is streamed by the **mock bridge** to exercise the rendering pipeline:

- Incremental *Markdown* rendering
- Code blocks with highlighting and copy
- Tables (GFM)
- A working "stop" button that truncates the stream

\`\`\`ts
// sample code block
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
\`\`\`

| Capability | Status |
| --- | --- |
| Streaming output | ✅ |
| Context trimming | ✅ |
| Key encryption | ✅ |

If everything works, you should see this text appear chunk by chunk instead of all at once.`;

const DEMO_BODY_ZH_ALT = `## 演示回复（分支 B）

这是同一问题的**另一条分支**回复（mock 变体文案），用于验证分支切换：

- 分支导航器显示 ‹ n/N ›
- 切换时内容区淡入刷新
- 统计行（tok/s、TTFT、总用时）随分支各自独立

> 若你看到这里，说明当前激活的是第 2 条分支。`;

const DEMO_BODY_EN_ALT = `## Demo reply (branch B)

This is an **alternate branch** of the answer (mock variant copy), used to verify branch switching:

- The branch navigator shows ‹ n/N ›
- Switching fades the content area in
- The stats row (tok/s, TTFT, total) is tracked per branch

> Seeing this means branch 2 is currently active.`;

function currentLang(): 'zh-CN' | 'en-US' {
  // 与 index.html 启动脚本同一数据源：cookie 优先，异常回退 localStorage
  try {
    const m = document.cookie.match(/(?:^|;\s*)easyui_prefs=([^;]*)/);
    if (m) {
      const prefs = JSON.parse(decodeURIComponent(m[1])) as { lang?: string };
      if (prefs.lang === 'en-US') return 'en-US';
      if (prefs.lang === 'zh-CN') return 'zh-CN';
    }
  } catch {
    /* 回退 */
  }
  try {
    const raw = localStorage.getItem('easyui_prefs');
    if (raw) {
      const prefs = JSON.parse(raw) as { lang?: string };
      if (prefs.lang === 'en-US') return 'en-US';
    }
  } catch {
    /* ignore */
  }
  return 'zh-CN';
}

/** variant：同 parent 下第 2/4/… 个 assistant 分支用备用文案（分支切换可目视区分） */
function pickDemo(variant = 0): { reasoning: string; body: string } {
  const en = currentLang() === 'en-US';
  if (en) return { reasoning: DEMO_REASONING_EN, body: variant % 2 === 1 ? DEMO_BODY_EN_ALT : DEMO_BODY_EN };
  return { reasoning: DEMO_REASONING_ZH, body: variant % 2 === 1 ? DEMO_BODY_ZH_ALT : DEMO_BODY_ZH };
}

function chunkText(text: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

/* ---------------- mock 平台内部形状（多存一个假 key 以演示 has_key） ---------------- */

interface MockProvider extends Provider {
  api_key?: string;
}

function stripProvider(p: MockProvider): Provider {
  const { api_key: _ignored, ...rest } = p;
  return rest;
}

const FAKE_MODELS: Record<ApiFormat, string[]> = {
  'openai-chat': ['gpt-4o', 'gpt-4o-mini', 'o1-mini', 'deepseek-chat'],
  'openai-responses': ['gpt-4.1', 'gpt-4.1-mini', 'o4-mini'],
  anthropic: ['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-haiku-4-5'],
};

/* ---------------- 进行中的生成（stopGeneration 用） ---------------- */

interface ActiveGen {
  stop: () => void;
}
const activeGenerations = new Map<string, ActiveGen>();

/* ---------------- 流式生成引擎（40ms/段，可测试节奏；stats 回填见 finish） ---------------- */

/** 单调时间戳：保证 created_at 严格递增（同毫秒多条消息时排序即插入序） */
let tsFloor = 0;
function tick(): number {
  tsFloor = Math.max(tsFloor + 1, Date.now());
  return tsFloor;
}

function newAssistantPlaceholder(convId: string, parentId: string | null): Message {
  return {
    id: uuid(),
    conversation_id: convId,
    parent_id: parentId,
    role: 'assistant',
    content: '',
    reasoning: '',
    token_count: null,
    partial: true,
    error: null,
    created_at: tick(),
  };
}

/**
 * 一次生成运行：reasoning 段 → content 段（reasoning_enabled=false 时跳过 reasoning），
 * 结束/中断时把内容与假但合理的 stats 落库并广播 chatDone。
 * append=true（continue 续写）：delta 追加到同一消息，total_ms/token_count 累计，
 * finish_reason 取最后一次运行，ttft 保留首次运行的值。
 */
function startGenerationRun(
  conv: Conversation,
  assistantId: string,
  opts: { variant: number; append?: boolean },
): void {
  const demo = pickDemo(opts.variant);
  const withReasoning = conv.reasoning_enabled !== false;
  const reasoningChunks = withReasoning ? chunkText(demo.reasoning, 14) : [];
  const bodyChunks = chunkText(demo.body, 10);
  let ri = 0;
  let ci = 0;
  const t0 = Date.now();
  let firstDeltaAt: number | null = null;
  let firstReasoningAt: number | null = null;
  let firstContentAt: number | null = null;
  let accReasoning = ''; // 本轮新增（不含既有内容）
  let accContent = '';

  const finish = (stopped: boolean): void => {
    activeGenerations.delete(conv.id);
    clearInterval(timer);
    const end = Date.now();
    const all = loadMessages();
    const stored = all.find((m) => m.id === assistantId);
    // 生成进行中消息被删除（多选删/子树连删）：静默收尾，不再广播 done
    if (!stored) return;

    const runReasoningMs =
      withReasoning && firstReasoningAt !== null
        ? Math.max((firstContentAt ?? end) - firstReasoningAt, 1)
        : undefined;
    const runTtft = Math.max((firstDeltaAt ?? end) - t0, 1);
    const runTotal = Math.max(end - t0, 1);
    const prior = stored.stats ?? {};
    const reasoningMs = opts.append
      ? ((prior.reasoning_ms ?? 0) + (runReasoningMs ?? 0) || undefined)
      : runReasoningMs;
    const stats: MessageStats = {
      reasoning_ms: reasoningMs,
      ttft_ms: opts.append ? (prior.ttft_ms ?? runTtft) : runTtft,
      total_ms: (opts.append ? (prior.total_ms ?? 0) : 0) + runTotal,
      finish_reason: stopped ? undefined : 'stop',
    };

    const nextContent = opts.append ? stored.content + accContent : accContent;
    const nextReasoning = opts.append
      ? (stored.reasoning ?? '') + accReasoning
      : accReasoning;
    stored.content = nextContent;
    stored.reasoning = nextReasoning;
    stored.partial = stopped;
    stored.token_count =
      (opts.append ? (stored.token_count ?? 0) : 0) + estimateTokens(accContent);
    stored.stats = stats;
    save('messages', all);

    const convs = loadConversations();
    const c = convs.find((x) => x.id === conv.id);
    if (c) {
      c.updated_at = Date.now();
      save('conversations', convs);
    }
    chatDoneEvent.emit({
      conversationId: conv.id,
      messageId: assistantId,
      message: { ...stored },
    });
    // 自动标题（与主进程同语义）：auto_title 开 + 标题为空 + 未中断 →
    // 异步生成并广播 title:updated；失败转 title:failed（不阻断对话）
    if (!stopped && !opts.append && c && c.title === '' && loadSettings().auto_title) {
      void mockGenerateTitle(conv.id).catch((e: unknown) => {
        const err = e as Partial<Error>;
        titleFailedEvent.emit({
          conversationId: conv.id,
          error: {
            code: err?.message ?? 'request_failed',
            message: err?.message ?? String(e),
          },
        });
      });
    }
  };

  const timer = setInterval(() => {
    if (ri < reasoningChunks.length) {
      const d = reasoningChunks[ri++];
      const now = Date.now();
      if (firstDeltaAt === null) firstDeltaAt = now;
      if (firstReasoningAt === null) firstReasoningAt = now;
      accReasoning += d;
      chatDeltaEvent.emit({
        conversationId: conv.id,
        messageId: assistantId,
        delta: '',
        reasoning_delta: d,
      });
      return;
    }
    if (ci < bodyChunks.length) {
      const d = bodyChunks[ci++];
      const now = Date.now();
      if (firstDeltaAt === null) firstDeltaAt = now;
      if (firstContentAt === null) firstContentAt = now;
      accContent += d;
      chatDeltaEvent.emit({ conversationId: conv.id, messageId: assistantId, delta: d });
      return;
    }
    finish(false);
  }, 40);

  activeGenerations.set(conv.id, { stop: () => finish(true) });
}

/* ---------------- EasyUiApi 实现 ---------------- */

export const mockApi: EasyUiApi = {
  /* —— 平台管理 —— */

  async listProviders(): Promise<Provider[]> {
    return load<MockProvider[]>('providers', []).map(stripProvider);
  },

  async createProvider(draft: ProviderDraft): Promise<Provider> {
    const providers = load<MockProvider[]>('providers', []);
    const now = Date.now();
    const provider: MockProvider = {
      id: uuid(),
      name: draft.name,
      base_url: draft.base_url.replace(/\/+$/, ''),
      api_format: draft.api_format,
      has_key: !!draft.api_key,
      api_key: draft.api_key,
      models: [],
      created_at: now,
      updated_at: now,
    };
    providers.push(provider);
    save('providers', providers);
    return stripProvider(provider);
  },

  async updateProvider(id, patch) {
    const providers = load<MockProvider[]>('providers', []);
    const idx = providers.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error('provider_not_found');
    const current = providers[idx];
    const next: MockProvider = {
      ...current,
      name: patch.name ?? current.name,
      base_url:
        patch.base_url != null ? patch.base_url.replace(/\/+$/, '') : current.base_url,
      api_format: patch.api_format ?? current.api_format,
      models: (patch.models as ProviderModel[] | undefined) ?? current.models,
      updated_at: Date.now(),
    };
    if (patch.api_key !== undefined) {
      next.api_key = patch.api_key === '' ? undefined : patch.api_key;
      next.has_key = patch.api_key !== '';
    }
    providers[idx] = next;
    save('providers', providers);
    return stripProvider(next);
  },

  async deleteProvider(id) {
    const providers = load<MockProvider[]>('providers', []);
    const conversations = loadConversations();
    const affected = conversations.filter((c) => c.provider_id === id).length;
    save(
      'providers',
      providers.filter((p) => p.id !== id),
    );
    save(
      'conversations',
      conversations.map((c) => (c.provider_id === id ? { ...c, provider_id: null } : c)),
    );
    return { affectedConversations: affected };
  },

  async getPresets(): Promise<PresetProvider[]> {
    return [...PRESETS];
  },

  async fetchModels(input) {
    await delay(400 + Math.random() * 400);
    let format: ApiFormat = 'openai-chat';
    if (input.draft) {
      format = input.draft.api_format;
    } else if (input.providerId) {
      format =
        load<MockProvider[]>('providers', []).find((p) => p.id === input.providerId)
          ?.api_format ?? 'openai-chat';
    }
    return FAKE_MODELS[format];
  },

  async testModel(providerId, modelId) {
    await delay(300 + Math.random() * 600);
    const ok = Math.random() < 0.9;
    const check: ModelCheck = ok
      ? { status: 'ok', latency_ms: Math.round(120 + Math.random() * 400), checked_at: Date.now() }
      : { status: 'fail', checked_at: Date.now(), error: 'mock: simulated failure (HTTP 401)' };
    // 持久化 last_check
    const providers = load<MockProvider[]>('providers', []);
    const p = providers.find((x) => x.id === providerId);
    if (p) {
      p.models = p.models.map((m) => (m.id === modelId ? { ...m, last_check: check } : m));
      save('providers', providers);
    }
    return check;
  },

  async testAllModels(providerId) {
    const provider = load<MockProvider[]>('providers', []).find((p) => p.id === providerId);
    if (!provider) throw new Error('provider_not_found');
    for (const m of provider.models.filter((x) => x.enabled)) {
      const check = await this.testModel(providerId, m.id);
      modelCheckEvent.emit({ providerId, modelId: m.id, check });
    }
  },

  async detectFormat(input) {
    await delay(400);
    return input.base_url.includes('anthropic') ? 'anthropic' : 'openai-chat';
  },

  /* —— 会话与消息 —— */

  async listConversations() {
    return loadConversations()
      .slice()
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at - a.updated_at);
  },

  async createConversation() {
    const conversations = loadConversations();
    const now = Date.now();
    const conv: Conversation = {
      id: uuid(),
      title: '',
      provider_id: null,
      model: null,
      preset_id: null,
      overrides: {},
      pinned: false,
      reasoning_enabled: true,
      created_at: now,
      updated_at: now,
    };
    conversations.push(conv);
    save('conversations', conversations);
    return conv;
  },

  async updateConversation(id, patch) {
    const conversations = loadConversations();
    const idx = conversations.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error('conversation_not_found');
    const current = conversations[idx];

    // preset_id：undefined=不变；null=全局预设；否则必须存在
    const presetId = patch.preset_id === undefined ? current.preset_id : patch.preset_id;
    if (presetId !== null && !loadPresets().some((p) => p.id === presetId)) {
      throw new Error('preset_not_found');
    }

    // params patch = overrides 合并 + 等值修剪（与主进程同一套 shared 函数）
    let overrides = current.overrides;
    if (patch.params) {
      const presets = loadPresets();
      const globalParams = presets.find((p) => p.is_global)?.params ?? FACTORY_DEFAULTS;
      const preset = presetId ? (presets.find((p) => p.id === presetId) ?? null) : null;
      const base = resolveParams(globalParams, preset, {});
      overrides = applyOverridePatch(base, current.overrides, patch.params);
    }

    const next: Conversation = {
      ...current,
      title: patch.title ?? current.title,
      pinned: patch.pinned ?? current.pinned,
      provider_id: patch.provider_id === undefined ? current.provider_id : patch.provider_id,
      model: patch.model === undefined ? current.model : patch.model,
      preset_id: presetId,
      reasoning_enabled:
        patch.reasoning_enabled === undefined ? current.reasoning_enabled : patch.reasoning_enabled,
      overrides,
      updated_at: Date.now(),
    };
    conversations[idx] = next;
    save('conversations', conversations);
    return next;
  },

  async deleteConversation(id) {
    save(
      'conversations',
      loadConversations().filter((c) => c.id !== id),
    );
    save(
      'messages',
      loadMessages().filter((m) => m.conversation_id !== id),
    );
    const leaves = loadActiveLeaves();
    if (id in leaves) {
      delete leaves[id];
      save('active_leaves', leaves);
    }
  },

  async listMessages(conversationId) {
    return resolvePath(conversationId);
  },

  async switchBranch(input) {
    const all = loadMessages();
    const target = all.find(
      (m) => m.id === input.messageId && m.conversation_id === input.conversationId,
    );
    if (!target) throw new Error('message_not_found');
    // 激活叶切到目标分支最深后代（分叉处取最新子）
    setActiveLeafId(input.conversationId, deepestLeaf(all, input.conversationId, target.id));
    return resolvePath(input.conversationId);
  },

  async setActiveLeaf(input) {
    const all = loadMessages();
    const target = all.find(
      (m) => m.id === input.messageId && m.conversation_id === input.conversationId,
    );
    if (!target) throw new Error('message_not_found');
    setActiveLeafId(input.conversationId, target.id);
    return resolvePath(input.conversationId);
  },

  async updateMessageContent(input) {
    const all = loadMessages();
    const target = all.find(
      (m) => m.id === input.messageId && m.conversation_id === input.conversationId,
    );
    if (!target) throw new Error('message_not_found');
    target.content = input.content;
    target.token_count = estimateTokens(input.content);
    save('messages', all);
    return { ...target };
  },

  async deleteMessages(input) {
    const all = loadMessages();
    const convId = input.conversationId;
    const byId = new Map(all.map((m) => [m.id, m]));
    // 收集各目标节点的整棵子树
    const doomed = new Set<string>();
    const collect = (id: string): void => {
      if (doomed.has(id)) return;
      doomed.add(id);
      for (const m of all) {
        if (m.conversation_id === convId && m.parent_id === id) collect(m.id);
      }
    };
    let survivorAnc: string | null = null;
    for (const id of input.ids) {
      const node = byId.get(id);
      if (!node || node.conversation_id !== convId) continue;
      // 激活叶回退点：被删节点的最近存活祖先（多目标任取其一，UI 删除入口同层）
      let anc = node.parent_id;
      while (anc) {
        if (!doomed.has(anc) && !input.ids.includes(anc)) break;
        anc = byId.get(anc)?.parent_id ?? null;
      }
      if (anc) survivorAnc = anc;
      collect(id);
    }
    const remaining = all.filter((m) => !doomed.has(m.id));
    save('messages', remaining);
    // 激活叶在被删子树内时：回退到存活祖先后，沿"最新子"下钻到剩余分支的最深后代
    // （与 DAO deleteWithDescendants 同语义；下钻必须用删完后的剩余集合）
    const leaf = loadActiveLeaves()[convId];
    if (leaf && doomed.has(leaf)) {
      setActiveLeafId(convId, survivorAnc ? deepestLeaf(remaining, convId, survivorAnc) : null);
    }
    return resolvePath(convId);
  },

  /* —— 参数预设 —— */

  async listParamPresets() {
    return loadPresets();
  },

  async createParamPreset(input) {
    const presets = loadPresets();
    const now = Date.now();
    const preset: ParamPreset = {
      id: uuid(),
      name: input.name,
      is_global: false,
      params: sanitizeParams(input.params),
      created_at: now,
      updated_at: now,
    };
    presets.push(preset);
    save('param_presets', presets);
    return preset;
  },

  async updateParamPreset(id, patch) {
    const presets = loadPresets();
    const idx = presets.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error('preset_not_found');
    const current = presets[idx];
    // 全局预设只允许改 params
    if (current.is_global && patch.name !== undefined && patch.name !== current.name) {
      throw new Error('global_preset_readonly');
    }
    const next: ParamPreset = {
      ...current,
      name: current.is_global ? current.name : (patch.name ?? current.name),
      params: patch.params ? sanitizeParams(patch.params) : current.params,
      updated_at: Date.now(),
    };
    presets[idx] = next;
    save('param_presets', presets);
    return next;
  },

  async deleteParamPreset(id) {
    const presets = loadPresets();
    const target = presets.find((p) => p.id === id);
    if (!target) throw new Error('preset_not_found');
    if (target.is_global) throw new Error('global_preset_readonly');
    save(
      'param_presets',
      presets.filter((p) => p.id !== id),
    );
    // 引用它的会话 preset_id 置 null
    save(
      'conversations',
      loadConversations().map((c) => (c.preset_id === id ? { ...c, preset_id: null } : c)),
    );
  },

  async resetGlobalPreset() {
    const presets = loadPresets();
    const idx = presets.findIndex((p) => p.is_global);
    const next: ParamPreset = {
      ...presets[idx],
      params: { ...FACTORY_DEFAULTS },
      updated_at: Date.now(),
    };
    presets[idx] = next;
    save('param_presets', presets);
    return next;
  },

  /* —— 对话生成（树形分支模型，schema v3） —— */

  async sendMessage(input) {
    const conversations = loadConversations();
    const conv = conversations.find((c) => c.id === input.conversationId);
    if (!conv) throw new Error('conversation_not_found');
    if (activeGenerations.has(conv.id)) throw new Error('generation_in_progress');

    const all = loadMessages();
    let parentId: string | null;
    if (input.siblingOf) {
      const sib = all.find((m) => m.id === input.siblingOf && m.conversation_id === conv.id);
      if (!sib) throw new Error('message_not_found');
      // 以 siblingOf 的同级分支身份插入（parent = 该消息的 parent_id）
      parentId = sib.parent_id;
    } else {
      // 缺省：parent = 当前激活叶（branch 按钮 setActiveLeaf 的落点）
      parentId = getActiveLeaf(all, conv.id);
    }

    const userMsg: Message = {
      id: uuid(),
      conversation_id: conv.id,
      parent_id: parentId,
      role: 'user',
      content: input.content,
      token_count: estimateTokens(input.content),
      partial: false,
      error: null,
      created_at: tick(),
    };
    const assistant = newAssistantPlaceholder(conv.id, userMsg.id);
    all.push(userMsg, assistant);
    save('messages', all);
    setActiveLeafId(conv.id, assistant.id);

    startGenerationRun(conv, assistant.id, { variant: 0 });
    return { userMessageId: userMsg.id, assistantMessageId: assistant.id };
  },

  async regenerateMessage(input) {
    const conversations = loadConversations();
    const conv = conversations.find((c) => c.id === input.conversationId);
    if (!conv) throw new Error('conversation_not_found');
    if (activeGenerations.has(conv.id)) throw new Error('generation_in_progress');
    const all = loadMessages();
    const target = all.find((m) => m.id === input.messageId && m.conversation_id === conv.id);
    if (!target || target.role !== 'assistant') throw new Error('nothing_to_regenerate');
    // 新同级分支：变体按现有同级数量轮换（第 2 条分支 → 备用文案）
    const variant = childrenOf(all, conv.id, target.parent_id).length % 2;
    const assistant = newAssistantPlaceholder(conv.id, target.parent_id);
    all.push(assistant);
    save('messages', all);
    setActiveLeafId(conv.id, assistant.id);
    startGenerationRun(conv, assistant.id, { variant });
    return { assistantMessageId: assistant.id };
  },

  async continueMessage(input) {
    const conversations = loadConversations();
    const conv = conversations.find((c) => c.id === input.conversationId);
    if (!conv) throw new Error('conversation_not_found');
    if (activeGenerations.has(conv.id)) throw new Error('generation_in_progress');
    const all = loadMessages();
    const target = all.find((m) => m.id === input.messageId && m.conversation_id === conv.id);
    if (!target || target.role !== 'assistant') throw new Error('nothing_to_continue');
    // 续写：同一气泡追加（variant 与该分支自身序号一致，保持文案同源）
    const idx = childrenOf(all, conv.id, target.parent_id).findIndex((m) => m.id === target.id);
    startGenerationRun(conv, target.id, { variant: Math.max(idx, 0) % 2, append: true });
  },

  async generateResponse(input) {
    const conversations = loadConversations();
    const conv = conversations.find((c) => c.id === input.conversationId);
    if (!conv) throw new Error('conversation_not_found');
    if (activeGenerations.has(conv.id)) throw new Error('generation_in_progress');
    const all = loadMessages();
    const leafId = getActiveLeaf(all, conv.id);
    const leaf = leafId ? all.find((m) => m.id === leafId) : undefined;
    if (!leaf || leaf.role !== 'user') throw new Error('nothing_to_generate');
    const variant = childrenOf(all, conv.id, leaf.id).length % 2;
    const assistant = newAssistantPlaceholder(conv.id, leaf.id);
    all.push(assistant);
    save('messages', all);
    setActiveLeafId(conv.id, assistant.id);
    startGenerationRun(conv, assistant.id, { variant });
    return { assistantMessageId: assistant.id };
  },

  async stopGeneration(conversationId) {
    activeGenerations.get(conversationId)?.stop();
  },

  onChatDelta: (cb) => chatDeltaEvent.on(cb),
  onChatDone: (cb) => chatDoneEvent.on(cb),
  onChatError: (cb) => chatErrorEvent.on(cb),
  onModelCheck: (cb) => modelCheckEvent.on(cb),

  /** 手动 ✨：强制覆盖现有标题，忽略 auto_title；失败直接 reject（UI toast） */
  async generateTitle(conversationId) {
    return mockGenerateTitle(conversationId);
  },
  onTitleUpdated: (cb) => titleUpdatedEvent.on(cb),
  onTitleFailed: (cb) => titleFailedEvent.on(cb),

  /* —— 通用设置 / 系统信息 —— */

  async getSettings(): Promise<GeneralSettings> {
    return loadSettings();
  },

  async setSettings(patch) {
    const next = { ...(await this.getSettings()), ...patch };
    save('settings', next);
    return next;
  },

  async getSystemInfo() {
    return {
      dataPath: 'web-preview (localStorage)',
      dataPathSource: 'default' as const,
      isPortable: false,
      isElectron: false,
      version: '0.1.1-web-mock',
      encryption: { method: 'machine-fallback' as const, available: false },
      platform: 'web',
    };
  },

  /* —— 数据目录 / 系统动作（Electron 独占；web mock 为桩） —— */

  async pickDataDir() {
    return null;
  },

  async setDataDir() {
    throw new Error('electron_only');
  },

  async relaunchApp() {
    /* web mock：no-op */
  },

  async openExternal(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer');
  },

  /* —— 在线升级（web mock 演示） ——
   * 演示开关：localStorage['easyui_mock_update'] = '1' 时模拟「发现新版本 0.2.0」，
   * updateDownload 以 100ms/10% 推送进度；否则一律 unavailable/web_preview（兜底，
   * web 预览下升级卡片本就禁用）。 */

  async updateCheck(): Promise<UpdateCheckResult> {
    await delay(300);
    try {
      if (localStorage.getItem(PREFIX + 'update') === '1') {
        return {
          status: 'available',
          info: {
            version: '0.2.0',
            release_notes: [
              'Easy WebUI 0.2.0（web mock 演示更新说明）',
              '',
              '新功能：',
              '- 关于页与在线升级前端（本页）',
              '- 数据目录自定义与迁移流程',
              '- 会话列表性能优化',
              '',
              '修复：',
              '- 修复流式中断后偶发的消息状态未落地',
              '- 修复深色主题下代码块对比度不足',
              '- 修复缩放 150% 时设置页底部留白',
              '',
              '改进：',
              '- 标题生成超时从 10s 提升到 20s 并重试一次',
              '- 备份清单加入应用版本与 schema 版本',
              '- 缩短冷启动时的设置加载耗时',
            ].join('\n'),
            published_at: new Date().toISOString(),
            size: 128319488,
          },
        };
      }
    } catch {
      /* localStorage 不可用按未开启处理 */
    }
    return { status: 'unavailable', reason: 'web_preview' };
  },

  async updateDownload(): Promise<UpdateDownloadResult> {
    let enabled = false;
    try {
      enabled = localStorage.getItem(PREFIX + 'update') === '1';
    } catch {
      /* ignore */
    }
    if (!enabled) throw new Error('web_preview');
    const total = 128319488;
    let percent = 0;
    await new Promise<void>((resolve) => {
      const timer = setInterval(() => {
        percent = Math.min(100, percent + 10);
        updateProgressEvent.emit({
          percent,
          transferred: Math.round((total * percent) / 100),
          total,
        });
        if (percent >= 100) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
    return { verified: true };
  },

  async updateInstall() {
    /* web mock：无后续（真实实现将退出应用） */
  },

  /* web mock 无持久升级状态：About 页挂载同步恒 idle；update:available 事件在 web 不广播 */
  async updateGetState(): Promise<UpdateState> {
    return { phase: 'idle' };
  },

  onUpdateProgress: (cb) => updateProgressEvent.on(cb),
  onUpdateAvailable: () => () => undefined,

  /* —— 备份（桩） —— */

  async listBackups(): Promise<BackupFileInfo[]> {
    return [];
  },

  async createBackup(input): Promise<BackupFileInfo> {
    await delay(300);
    return {
      filename: 'easyui-backup-webmock.zip',
      path: '(web mock, no file written)',
      size: 0,
      created_at: Date.now(),
      includes_keys: input.includeKeys,
    };
  },

  async restoreBackup(): Promise<ImportResult> {
    await delay(300);
    return { providers: 0, conversations: 0, messages: 0, presets: 0, skipped: 0 };
  },

  async deleteBackup() {
    /* 桩：无操作 */
  },

  async openBackupsDir() {
    /* 桩：无操作 */
  },

  async pickBackupFile() {
    return null;
  },
};
