/**
 * 生成编排（kimi.md §4.3/§4.4、契约 §5 简化允许）：
 * sendMessage 流程：落库 user 消息（缓存 token_count）→ resolveParams
 * （全局预设 ← 用户预设 ← 会话 overrides）→ trim 裁剪 → 适配层流式 →
 * webContents.send 推送 chat:delta/done/error → 落库 assistant 消息
 * （partial / error / reasoning 语义）。
 *
 * - 单会话单生成锁：同一会话已有进行中生成时拒绝；
 * - stopGeneration：AbortController.abort()，已收内容落库 partial:true；
 * - regenerate：复用既有 user 消息（fromMessageId 或最后一条 user），
 *   删除其后的消息，不产生重复用户消息；
 * - context_overflow='stop' 且超预算：不发请求，直接抛
 *   ApiError{code:'context_overflow'}（渲染进程 toast 三段式）；
 * - 裁剪截断（truncate/truncate_middle 退化）：仅发一条 code='context_truncated'
 *   的 chat:error 警告，不阻断生成（契约 §5 的简化允许）；
 * - 首轮完成后自动生成标题（≤20 max_tokens，尊重 auto_title 设置）：
 *   模型经 shared/title.ts resolveTitleTarget 解析（设置指定的标题模型优先，
 *   否则回退会话当前模型）；每次尝试 20s 超时，失败间隔 800ms 重试 1 次；
 *   成功广播 title:updated（侧栏即时刷新），最终失败广播 title:failed
 *   （渲染进程 toast 警告，不阻断对话）。手动路径 generateTitle() 强制覆盖、
 *   失败直接 reject。
 */
import type { ApiError, ApiFormat, Conversation, Message, ParamValues } from '../shared/types';
import { FACTORY_DEFAULTS, GLOBAL_PRESET_ID, resolveParams } from '../shared/params';
import {
  resolveTitleTarget,
  runWithRetry,
  sanitizeTitle,
  timeoutSignal,
  TITLE_TIMEOUT_MS,
} from '../shared/title';
import { EVT } from '../shared/ipc';
import type { ConversationsDao } from './db/conversations';
import type { MessagesDao } from './db/messages';
import type { ProvidersDao } from './db/providers';
import type { SettingsDao } from './db/settings';
import type { PresetsDao } from './db/presets';
import type { CryptoService } from './crypto';
import { registerSecret } from './crypto/redact';
import { chat as gatewayChat, normalizeError } from './gateway';
import { defaultTokenCounter, trimMessages } from './gateway/trim';
import { GatewayError } from './gateway/errors';
import { logger } from './logger';

const TITLE_PROMPT =
  'Summarize the following user request as a very short conversation title (max 8 words, same language as the request). Reply with the title only, no quotes, no punctuation at the end.\n\n';

export interface OrchestratorDeps {
  conversations: ConversationsDao;
  messages: MessagesDao;
  providers: ProvidersDao;
  settings: SettingsDao;
  presets: PresetsDao;
  crypto: CryptoService;
  /** 事件出口（main.ts 注入 win.webContents.send） */
  send: (channel: string, payload: unknown) => void;
}

export interface SendMessageInput {
  conversationId: string;
  content: string;
  regenerate?: boolean;
  fromMessageId?: string;
}

export class ChatOrchestrator {
  private active = new Map<string, AbortController>();

  constructor(private deps: OrchestratorDeps) {}

  /** 同会话单生成锁（kimi.md §4.4） */
  isGenerating(conversationId: string): boolean {
    return this.active.has(conversationId);
  }

  async sendMessage(
    input: SendMessageInput,
  ): Promise<{ userMessageId: string | null; assistantMessageId: string }> {
    const { conversations, messages, providers } = this.deps;

    const conv = conversations.get(input.conversationId);
    if (!conv) throw new GatewayError('conversation_not_found', 'conversation not found');
    if (this.isGenerating(conv.id)) {
      throw new GatewayError('generation_in_progress', 'generation already in progress');
    }

    // 生效参数 = 全局预设 ← 选中用户预设 ← 会话 overrides（发送前解析）
    const globalParams = this.deps.presets.get(GLOBAL_PRESET_ID)?.params ?? FACTORY_DEFAULTS;
    const preset = conv.preset_id ? this.deps.presets.get(conv.preset_id) : null;
    const params: ParamValues = resolveParams(globalParams, preset, conv.overrides);
    const providerId = conv.provider_id;
    const model = conv.model;
    if (!providerId) throw new GatewayError('no_provider', 'no provider selected');
    if (!model) throw new GatewayError('no_model', 'no model selected');

    const providerRow = providers.getRow(providerId);
    if (!providerRow) throw new GatewayError('provider_not_found', 'provider not found');
    if (!providerRow.api_key_cipher) {
      throw new GatewayError('missing_api_key', 'provider has no api key');
    }
    const apiKey = this.deps.crypto.decryptString(providerRow.api_key_cipher.toString('utf8'));
    registerSecret(apiKey); // 红线：此后日志/错误中该密钥一律脱敏

    // 1) 落库 user 消息（regenerate 复用既有消息，见 kimi.md §4.4 重试语义）
    let userMessageId: string | null = null;
    if (input.regenerate) {
      const anchor = input.fromMessageId
        ? messages.get(input.fromMessageId)
        : messages.lastUserMessage(conv.id);
      if (!anchor) throw new GatewayError('nothing_to_regenerate', 'no user message to regenerate');
      messages.deleteAfter(conv.id, anchor.id);
      userMessageId = anchor.id;
    } else {
      const userMsg = messages.insert({
        conversation_id: conv.id,
        role: 'user',
        content: input.content,
        token_count: defaultTokenCounter(input.content),
      });
      userMessageId = userMsg.id;
    }

    // 2) 组装 + 裁剪（系统提示词为生效参数，非空才注入，kimi.md §4.2）
    const history = messages.list(conv.id);
    const payloadMessages = [
      ...(params.system_prompt.trim().length > 0
        ? [{ role: 'system' as const, content: params.system_prompt }]
        : []),
      ...history
        .filter((m) => !(m.role === 'assistant' && m.error))
        .map((m) => ({ role: m.role, content: m.content, token_count: m.token_count })),
    ];
    const trimmed = trimMessages({
      messages: payloadMessages,
      params: {
        max_tokens: params.max_tokens,
        context_window: params.context_window,
        limit_response_length: params.limit_response_length,
      },
      strategy: params.context_overflow,
      counter: defaultTokenCounter,
    });

    // context_overflow='stop' 且超预算：不发请求（契约 §5 溢出策略）
    if (trimmed.overflow) {
      throw new GatewayError(
        'context_overflow',
        `context ${trimmed.totalTokens} tokens exceeds budget ${trimmed.budget} (strategy=stop)`,
      );
    }

    // 3) assistant 占位消息（流式期间 partial:true，完成后回填）
    const assistant = messages.insert({
      conversation_id: conv.id,
      role: 'assistant',
      content: '',
      partial: true,
      created_at: Date.now() + 1, // 保证排在 user 消息之后
    });
    conversations.touch(conv.id);

    if (trimmed.truncated) {
      // 契约 §5 简化允许：仅警告，不阻断
      this.deps.send(EVT.chatError, {
        conversationId: conv.id,
        messageId: assistant.id,
        error: {
          code: 'context_truncated',
          message: `single message truncated to fit budget ${trimmed.budget} tokens`,
        },
      });
    }

    const controller = new AbortController();
    this.active.set(conv.id, controller);

    // 4) 异步跑生成，立即把消息 id 返回给渲染进程
    void this.run({
      conversationId: conv.id,
      assistantMessageId: assistant.id,
      baseUrl: providerRow.base_url,
      apiFormat: providerRow.api_format,
      apiKey,
      model,
      messages: trimmed.messages,
      params,
      signal: controller.signal,
    });

    return { userMessageId, assistantMessageId: assistant.id };
  }

  stopGeneration(conversationId: string): void {
    this.active.get(conversationId)?.abort();
  }

  private async run(args: RunArgs): Promise<void> {
    const { messages, conversations, settings } = this.deps;
    let content = '';
    let reasoning = '';
    let failed: ApiError | null = null;

    try {
      const gen = gatewayChat({
        baseUrl: args.baseUrl,
        apiFormat: args.apiFormat,
        apiKey: args.apiKey,
        model: args.model,
        messages: args.messages,
        params: args.params,
        stream: args.params.stream,
        signal: args.signal,
      });
      for await (const chunk of gen) {
        if (chunk.error) {
          failed = chunk.error;
          break;
        }
        if (chunk.delta) content += chunk.delta;
        if (chunk.reasoning_delta) reasoning += chunk.reasoning_delta;
        if (chunk.delta || chunk.reasoning_delta) {
          this.deps.send(EVT.chatDelta, {
            conversationId: args.conversationId,
            messageId: args.assistantMessageId,
            delta: chunk.delta ?? '',
            reasoning_delta: chunk.reasoning_delta,
          });
        }
      }
    } catch (e) {
      failed = normalizeError(e);
    } finally {
      this.active.delete(args.conversationId);
    }

    const aborted = args.signal.aborted;
    if (failed && !aborted) {
      // 请求失败：已收内容与错误一并落库（kimi.md §4.4 错误卡片 + 重试语义）
      const updated = messages.update(args.assistantMessageId, {
        content,
        reasoning: reasoning || undefined,
        token_count: content ? defaultTokenCounter(content) : null,
        partial: true,
        error: failed,
      });
      logger.warn('chat generation failed', { code: failed.code, message: failed.message });
      this.deps.send(EVT.chatError, {
        conversationId: args.conversationId,
        messageId: args.assistantMessageId,
        error: failed,
        message: updated ?? undefined,
      });
      return;
    }

    // 成功或被中止（中止时已收内容落库 partial:true）
    const updated = messages.update(args.assistantMessageId, {
      content,
      reasoning: reasoning || undefined,
      token_count: content ? defaultTokenCounter(content) : null,
      partial: aborted,
      error: null,
    });
    conversations.touch(args.conversationId);
    this.deps.send(EVT.chatDone, {
      conversationId: args.conversationId,
      messageId: args.assistantMessageId,
      message: updated,
    });

    // 首轮完成后自动生成标题（kimi.md §7.2）：成功广播 title:updated，
    // 最终失败广播 title:failed（自动路径不阻断对话，详见 generateTitleAuto）
    if (!aborted && content && settings.get().auto_title) {
      const conv = conversations.get(args.conversationId);
      if (conv && conv.title === '') {
        void this.generateTitleAuto(args.conversationId);
      }
    }
  }

  /* ---------------- 会话标题生成 ---------------- */

  /**
   * 手动触发（IPC conversations:generate-title）：强制覆盖现有标题，
   * 忽略 auto_title 开关与 title 是否为空；失败直接 reject 给渲染进程 toast。
   */
  async generateTitle(conversationId: string): Promise<Conversation> {
    const updated = await this.generateTitleCore(conversationId);
    this.deps.send(EVT.titleUpdated, { conversationId, title: updated.title });
    logger.info('manual title generated', { conversationId });
    return updated;
  }

  /** 自动路径（首轮完成后）：失败发 title:failed 事件，绝不向上抛 */
  private async generateTitleAuto(conversationId: string): Promise<void> {
    try {
      const updated = await this.generateTitleCore(conversationId);
      this.deps.send(EVT.titleUpdated, { conversationId, title: updated.title });
      logger.info('auto title generated', { conversationId });
    } catch (e) {
      const err = normalizeError(e);
      logger.warn('auto title failed', { conversationId, code: err.code, message: err.message });
      this.deps.send(EVT.titleFailed, { conversationId, error: err });
    }
  }

  /**
   * 标题生成主流程（自动/手动共用）：
   * resolveTitleTarget 解析模型 → 取 provider + 密钥 → 找首条 user 消息 →
   * 20s 超时 × (首次 + 800ms 间隔重试 1 次) → 清洗 → 落库。
   */
  private async generateTitleCore(conversationId: string): Promise<Conversation> {
    const { conversations, messages, providers, settings } = this.deps;

    const conv = conversations.get(conversationId);
    if (!conv) throw new GatewayError('conversation_not_found', 'conversation not found');

    const target = resolveTitleTarget(settings.get(), conv);
    if (!target) {
      throw new GatewayError(
        'title_model_unavailable',
        'no model available for title generation (settings fallback and conversation model both empty)',
      );
    }
    const providerRow = providers.getRow(target.provider_id);
    if (!providerRow || !providerRow.api_key_cipher) {
      throw new GatewayError(
        'title_model_unavailable',
        'title provider missing or has no api key',
      );
    }
    const apiKey = this.deps.crypto.decryptString(providerRow.api_key_cipher.toString('utf8'));
    registerSecret(apiKey); // 红线：此后日志/错误中该密钥一律脱敏

    const firstUser = messages.list(conversationId).find((m) => m.role === 'user');
    if (!firstUser) {
      throw new GatewayError('title_no_user_message', 'no user message to summarize');
    }

    const title = await runWithRetry(() =>
      this.requestTitle({
        baseUrl: providerRow.base_url,
        apiFormat: providerRow.api_format,
        apiKey,
        model: target.model,
        userContent: firstUser.content,
      }),
    );
    if (!title) throw new GatewayError('title_empty', 'model returned an empty title');

    const updated = conversations.update(conversationId, { title });
    if (!updated) throw new GatewayError('conversation_not_found', 'conversation not found');
    return updated;
  }

  /** 单次尝试：非流式 + 20s 总超时；网关错误（含 chunk.error）一律抛出让重试接管 */
  private async requestTitle(input: {
    baseUrl: string;
    apiFormat: ApiFormat;
    apiKey: string;
    model: string;
    userContent: string;
  }): Promise<string> {
    const { signal, cancel } = timeoutSignal(TITLE_TIMEOUT_MS);
    try {
      let raw = '';
      const gen = gatewayChat({
        baseUrl: input.baseUrl,
        apiFormat: input.apiFormat,
        apiKey: input.apiKey,
        model: input.model,
        messages: [
          { role: 'user', content: TITLE_PROMPT + input.userContent.slice(0, 2000) },
        ],
        params: {
          ...FACTORY_DEFAULTS,
          limit_response_length: true,
          max_tokens: 20,
          structured_output_enabled: false, // 标题生成不受结构化输出约束
          stop_strings: [],
          stream: false,
        },
        stream: false,
        signal,
      });
      for await (const chunk of gen) {
        if (chunk.error) throw new GatewayError(chunk.error.code, chunk.error.message);
        if (chunk.delta) raw += chunk.delta;
      }
      return sanitizeTitle(raw);
    } finally {
      cancel();
    }
  }
}

interface RunArgs {
  conversationId: string;
  assistantMessageId: string;
  baseUrl: string;
  apiFormat: import('../shared/types').ApiFormat;
  apiKey: string;
  model: string;
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  params: ParamValues;
  signal: AbortSignal;
}
