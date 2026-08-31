/**
 * 单条消息气泡：
 * - user：右侧 accent 淡色气泡，悬浮操作（复制/编辑）；编辑后"保存并重新发送"；
 * - assistant：左侧半透明纯色气泡，reasoning 折叠块 + Markdown；流式空内容时三点 typing；
 * - 错误：气泡内三段式错误卡片（发生了什么/可能原因/建议操作）+ 重试（复用原 user 消息）。
 * 气泡用半透明纯色，不用 blur（性能红线）。
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ApiError, Message } from '@shared/types';
import { Markdown } from '../../components/Markdown';
import { classifyError } from '../../lib/errors';
import { formatTime } from '../../lib/format';

function TypingIndicator() {
  return (
    <span className="inline-flex items-center gap-1 py-1" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="typing-dot inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: 'var(--text-secondary)', ['--dot' as never]: i }}
        />
      ))}
    </span>
  );
}

function ReasoningBlock({ reasoning }: { reasoning: string }) {
  const { t } = useTranslation();
  return (
    <details
      className="mb-2 rounded-control px-2.5 py-1.5 text-xs text-secondary"
      style={{ background: 'var(--code-bg)', border: '0.5px solid var(--separator)' }}
    >
      <summary className="cursor-pointer select-none font-medium" style={{ minHeight: '1.5rem' }}>
        {t('chat.message.reasoning')}
      </summary>
      <div className="whitespace-pre-wrap break-words pt-1 leading-relaxed">{reasoning}</div>
    </details>
  );
}

export function ErrorCard({
  error,
  onRetry,
  busy,
}: {
  error: ApiError;
  onRetry: () => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const kind = classifyError(error);
  return (
    <div
      role="alert"
      className="rounded-control p-3"
      style={{
        background: 'var(--row-bg)',
        border: '0.5px solid var(--danger)',
      }}
    >
      <p className="mb-2 text-[0.8125rem] font-semibold" style={{ color: 'var(--danger-text)' }}>
        {t('chat.error.title')}
      </p>
      <dl className="m-0 space-y-1.5 text-xs leading-relaxed">
        <div>
          <dt className="inline font-medium text-secondary">{t('chat.error.what')}：</dt>
          <dd className="m-0 inline break-all">
            {error.code ? `[${error.code}] ` : ''}
            {error.message || t('common.unknownError')}
          </dd>
        </div>
        <div>
          <dt className="inline font-medium text-secondary">{t('chat.error.why')}：</dt>
          <dd className="m-0 inline">{t(`chat.error.cause.${kind}`)}</dd>
        </div>
        <div>
          <dt className="inline font-medium text-secondary">{t('chat.error.how')}：</dt>
          <dd className="m-0 inline">{t(`chat.error.advice.${kind}`)}</dd>
        </div>
      </dl>
      <div className="mt-2.5">
        <button
          type="button"
          className="btn btn-surface"
          onClick={onRetry}
          disabled={busy}
          aria-label={t('chat.message.retry')}
        >
          {t('chat.message.retry')}
        </button>
      </div>
    </div>
  );
}

export interface BubbleProps {
  msg: Message;
  /** 流式中（本会话正在生成且该消息是尾部 assistant） */
  streaming: boolean;
  generating: boolean;
  onRetry: (msg: Message) => void;
  onEditResend: (msg: Message, newContent: string) => void;
}

export function MessageBubble({ msg, streaming, generating, onRetry, onEditResend }: BubbleProps) {
  const { t, i18n } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(msg.content);
  const [copied, setCopied] = useState(false);
  const isUser = msg.role === 'user';

  const timeLabel = useMemo(() => formatTime(msg.created_at, i18n.language), [msg.created_at, i18n.language]);

  const copyContent = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 剪贴板不可用 */
    }
  };

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`group max-w-[85%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        <div
          className="row-surface px-3.5 py-2.5"
          style={{
            background: isUser ? 'var(--bubble-user-bg)' : 'var(--row-bg)',
            borderRadius: 'var(--radius-panel)',
          }}
        >
          <div
            className="mb-1 flex items-center gap-2 text-[0.6875rem] text-tertiary"
            aria-hidden="true"
          >
            <span className="font-medium">
              {isUser ? t('chat.message.you') : t('chat.message.assistant')}
            </span>
            <span>{timeLabel}</span>
            {msg.token_count != null && msg.token_count > 0 ? (
              <span>{t('chat.message.tokenCount', { count: msg.token_count })}</span>
            ) : null}
          </div>

          {editing ? (
            <div>
              <textarea
                className="input-surface w-full"
                rows={3}
                value={draft}
                autoFocus
                aria-label={t('chat.message.edit')}
                onChange={(e) => setDraft(e.target.value)}
                style={{ minHeight: '4rem', resize: 'vertical' }}
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="btn btn-accent"
                  disabled={!draft.trim() || generating}
                  onClick={() => {
                    setEditing(false);
                    onEditResend(msg, draft.trim());
                  }}
                >
                  {t('chat.message.resend')}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
                  {t('chat.message.cancelEdit')}
                </button>
              </div>
            </div>
          ) : msg.error ? (
            <ErrorCard error={msg.error} busy={generating} onRetry={() => onRetry(msg)} />
          ) : (
            <>
              {!isUser && msg.reasoning ? <ReasoningBlock reasoning={msg.reasoning} /> : null}
              {msg.content ? (
                isUser ? (
                  <div className="whitespace-pre-wrap break-words text-[0.875rem] leading-relaxed">
                    {msg.content}
                  </div>
                ) : (
                  <Markdown content={msg.content} />
                )
              ) : streaming ? (
                <TypingIndicator />
              ) : null}
              {msg.partial && !streaming ? (
                <p className="mt-1.5 text-[0.6875rem]" style={{ color: 'var(--warning-text)' }}>
                  {t('chat.message.partial')}
                </p>
              ) : null}
            </>
          )}
        </div>

        {!editing && !msg.error && msg.content ? (
          <div
            className="mt-1 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100"
            role="toolbar"
            aria-label={t('aria.messageActions')}
          >
            <button
              type="button"
              className="btn btn-ghost"
              style={{ minHeight: '1.625rem', padding: '0 0.5rem', fontSize: '0.6875rem' }}
              onClick={() => void copyContent()}
            >
              {copied ? t('common.copied') : t('common.copy')}
            </button>
            {isUser ? (
              <button
                type="button"
                className="btn btn-ghost"
                style={{ minHeight: '1.625rem', padding: '0 0.5rem', fontSize: '0.6875rem' }}
                disabled={generating}
                onClick={() => {
                  setDraft(msg.content);
                  setEditing(true);
                }}
              >
                {t('chat.message.edit')}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
