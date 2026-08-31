/**
 * 消息流：普通滚动 + 分页渲染（尾部 PAGE_SIZE 条，顶部"加载更早"）。
 * - 贴底时新内容/流式 flush 自动滚到底；用户上翻则不打扰；
 * - 流式渲染 50ms 节流在 messages store 完成，这里只消费状态。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Message } from '@shared/types';
import { useMessagesStore } from '../../store/messages';
import { MessageBubble } from './MessageBubble';

const PAGE_SIZE = 50;
const STICK_BOTTOM_PX = 96;

export function MessageList({
  conversationId,
  onRetry,
  onEditResend,
}: {
  conversationId: string;
  onRetry: (msg: Message) => void;
  onEditResend: (msg: Message, newContent: string) => void;
}) {
  const { t } = useTranslation();
  const messages = useMessagesStore((s) => s.byConv[conversationId]);
  const loaded = useMessagesStore((s) => s.loadedConvs[conversationId]);
  const generating = useMessagesStore((s) => !!s.generating[conversationId]);
  const loadFor = useMessagesStore((s) => s.loadFor);
  const [shownCount, setShownCount] = useState(PAGE_SIZE);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  useEffect(() => {
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
            onRetry={onRetry}
            onEditResend={onEditResend}
          />
        ))}
      </div>
    </div>
  );
}
