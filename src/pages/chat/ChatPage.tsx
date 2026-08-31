/**
 * 会话页三栏（kimi.md §4.1 / §5.3）：
 * CSS Grid：minmax(200px,260px) 1fr <右栏宽度（cookie 持久化，可拖拽）>；960px 窗口仍可用。
 * 右栏可折叠（折叠态存 cookie）；栏间 0.5px 发丝分隔线。
 *
 * 编辑后重新发送的取舍（契约缺口说明）：
 * - 内容未变 → sendMessage({regenerate:true, fromMessageId})，复用原 user 消息，真分叉；
 * - 内容已改 → 当前契约没有任何"原地更新消息内容"的 API（mock 与主进程的
 *   regenerate 都忽略 content 字段，见 electron/chat.ts §1），因此以新 user 消息
 *   追加发送，不产生重复记录的语义由后端 regenerate 承担不了 —— 详见交付报告。
 */
import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Message } from '@shared/types';
import {
  useConversationsStore,
  useCurrentConversation,
} from '../../store/conversations';
import { useMessagesStore } from '../../store/messages';
import { useProvidersStore } from '../../store/providers';
import { RIGHT_WIDTH_MAX, RIGHT_WIDTH_MIN, useUiStore } from '../../store/ui';
import { displayTitle } from '../../lib/format';
import { Sidebar } from './Sidebar';
import { MessageList } from './MessageList';
import { Composer } from './Composer';
import { ParamsPanel } from './ParamsPanel';
import { ModelPicker } from './ModelPicker';
import { EmptyNoConversation, EmptyNoProvider } from './EmptyStates';

export function ChatPage() {
  const { t } = useTranslation();
  const providers = useProvidersStore((s) => s.providers);
  const providersLoaded = useProvidersStore((s) => s.loaded);
  const conversations = useConversationsStore((s) => s.conversations);
  const conv = useCurrentConversation();
  const patch = useConversationsStore((s) => s.patch);
  const send = useMessagesStore((s) => s.send);
  const stop = useMessagesStore((s) => s.stop);
  const generating = useMessagesStore((s) => (conv ? !!s.generating[conv.id] : false));
  const toast = useUiStore((s) => s.toast);
  const { rightCollapsed, rightWidth, toggleRight, setRightWidth } = useUiStore();

  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);

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

  const onRetry = useCallback(
    (msg: Message): void => {
      if (!conv) return;
      const msgs = useMessagesStore.getState().byConv[conv.id] ?? [];
      const anchor = [...msgs]
        .filter((m) => m.created_at < msg.created_at && m.role === 'user')
        .pop();
      void send(conv.id, '', { regenerate: true, fromMessageId: anchor?.id }).then((res) => {
        if (!res.ok) reportError(res.error);
      });
    },
    [conv, send, reportError],
  );

  const onEditResend = useCallback(
    (msg: Message, newContent: string): void => {
      if (!conv) return;
      if (newContent === msg.content) {
        // 未改动：真分叉（复用原消息，不产生重复记录）
        void send(conv.id, '', { regenerate: true, fromMessageId: msg.id }).then((res) => {
          if (!res.ok) reportError(res.error);
        });
      } else {
        // 已改动：契约无原地更新消息 API，追加为新 user 消息（见文件头取舍说明）
        void send(conv.id, newContent).then((res) => {
          if (!res.ok) reportError(res.error);
        });
      }
    },
    [conv, send, reportError],
  );

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
      {/* 左栏 */}
      <div className="flex min-h-0 flex-col border-r hairline">
        <Sidebar />
      </div>

      {/* 中栏 */}
      <div className="flex min-w-0 flex-col" style={{ minHeight: 0 }}>
        {/* 消息流顶栏：玻璃模糊层 ② */}
        <div className="glass-bar flex flex-none items-center gap-2 px-4 py-2.5">
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
            <MessageList conversationId={conv.id} onRetry={onRetry} onEditResend={onEditResend} />
            <Composer
              disabled={false}
              generating={generating}
              hasModel={!!providerId && !!model}
              onSend={onSend}
              onStop={() => conv && void stop(conv.id).catch(() => toast('error', t('toast.stopFailed')))}
            />
          </>
        )}
      </div>

      {/* 右栏（可折叠 + 可拖拽调宽） */}
      {rightCollapsed ? null : (
        <div className="relative flex min-h-0 flex-col border-l hairline">
          {/* 拖拽把手：左缘 0.5rem 热区，grab/grabbing 光标 */}
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
          {/* 右栏顶栏：玻璃模糊层 ④ */}
          <div className="glass-bar flex flex-none items-center justify-between px-4 py-2.5">
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
    </div>
  );
}
