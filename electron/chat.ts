/**
 * 生成编排（prd.md §4.3/§4.4、契约 §5 简化允许）—— 树形分支模型（schema v3）。
 *
 * 入口语义（全部共用 resolveGenerationTarget / assemblePayload / run 管线）：
 * - sendMessage：user 消息 parent = siblingOf 的 parent_id（校验同会话）或当前激活叶；
 *   assistant 占位为其子，active_leaf 切到 assistant；
 * - regenerateMessage：目标必须是 assistant；在其 parent 下新建同级 assistant 占位
 *   （新分支，旧分支不删），active_leaf 切到新分支；
 * - continueMessage：目标 assistant 且无进行中生成；请求历史 = 根到其 parent 的路径
 *   + {role:'assistant', content: 现有内容}（让模型续写）；delta 追加到同一消息
 *   （chat:delta 的 messageId 不变），结束时 content=旧+新、total_ms 累加、
 *   token_count 重计总内容、finish_reason 取本次；
 * - generateResponse：激活叶必须是 user（否则 nothing_to_generate），等价于在叶下
 *   插 assistant 占位并开跑。
 *
 * 横切语义（保持既有行为）：
 * - 单会话单生成锁；stopGeneration abort，已收内容落库 partial:true；
 * - context_overflow='stop' 且超预算：不发请求，抛 ApiError{code:'context_overflow'}；
 *   裁剪截断仅发 context_truncated 警告，不阻断；
 * - reasoning：conv.reasoning_enabled=false 时请求体混入 reasoningOffPayload(apiFormat)
 *   （经 AdapterChatInput.reasoningOff 传到三个适配器各自 merge）；true 时不附加参数；
 * - 计时：t0=请求发出前；首 delta（content 或 reasoning 先到）→ ttft_ms（非流式=total_ms）；
 *   全程有 reasoning 时 reasoning_ms = 首 content delta（或流结束）− t0；
 *   total_ms = 流结束/中止/失败 − t0；中止/失败同样落库已测得时间；
 * - 首轮完成后自动生成标题（基于激活路径首条 user 消息；自动/手动语义见下方函数）。
 */
import type { ApiError, ApiFormat, Conversation, Message, MessageStats, ParamValues } from '../shared/types';
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
import { defaultTokenCounter, trimMessages, type TrimResult } from './gateway/trim';
import { GatewayError } from './gateway/errors';
import type { ProviderRow } from './db/providers';
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
  /** 以指定消息的同级分支身份插入（parent = 其 parent_id）；缺省 = 当前激活叶 */
  siblingOf?: string;
}

export interface MessageAnchorInput {
  conversationId: string;
  messageId: string;
}

/** 生成目标解析结果：生效参数 + provider + 明文密钥 + 模型 */
interface GenerationTarget {
  params: ParamValues;
  providerRow: ProviderRow;
  apiKey: string;
  model: string;
}

export class ChatOrchestrator {
  private active = new Map<string, AbortController>();

  constructor(private deps: OrchestratorDeps) {}

  /** 同会话单生成锁（prd.md §4.4） */
  isGenerating(conversationId: string): boolean {
    return this.active.has(conversationId);
  }

  /* ---------------- 入口 ---------------- */

  async sendMessage(
    input: SendMessageInput,
  ): Promise<{ userMessageId: string | null; assistantMessageId: string }> {
    const { conversations, messages } = this.deps;
    const conv = this.requireConversation(input.conversationId);
    const target = this.resolveGenerationTarget(conv);

    // user 消息落点：siblingOf 的 parent（编辑重发开新分支）或当前激活叶
    let parentId: string | null;
    if (input.siblingOf) {
      const sib = messages.get(input.siblingOf);
      if (!sib || sib.conversation_id !== conv.id) {
        throw new GatewayError('message_not_found', 'siblingOf message not found in conversation');
      }
      parentId = sib.parent_id;
    } else {
      parentId = messages.activeLeaf(conv.id)?.id ?? null;
    }
    const userMsg = messages.insert({
      conversation_id: conv.id,
      parent_id: parentId,
      role: 'user',
      content: input.content,
      token_count: defaultTokenCounter(input.content),
    });

    const history = messages.pathTo(userMsg.id);
    const trimmed = this.assemblePayload(target, history); // context_overflow 在此抛
    const assistantId = this.launch(conv, target, trimmed, userMsg.id);
    return { userMessageId: userMsg.id, assistantMessageId: assistantId };
  }

  async regenerateMessage(input: MessageAnchorInput): Promise<{ assistantMessageId: string }> {
    const { messages } = this.deps;
    const conv = this.requireConversation(input.conversationId);
    const anchor = this.requireMessage(conv.id, input.messageId);
    if (anchor.role !== 'assistant') {
      throw new GatewayError('invalid_target', 'regenerate target must be an assistant message');
    }
    const target = this.resolveGenerationTarget(conv);

    // 历史 = 根到目标 parent 的路径；同级新分支（旧分支保留不删）
    const history = anchor.parent_id ? messages.pathTo(anchor.parent_id) : [];
    const trimmed = this.assemblePayload(target, history);
    const assistantId = this.launch(conv, target, trimmed, anchor.parent_id);
    return { assistantMessageId: assistantId };
  }

  async continueMessage(input: MessageAnchorInput): Promise<void> {
    const { messages } = this.deps;
    const conv = this.requireConversation(input.conversationId);
    const anchor = this.requireMessage(conv.id, input.messageId);
    if (anchor.role !== 'assistant') {
      throw new GatewayError('invalid_target', 'continue target must be an assistant message');
    }
    const target = this.resolveGenerationTarget(conv);

    // 历史 = 根到 parent 的路径 + 现有内容作为 assistant 尾条（让模型续写）
    const prefix = anchor.parent_id ? messages.pathTo(anchor.parent_id) : [];
    const history: PayloadMessage[] = [
      ...prefix.map((m) => ({
        role: m.role,
        content: m.content,
        token_count: m.token_count,
        error: m.error,
      })),
      { role: 'assistant' as const, content: anchor.content, token_count: anchor.token_count },
    ];
    const trimmed = this.assemblePayload(target, history);

    if (trimmed.truncated) this.warnTruncated(conv.id, anchor.id, trimmed);
    const controller = new AbortController();
    this.active.set(conv.id, controller);
    void this.run({
      conversationId: conv.id,
      assistantMessageId: anchor.id, // delta 追加到同一消息，messageId 不变
      baseUrl: target.providerRow.base_url,
      apiFormat: target.providerRow.api_format,
      apiKey: target.apiKey,
      model: target.model,
      messages: trimmed.messages,
      params: target.params,
      reasoningOff: !conv.reasoning_enabled,
      signal: controller.signal,
      continueFrom: {
        messageId: anchor.id,
        existingContent: anchor.content,
        existingReasoning: anchor.reasoning ?? '',
        priorTotalMs: anchor.stats?.total_ms ?? 0,
        priorTokenCount: anchor.token_count ?? 0,
      },
    });
  }

  async generateResponse(input: { conversationId: string }): Promise<{ assistantMessageId: string }> {
    const { messages } = this.deps;
    const conv = this.requireConversation(input.conversationId);
    const target = this.resolveGenerationTarget(conv);

    const leaf = messages.activeLeaf(conv.id);
    if (!leaf || leaf.role !== 'user') {
      throw new GatewayError('nothing_to_generate', 'active leaf is not a user message');
    }
    const history = messages.pathTo(leaf.id);
    const trimmed = this.assemblePayload(target, history);
    const assistantId = this.launch(conv, target, trimmed, leaf.id);
    return { assistantMessageId: assistantId };
  }

  stopGeneration(conversationId: string): void {
    this.active.get(conversationId)?.abort();
  }

  /* ---------------- 公共管线 ---------------- */

  private requireConversation(conversationId: string): Conversation {
    const conv = this.deps.conversations.get(conversationId);
    if (!conv) throw new GatewayError('conversation_not_found', 'conversation not found');
    if (this.isGenerating(conv.id)) {
      throw new GatewayError('generation_in_progress', 'generation already in progress');
    }
    return conv;
  }

  private requireMessage(conversationId: string, messageId: string): Message {
    const msg = this.deps.messages.get(messageId);
    if (!msg || msg.conversation_id !== conversationId) {
      throw new GatewayError('message_not_found', 'message not found in conversation');
    }
    return msg;
  }

  /** 生效参数（全局预设 ← 用户预设 ← 会话 overrides）+ provider + 密钥 + 模型 */
  private resolveGenerationTarget(conv: Conversation): GenerationTarget {
    const globalParams = this.deps.presets.get(GLOBAL_PRESET_ID)?.params ?? FACTORY_DEFAULTS;
    const preset = conv.preset_id ? this.deps.presets.get(conv.preset_id) : null;
    const params: ParamValues = resolveParams(globalParams, preset, conv.overrides);
    const providerId = conv.provider_id;
    const model = conv.model;
    if (!providerId) throw new GatewayError('no_provider', 'no provider selected');
    if (!model) throw new GatewayError('no_model', 'no model selected');

    const providerRow = this.deps.providers.getRow(providerId);
    if (!providerRow) throw new GatewayError('provider_not_found', 'provider not found');
    if (!providerRow.api_key_cipher) {
      throw new GatewayError('missing_api_key', 'provider has no api key');
    }
    const apiKey = this.deps.crypto.decryptString(providerRow.api_key_cipher.toString('utf8'));
    registerSecret(apiKey); // 红线：此后日志/错误中该密钥一律脱敏
    return { params, providerRow, apiKey, model };
  }

  /**
   * 组装 + 裁剪（系统提示词为生效参数，非空才注入；带错的 assistant 历史不上行）；
   * context_overflow='stop' 且超预算时抛 context_overflow（不发请求）。
   */
  private assemblePayload(target: GenerationTarget, history: PayloadMessage[]): TrimResult {
    const { params } = target;
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
    if (trimmed.overflow) {
      throw new GatewayError(
        'context_overflow',
        `context ${trimmed.totalTokens} tokens exceeds budget ${trimmed.budget} (strategy=stop)`,
      );
    }
    return trimmed;
  }

  /** 截断警告（契约 §5 简化允许：仅一条 context_truncated chat:error，不阻断） */
  private warnTruncated(conversationId: string, messageId: string, trimmed: TrimResult): void {
    if (!trimmed.truncated) return;
    this.deps.send(EVT.chatError, {
      conversationId,
      messageId,
      error: {
        code: 'context_truncated',
        message: `single message truncated to fit budget ${trimmed.budget} tokens`,
      },
    });
  }

  /**
   * insert assistant 占位（parentId 下）→ active_leaf 切到占位 → 警告 → 上锁 → 异步开跑。
   */
  private launch(
    conv: Conversation,
    target: GenerationTarget,
    trimmed: TrimResult,
    parentId: string | null,
  ): string {
    const { messages, conversations } = this.deps;
    const assistant = messages.insert({
      conversation_id: conv.id,
      parent_id: parentId,
      role: 'assistant',
      content: '',
      partial: true,
    });
    messages.setActiveLeaf(conv.id, assistant.id);
    conversations.touch(conv.id);
    this.warnTruncated(conv.id, assistant.id, trimmed);

    const controller = new AbortController();
    this.active.set(conv.id, controller);
    void this.run({
      conversationId: conv.id,
      assistantMessageId: assistant.id,
      baseUrl: target.providerRow.base_url,
      apiFormat: target.providerRow.api_format,
      apiKey: target.apiKey,
      model: target.model,
      messages: trimmed.messages,
      params: target.params,
      reasoningOff: !conv.reasoning_enabled,
      signal: controller.signal,
    });
    return assistant.id;
  }

  private async run(args: RunArgs): Promise<void> {
    const { messages, conversations, settings } = this.deps;
    const cont = args.continueFrom;
    let content = '';
    let reasoning = '';
    let failed: ApiError | null = null;
    let finishReason: string | undefined;

    const t0 = Date.now(); // 请求发出前
    let firstDeltaAt: number | null = null; // 首 delta（content 或 reasoning 先到）
    let firstContentAt: number | null = null;
    let sawReasoning = false;
    let tEnd = t0;

    try {
      const gen = gatewayChat({
        baseUrl: args.baseUrl,
        apiFormat: args.apiFormat,
        apiKey: args.apiKey,
        model: args.model,
        messages: args.messages,
        params: args.params,
        stream: args.params.stream,
        reasoningOff: args.reasoningOff,
        signal: args.signal,
      });
      for await (const chunk of gen) {
        if (chunk.error) {
          failed = chunk.error;
          break;
        }
        if (chunk.delta || chunk.reasoning_delta) {
          const now = Date.now();
          if (firstDeltaAt === null) firstDeltaAt = now;
          if (chunk.delta) {
            content += chunk.delta;
            if (firstContentAt === null) firstContentAt = now;
          }
          if (chunk.reasoning_delta) {
            reasoning += chunk.reasoning_delta;
            sawReasoning = true;
          }
          this.deps.send(EVT.chatDelta, {
            conversationId: args.conversationId,
            messageId: args.assistantMessageId,
            delta: chunk.delta ?? '',
            reasoning_delta: chunk.reasoning_delta,
          });
        }
        if (chunk.finishReason) finishReason = chunk.finishReason;
      }
    } catch (e) {
      failed = normalizeError(e);
    } finally {
      tEnd = Date.now();
      this.active.delete(args.conversationId);
    }

    /* ---- 统计口径（中止/失败也落库已测得的时间；continue 累加 total_ms） ---- */
    const runTotalMs = tEnd - t0;
    const stats: MessageStats = { total_ms: runTotalMs };
    // ttft：非流式 = total；流式以首个 delta 为准，全程无 delta 则缺省
    if (!args.params.stream) {
      stats.ttft_ms = runTotalMs;
    } else if (firstDeltaAt !== null) {
      stats.ttft_ms = firstDeltaAt - t0;
    }
    // reasoning_ms：本次运行出现过 reasoning → 首 content delta（或流结束）− t0
    const runReasoningMs = sawReasoning ? (firstContentAt ?? tEnd) - t0 : undefined;
    if (runReasoningMs !== undefined) stats.reasoning_ms = runReasoningMs;
    if (finishReason !== undefined) stats.finish_reason = finishReason;

    if (cont) {
      // continue：total_ms 累加；ttft 保留首段运行的既有值（stats 不含该键 → merge 不覆盖）；
      // reasoning_ms 与既有值累加（同一消息的 reasoning 阶段总耗时）
      const priorReasoningMs = messages.get(cont.messageId)?.stats?.reasoning_ms;
      stats.total_ms = cont.priorTotalMs + runTotalMs;
      delete stats.ttft_ms;
      if (runReasoningMs !== undefined || priorReasoningMs != null) {
        stats.reasoning_ms = (priorReasoningMs ?? 0) + (runReasoningMs ?? 0);
      } else {
        delete stats.reasoning_ms;
      }
    }

    const finalContent = cont ? cont.existingContent + content : content;
    const finalReasoning = cont ? cont.existingReasoning + reasoning : reasoning;

    const aborted = args.signal.aborted;
    if (failed && !aborted) {
      // 请求失败：已收内容与错误一并落库（prd.md §4.4 错误卡片 + 重试语义）
      const updated = messages.update(args.assistantMessageId, {
        content: finalContent,
        reasoning: finalReasoning || undefined,
        token_count: finalContent ? defaultTokenCounter(finalContent) : null,
        partial: true,
        error: failed,
        stats,
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
      content: finalContent,
      reasoning: finalReasoning || undefined,
      token_count: finalContent ? defaultTokenCounter(finalContent) : null, // continue：重计总内容
      partial: aborted,
      error: null,
      stats,
    });
    conversations.touch(args.conversationId);
    this.deps.send(EVT.chatDone, {
      conversationId: args.conversationId,
      messageId: args.assistantMessageId,
      message: updated,
    });

    // 首轮完成后自动生成标题（prd.md §7.2）：成功广播 title:updated，
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
   * resolveTitleTarget 解析模型 → 取 provider + 密钥 → 找激活路径首条 user 消息 →
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

/** 组装请求历史的最小消息形状（Message 与 continue 的伪尾条共用） */
type PayloadMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
  token_count?: number | null;
  error?: { code: string; message: string } | null;
};

interface RunArgs {
  conversationId: string;
  assistantMessageId: string;
  baseUrl: string;
  apiFormat: ApiFormat;
  apiKey: string;
  model: string;
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  params: ParamValues;
  /** !conv.reasoning_enabled：true 时请求体混入按协议的关闭思考参数 */
  reasoningOff: boolean;
  signal: AbortSignal;
  /** continue 续写：delta 追加到同一消息；total_ms 累加 priorTotalMs */
  continueFrom?: {
    messageId: string;
    existingContent: string;
    existingReasoning: string;
    priorTotalMs: number;
    priorTokenCount: number;
  };
}
