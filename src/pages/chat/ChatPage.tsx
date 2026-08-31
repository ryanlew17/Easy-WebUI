/**
 * 会话页三栏（kimi.md §4.1 / §5.3）：
 * CSS Grid：minmax(200px,260px) 1fr <右栏宽度（cookie 持久化，可拖拽）>；960px 窗口仍可用。
 * 右栏可折叠（折叠态存 cookie）；栏间 0.5px 发丝分隔线。
 *
 * 树形分支模型接线（schema v3 契约）：
 * - user 编辑后"保存并重新发送"：内容变更 → sendMessage({siblingOf}) 产生新分支；
 *   未变更 → 其后 assistant regenerate（无后继则 generateResponse）；
 * - assistant 编辑 → updateMessageContent 原地更新（不重发）；
 * - 错误卡片重试 → regenerateMessage(msg)；
 * - branch 按钮 → setActiveLeaf（"在此消息之后分叉聊天"，之后发送落在其下）；
 * - 删除（单个/批量）→ Modal 确认后 deleteMessages（子树连删，返回路径整体替换）。
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Message } from '@shared/types';
import { FACTORY_DEFAULTS, resolveParams } from '@shared/params';
import { modelSupportsReasoning } from '@shared/reasoning';
import {
  useConversationsStore,
  useCurrentConversation,
} from '../../store/conversations';
import { useMessagesStore } from '../../store/messages';
import { usePresetsStore } from '../../store/presets';
import { useProvidersStore } from '../../store/providers';
import { RIGHT_WIDTH_MAX, RIGHT_WIDTH_MIN, useUiStore } from '../../store/ui';
import { displayTitle } from '../../lib/format';
import { ConfirmDialog } from '../../components/Modal';
import { Sidebar } from './Sidebar';
import { MessageList, type MessageListCallbacks } from './MessageList';
import { Composer, type ContextUsage } from './Composer';
import { ParamsPanel } from './ParamsPanel';
import { ModelPicker } from './ModelPicker';
import { EmptyNoConversation, EmptyNoProvider } from './EmptyStates';

export function ChatPage() {
  const { t } = useTranslation();
  const providers = useProvidersStore((s) => s.providers);
  const providersLoaded = useProvidersStore((s) => s.loaded);
  const conv = useCurrentConversation();
  const patch = useConversationsStore((s) => s.patch);
  const send = useMessagesStore((s) => s.send);
  const stop = useMessagesStore((s) => s.stop);
  const regenerate = useMessagesStore((s) => s.regenerate);
  const continueGeneration = useMessagesStore((s) => s.continueGeneration);
  const generate = useMessagesStore((s) => s.generate);
  const switchBranch = useMessagesStore((s) => s.switchBranch);
  const setActiveLeaf = useMessagesStore((s) => s.setActiveLeaf);
  const updateContent = useMessagesStore((s) => s.updateContent);
  const deleteMessages = useMessagesStore((s) => s.deleteMessages);
  const messages = useMessagesStore((s) => (conv ? s.byConv[conv.id] : undefined));
  const generating = useMessagesStore((s) => (conv ? !!s.generating[conv.id] : false));
  const presets = usePresetsStore((s) => s.presets);
  const toast = useUiStore((s) => s.toast);
  const { rightCollapsed, rightWidth, toggleRight, setRightWidth } = useUiStore();

  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState(false);

  const hasProvider = providers.length > 0;
  const providerId = conv ? conv.provider_id : null;
  const model = conv ? conv.model : null;

  const reportError = useCallback(
    (error: { code: string; message: string } | undefined): void => {
      if (!error) return;
      if (error.code === 'generation_in_progress') toast('warning', t('toast.generationInProgress'));
      else if (error.code === 'no_provider') toast('warning', t('toast.noProvider'));
      else if (error.code === 'no_model') toast('warning', t('toast.noModel'));
      // context_overflow='stop' 超预算：发送被阻断，三段式 toast（什么/为什么/怎么办）
      else if (error.code === 'context_overflow') toast('error', t('toast.contextOverflow'));
      else toast('error', `[${error.code}] ${error.message}`.trim());
    },
    [toast, t],
  );

  const onSend = useCallback(
    (content: string): void => {
      if (!conv) return;
      void send(conv.id, content).then((res) => {
        if (!res.ok) reportError(res.error);
      });
    },
    [conv, send, reportError],
  );

  /* 错误卡片重试 → regenerateMessage（新同级分支，不再删后续消息） */
  const onRetry = useCallback(
    (msg: Message): void => {
      if (!conv) return;
      void regenerate(conv.id, msg.id).then((res) => {
        if (!res.ok) reportError(res.error);
      });
    },
    [conv, regenerate, reportError],
  );

  /* user 编辑后"保存并重新发送"：变了 → siblingOf 新分支；没变 → 其后 assistant regenerate */
  const onEditResend = useCallback(
    (msg: Message, newContent: string): void => {
      if (!conv) return;
      if (newContent !== msg.content) {
        void send(conv.id, newContent, { siblingOf: msg.id }).then((res) => {
          if (!res.ok) reportError(res.error);
        });
        return;
      }
      const path = useMessagesStore.getState().byConv[conv.id] ?? [];
      const idx = path.findIndex((m) => m.id === msg.id);
      const nextAssistant = path.slice(idx + 1).find((m) => m.role === 'assistant');
      const p = nextAssistant ? regenerate(conv.id, nextAssistant.id) : generate(conv.id);
      void p.then((res) => {
        if (!res.ok) reportError(res.error);
      });
    },
    [conv, send, regenerate, generate, reportError],
  );

  const msgCallbacks = useMemo<MessageListCallbacks>(
    () => ({
      onRetry,
      onEditResend,
      onEditContent: (msg, newContent) => {
        if (!conv) return;
        if (newContent === msg.content) return;
        void updateContent(conv.id, msg.id, newContent).then((res) => {
          if (!res.ok) reportError(res.error);
        });
      },
      onBranch: (msg) => {
        if (!conv) return;
        void setActiveLeaf(conv.id, msg.id).then((res) => {
          if (!res.ok) reportError(res.error);
          else toast('info', t('chat.actions.branch'));
        });
      },
      onDelete: (ids) => setPendingDelete(ids),
      onRegenerate: (msg) => {
        if (!conv) return;
        void regenerate(conv.id, msg.id).then((res) => {
          if (!res.ok) reportError(res.error);
        });
      },
      onContinue: (msg) => {
        if (!conv) return;
        void continueGeneration(conv.id, msg.id).then((res) => {
          if (!res.ok) reportError(res.error);
        });
      },
      onSwitchBranch: (msg, targetId) => {
        if (!conv) return;
        void switchBranch(conv.id, targetId).then((res) => {
          if (!res.ok) reportError(res.error);
        });
      },
    }),
    [
      conv,
      onRetry,
      onEditResend,
      updateContent,
      setActiveLeaf,
      regenerate,
      continueGeneration,
      switchBranch,
      reportError,
      toast,
      t,
    ],
  );

  const confirmDelete = useCallback((): void => {
    if (!conv || !pendingDelete) return;
    setDeleting(true);
    void deleteMessages(conv.id, pendingDelete)
      .then((res) => {
        if (!res.ok) reportError(res.error);
      })
      .finally(() => {
        setDeleting(false);
        setPendingDelete(null);
      });
  }, [conv, pendingDelete, deleteMessages, reportError]);

  /* 上下文用量：激活路径 token_count（缺省 4 字符≈1 token）+ system_prompt；
     预算 = resolveParams（全局 ← 用户预设 ← overrides）的 context_window */
  const usage = useMemo<ContextUsage>(() => {
    if (!conv) {
      return { historyTokens: 0, systemTokens: 0, budget: FACTORY_DEFAULTS.context_window };
    }
    const globalParams = presets.find((p) => p.is_global)?.params ?? FACTORY_DEFAULTS;
    const preset = conv.preset_id
      ? (presets.find((p) => p.id === conv.preset_id) ?? null)
      : null;
    const eff = resolveParams(globalParams, preset, conv.overrides);
    const historyTokens = (messages ?? []).reduce(
      (sum, m) =>
        sum + (m.token_count ?? Math.ceil(m.content.length / 4 + (m.reasoning?.length ?? 0) / 4)),
      0,
    );
    return {
      historyTokens,
      systemTokens: Math.ceil(eff.system_prompt.length / 4),
      budget: eff.context_window,
    };
  }, [conv, presets, messages]);

  /* Generate Response 可见性：激活路径最后一条（非 system）是 user 消息 */
  const lastMsg = useMemo(
    () => (messages ?? []).filter((m) => m.role !== 'system').pop(),
    [messages],
  );
  const canGenerate = !!conv && !!lastMsg && lastMsg.role === 'user';

  const thinkEnabled = conv?.reasoning_enabled ?? true;
  const thinkSupported = model ? modelSupportsReasoning(model) : true;
  const onToggleThink = useCallback((): void => {
    if (!conv) return;
    void patch(conv.id, { reasoning_enabled: !thinkEnabled }).catch(() =>
      toast('error', t('toast.errorGeneric')),
    );
  }, [conv, patch, thinkEnabled, toast, t]);

  const onGenerate = useCallback((): void => {
    if (!conv) return;
    void generate(conv.id).then((res) => {
      if (!res.ok) reportError(res.error);
    });
  }, [conv, generate, reportError]);

  const onModelSelect = (pid: string, mid: string): void => {
    if (!conv) return;
    void patch(conv.id, { provider_id: pid, model: mid }).catch(() =>
      toast('error', t('toast.errorGeneric')),
    );
  };

  /* 右栏宽度拖拽：mousedown 起手，mousemove 换算（右缘向左拖=变宽），存 px 数值 */
  const onDividerDown = (e: React.MouseEvent): void => {
    e.preventDefault();
    dragState.current = { startX: e.clientX, startWidth: rightWidth };
    const onMove = (ev: MouseEvent): void => {
      const st = dragState.current;
      if (!st) return;
      const next = st.startWidth + (st.startX - ev.clientX);
      setRightWidth(Math.min(RIGHT_WIDTH_MAX, Math.max(RIGHT_WIDTH_MIN, next)));
    };
    const onUp = (): void => {
      dragState.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = 'grabbing';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const rightRem = (rightWidth / 16).toFixed(3);

  return (
    <div
      className="grid h-full min-h-0"
      style={{
        gridTemplateColumns: rightCollapsed
          ? 'minmax(12.5rem, 16.25rem) minmax(0, 1fr)'
          : `minmax(12.5rem, 16.25rem) minmax(0, 1fr) ${rightRem}rem`,
      }}
    >
      {/* 左栏：抽屉底色分区（无边线） */}
      <div className="drawer flex min-h-0 flex-col">
        <Sidebar />
      </div>

      {/* 中栏 */}
      <div className="flex min-w-0 flex-col" style={{ minHeight: 0 }}>
        {/* 消息流顶栏（玻璃，消息从其下滚过）。z-30：backdrop-filter 形成堆叠上下文，
            缺省会被 DOM 序更靠后的消息列表盖住 */}
        <div className="glass-bar relative z-30 flex flex-none items-center gap-2 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            {conv ? (
              <ModelPicker providerId={providerId} model={model} onSelect={onModelSelect} />
            ) : (
              <span className="text-sm text-secondary">{t('app.name')}</span>
            )}
          </div>
          {conv ? (
            <span className="hidden max-w-[40%] truncate text-xs text-tertiary sm:inline">
              {displayTitle(conv.title, t('sidebar.untitled'))}
            </span>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost icon-btn flex-none"
            onClick={toggleRight}
            aria-label={t('aria.toggleRightPanel')}
            aria-pressed={!rightCollapsed}
            title={t('params.title')}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M2 3.5h12v9H2zM10 3.5v9"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        {providersLoaded && !hasProvider ? (
          <EmptyNoProvider />
        ) : !conv ? (
          <EmptyNoConversation />
        ) : (
          <>
            <MessageList conversationId={conv.id} callbacks={msgCallbacks} />
            <Composer
              disabled={false}
              generating={generating}
              hasModel={!!providerId && !!model}
              onSend={onSend}
              onStop={() => conv && void stop(conv.id).catch(() => toast('error', t('toast.stopFailed')))}
              thinkSupported={thinkSupported}
              thinkEnabled={thinkEnabled}
              onToggleThink={onToggleThink}
              usage={usage}
              canGenerate={canGenerate}
              onGenerate={onGenerate}
            />
          </>
        )}
      </div>

      {/* 右栏（可折叠 + 可拖拽调宽）：抽屉底色分区 */}
      {rightCollapsed ? null : (
        <div className="drawer relative flex min-h-0 flex-col">
          {/* 拖拽把手：左缘 0.5rem 热区 */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={t('aria.resizeRightPanel')}
            onMouseDown={onDividerDown}
            className="absolute -left-1.5 top-0 z-10 h-full w-3"
            style={{ cursor: 'grab' }}
            onMouseDownCapture={() => {
              document.body.style.cursor = 'grabbing';
            }}
          />
          <div className="flex flex-none items-center justify-between px-4 py-2.5">
            <h2 className="truncate text-sm font-semibold">{t('params.title')}</h2>
            <button
              type="button"
              className="btn btn-ghost icon-btn"
              onClick={toggleRight}
              aria-label={t('aria.toggleRightPanel')}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M8 2L4 6l4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          {conv ? (
            <ParamsPanel conv={conv} />
          ) : (
            <div className="px-4 py-6 text-xs text-tertiary">{t('sidebar.empty')}</div>
          )}
        </div>
      )}

      {/* 删除确认（单删/多选批删共用；子树连删） */}
      {pendingDelete ? (
        <ConfirmDialog
          title={t('chat.delete.title')}
          body={
            pendingDelete.length > 1
              ? t('chat.delete.bodyMulti', { count: pendingDelete.length })
              : t('chat.delete.bodySingle')
          }
          confirmLabel={t('common.delete')}
          danger
          busy={deleting}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      ) : null}
    </div>
  );
}
