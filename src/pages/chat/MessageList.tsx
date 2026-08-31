/**
 * 消息流：普通滚动 + 分页渲染（尾部 PAGE_SIZE 条，顶部"加载更早"）。
 * - 贴底时新内容/流式 flush 自动滚到底；用户上翻则不打扰；
 * - 流式渲染 50ms 节流在 messages store 完成，这里只消费状态；
 * - 选择模式：右键任一气泡进入，气泡左侧复选框多选，底部浮出 .glass-pop 操作栏
 *   （已选计数 + 删除 + 取消），Esc 退出；退出后恢复分支导航显示。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Message } from '@shared/types';
import { useMessagesStore } from '../../store/messages';
import { IconButton } from '../../components/controls';
import { IconClose, IconTrash } from '../../components/icons';
import { MessageBubble } from './MessageBubble';

const PAGE_SIZE = 50;
const STICK_BOTTOM_PX = 96;

export interface MessageListCallbacks {
  onRetry: (msg: Message) => void;
  onEditResend: (msg: Message, newContent: string) => void;
  onEditContent: (msg: Message, newContent: string) => void;
  onBranch: (msg: Message) => void;
  onDelete: (ids: string[]) => void;
  onRegenerate: (msg: Message) => void;
  onContinue: (msg: Message) => void;
  onSwitchBranch: (msg: Message, targetId: string) => void;
}

export function MessageList({
  conversationId,
  callbacks,
}: {
  conversationId: string;
  callbacks: MessageListCallbacks;
}) {
  const { t } = useTranslation();
  const messages = useMessagesStore((s) => s.byConv[conversationId]);
  const loaded = useMessagesStore((s) => s.loadedConvs[conversationId]);
  const generating = useMessagesStore((s) => !!s.generating[conversationId]);
  const loadFor = useMessagesStore((s) => s.loadFor);
  const [shownCount, setShownCount] = useState(PAGE_SIZE);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  /* ---------- 选择模式（右键进入 / Esc 退出） ---------- */
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const exitSelection = useCallback((): void => {
    setSelectionMode(false);
    setSelectedIds([]);
  }, []);

  const enterSelection = useCallback((msg: Message): void => {
    setSelectionMode(true);
    setSelectedIds([msg.id]);
  }, []);

  const toggleSelect = useCallback((msg: Message): void => {
    setSelectedIds((ids) =>
      ids.includes(msg.id) ? ids.filter((x) => x !== msg.id) : [...ids, msg.id],
    );
  }, []);

  // Esc 退出选择模式（capture + stopPropagation，避免误触全局 Esc=停止生成）
  useEffect(() => {
    if (!selectionMode) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        exitSelection();
      }
    };
    document.addEventListener('keydown', onKey, { capture: true });
    return () => document.removeEventListener('keydown', onKey, { capture: true });
  }, [selectionMode, exitSelection]);

  // 消息被删/切会话后清理失效勾选与选择态
  useEffect(() => {
    if (!selectionMode) return;
    const alive = new Set((messages ?? []).map((m) => m.id));
    setSelectedIds((ids) => ids.filter((id) => alive.has(id)));
  }, [selectionMode, messages]);

  useEffect(() => {
    setSelectionMode(false);
    setSelectedIds([]);
    setShownCount(PAGE_SIZE);
    stickRef.current = true;
    void loadFor(conversationId).catch(() => {
      /* 加载失败由空态兜底 */
    });
  }, [conversationId, loadFor]);

  const all = useMemo(
    () => (messages ?? []).filter((m) => m.role !== 'system'),
    [messages],
  );
  const visible = all.length > shownCount ? all.slice(all.length - shownCount) : all;
  const hiddenCount = all.length - visible.length;

  // 最后一条 assistant 是否流式中（typing 指示器用）
  const lastAssistantId = [...all].reverse().find((m) => m.role === 'assistant')?.id;

  // 内容变化（含流式 flush）时，若贴底则滚到底
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [visible, generating]);

  const onScroll = (): void => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_BOTTOM_PX;
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
        aria-label={t('aria.messageList')}
        aria-live="polite"
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {hiddenCount > 0 ? (
            <div className="text-center">
              <button
                type="button"
                className="btn btn-surface btn-pill"
                onClick={() => setShownCount((c) => c + PAGE_SIZE)}
              >
                {t('chat.loadEarlier')}（{hiddenCount}）
              </button>
            </div>
          ) : null}

          {loaded && all.length === 0 ? (
            <div className="py-10 text-center text-xs text-tertiary">
              {t('chat.empty.noConversation.desc')}
            </div>
          ) : null}

          {visible.map((msg, i) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              streaming={generating && msg.id === lastAssistantId && i === visible.length - 1}
              generating={generating}
              selectionMode={selectionMode}
              selected={selectedIds.includes(msg.id)}
              onEnterSelection={enterSelection}
              onToggleSelect={toggleSelect}
              onRetry={callbacks.onRetry}
              onEditResend={callbacks.onEditResend}
              onEditContent={callbacks.onEditContent}
              onBranch={callbacks.onBranch}
              onDelete={callbacks.onDelete}
              onRegenerate={callbacks.onRegenerate}
              onContinue={callbacks.onContinue}
              onSwitchBranch={callbacks.onSwitchBranch}
            />
          ))}
        </div>
      </div>

      {/* 选择模式操作栏：底部浮出 .glass-pop（已选计数 + 删除 + 取消） */}
      {selectionMode ? (
        <div
          className="glass-pop pop-layer absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 px-3 py-2"
          role="toolbar"
          aria-label={t('chat.select.count', { count: selectedIds.length })}
        >
          <span className="text-xs font-medium text-secondary">
            {t('chat.select.count', { count: selectedIds.length })}
          </span>
          <IconButton
            variant="danger"
            label={t('chat.select.delete')}
            disabled={selectedIds.length === 0 || generating}
            disabledHint={t('chat.actions.disabledWhileGenerating')}
            onClick={() => {
              if (selectedIds.length > 0) callbacks.onDelete(selectedIds);
            }}
          >
            <IconTrash />
            <span className="text-xs">{t('chat.select.delete')}</span>
          </IconButton>
          <IconButton label={t('chat.select.exit')} onClick={exitSelection}>
            <IconClose />
            <span className="text-xs">{t('chat.select.exit')}</span>
          </IconButton>
        </div>
      ) : null}
    </div>
  );
}
