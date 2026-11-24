/**
 * 消息流：普通滚动 + 分页渲染（尾部 PAGE_SIZE 条，顶部"加载更早"）。
 * - 贴底时新内容/流式 flush 自动滚到底；用户上翻则不打扰；
 * - 流式渲染 50ms 节流在 messages store 完成，这里只消费状态；
 * - 选择模式：右键任一气泡进入，气泡左侧复选框多选，选择栏 portal 到 body 并固定底部；
 *   同时隐藏 Generate 与输入坞（草稿保留），Esc 退出；退出后恢复分支导航显示。
 */
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { Message } from '@shared/types';
import { useMessagesStore } from '../../store/messages';
import { IconButton } from '../../components/controls';
import { IconClose, IconTrash } from '../../components/icons';
import { MessageBubble } from './MessageBubble';
import { fadeAttributeChanged, nextScrollFades } from '../../lib/glass/geometry';

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
  materialRef,
  onSelectionModeChange,
}: {
  conversationId: string;
  callbacks: MessageListCallbacks;
  materialRef: MutableRefObject<HTMLDivElement | null>;
  onSelectionModeChange: (active: boolean) => void;
}) {
  const { t } = useTranslation();
  const messages = useMessagesStore((s) => s.byConv[conversationId]);
  const loaded = useMessagesStore((s) => s.loadedConvs[conversationId]);
  const generating = useMessagesStore((s) => !!s.generating[conversationId]);
  const loadFor = useMessagesStore((s) => s.loadFor);
  const [shownCount, setShownCount] = useState(PAGE_SIZE);
  const scrollRef = materialRef;
  const stickRef = useRef(true);

  // @req REQ-2026-006：渐隐只反映可滚动方向，不增加逐帧 React 状态。
  const updateFades = useCallback((): void => {
    const el = scrollRef.current;
    if (!el) return;
    const fades = nextScrollFades(el);
    if (fadeAttributeChanged(el.dataset.fadeTop, fades.top)) el.dataset.fadeTop = String(fades.top);
    if (fadeAttributeChanged(el.dataset.fadeBottom, fades.bottom)) el.dataset.fadeBottom = String(fades.bottom);
  }, []);

  /* ---------- 选择模式（右键进入 / Esc 退出） ---------- */
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    onSelectionModeChange(selectionMode);
  }, [selectionMode, onSelectionModeChange]);

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
  const visible = useMemo(
    () => (all.length > shownCount ? all.slice(all.length - shownCount) : all),
    [all, shownCount],
  );
  const hiddenCount = all.length - visible.length;
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  // 最后一条 assistant 是否流式中（typing 指示器用）
  const lastAssistantId = useMemo(() => {
    for (let i = all.length - 1; i >= 0; i--) {
      if (all[i].role === 'assistant') return all[i].id;
    }
    return undefined;
  }, [all]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateFades();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateFades);
    observer?.observe(el);
    if (el.firstElementChild) observer?.observe(el.firstElementChild);
    return () => observer?.disconnect();
  }, [conversationId, updateFades]);

  // 内容变化（含流式 flush）时，若贴底则滚到底
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (stickRef.current) el.scrollTop = el.scrollHeight;
    updateFades();
  }, [visible, generating, updateFades]);

  const onScroll = (): void => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_BOTTOM_PX;
    updateFades();
  };

  return (
    <div className="message-layer flex min-h-0 flex-col">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="message-scroll min-h-0 overflow-y-auto"
        data-generating={generating ? 'true' : undefined}
        aria-label={t('aria.messageList')}
        aria-live="polite"
      >
        <div className="message-column mx-auto flex w-full flex-col gap-4">
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
              selected={selectedIdSet.has(msg.id)}
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
      {selectionMode ? createPortal(
        <div
          className="selection-toolbar glass-pop glass-optics pop-layer flex items-center gap-2 px-3 py-2"
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
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
