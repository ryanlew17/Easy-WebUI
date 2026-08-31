/**
 * 单条消息气泡（LM Studio 式交互）：
 * - user：右侧 accent 淡色气泡；assistant：左侧半透明纯色气泡（均不走 blur —— 性能红线）；
 * - 最小宽度：assistant 12rem（思考计时行/消息头/短回复不逐字竖排）、user 3rem（单字不破行）；
 * - 操作行（hover/focus-within 显现，IconButton 统一图标）：branch / copy / edit / delete，
 *   assistant 追加 regenerate / continue；生成中全部禁用（置灰 + title 提示）；
 * - 分支导航 ‹ n/N ›：msg.branch.count>1 时显示在操作行左侧，调 switchBranch；
 * - reasoning 折叠块：流式中"思考中…"，完成后"思考了 X.XX 秒 / Thought for X.XXs"；
 * - assistant 完成后统计行（tok/s、tokens、TTFT、总用时、finish_reason）；
 * - 选择模式（右键进入）：左侧复选框，操作行只剩 delete，分支导航隐藏；
 * - 错误：气泡内三段式错误卡片 + IconButton 重试（regenerate）。
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ApiError, Message, MessageStats } from '@shared/types';
import { Markdown } from '../../components/Markdown';
import { Checkbox, IconButton } from '../../components/controls';
import {
  IconBranch,
  IconCheck,
  IconClock,
  IconClose,
  IconContinue,
  IconCopy,
  IconChevronLeft,
  IconChevronRight,
  IconEdit,
  IconFlag,
  IconGauge,
  IconRegenerate,
  IconTokens,
  IconTrash,
} from '../../components/icons';
import { classifyError } from '../../lib/errors';
import { formatDurationMs, formatRate, formatTime } from '../../lib/format';

function TypingIndicator() {
  return (
    <span className="inline-flex items-center gap-1 py-1" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="typing-dot inline-block h-1.5 w-1.5 rounded-pill"
          style={{ background: 'var(--text-secondary)', ['--dot' as never]: i }}
        />
      ))}
    </span>
  );
}

/* ---------- reasoning 折叠块：流式进行态 / 完成后计时标题 ---------- */
function ReasoningBlock({
  reasoning,
  streaming,
  stats,
}: {
  reasoning: string;
  streaming: boolean;
  stats?: MessageStats;
}) {
  const { t, i18n } = useTranslation();
  const title = streaming
    ? t('chat.message.thinking')
    : stats?.reasoning_ms != null
      ? t('chat.message.thoughtFor', {
          duration: formatDurationMs(stats.reasoning_ms, i18n.language),
        })
      : t('chat.message.reasoning');
  return (
    <details
      className="mb-2 rounded-control px-2.5 py-1.5 text-xs text-secondary"
      style={{ background: 'var(--code-bg)', border: '0.5px solid var(--separator)' }}
    >
      <summary className="cursor-pointer select-none font-medium" style={{ minHeight: '1.5rem' }}>
        {title}
      </summary>
      <div className="whitespace-pre-wrap break-words pt-1 leading-relaxed">{reasoning}</div>
    </details>
  );
}

/* ---------- 统计行（assistant 完成后；text-tertiary 小字 icon+数值） ---------- */
function StatsRow({ msg }: { msg: Message }) {
  const { t, i18n } = useTranslation();
  const st = msg.stats;
  if (!st) return null;
  const lang = i18n.language;
  const items: { icon: React.ReactNode; text: string; key: string }[] = [];
  const tokens = msg.token_count ?? 0;
  // tok/s = token_count / max(total_ms - ttft_ms, 1)s；无 ttft 时用 total
  if (st.total_ms != null && tokens > 0) {
    const genMs = Math.max(st.total_ms - (st.ttft_ms ?? 0), 1);
    items.push({
      icon: <IconGauge />,
      text: t('chat.stats.tokPerSec', { rate: formatRate(tokens / (genMs / 1000), lang) }),
      key: 'rate',
    });
  }
  if (tokens > 0) {
    items.push({
      icon: <IconTokens />,
      text: t('chat.stats.tokens', { count: tokens }),
      key: 'tokens',
    });
  }
  if (st.ttft_ms != null) {
    items.push({
      icon: <IconClock />,
      text: t('chat.stats.ttft', { duration: formatDurationMs(st.ttft_ms, lang) }),
      key: 'ttft',
    });
  }
  if (st.total_ms != null) {
    items.push({
      icon: <IconClock />,
      text: t('chat.stats.total', { duration: formatDurationMs(st.total_ms, lang) }),
      key: 'total',
    });
  }
  if (st.finish_reason) {
    items.push({
      icon: <IconFlag />,
      text: t('chat.stats.finishReason', { reason: st.finish_reason }),
      key: 'finish',
    });
  }
  if (items.length === 0) return null;
  return (
    <div
      className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[0.6875rem] text-tertiary"
      aria-hidden="true"
    >
      {items.map((it) => (
        <span key={it.key} className="inline-flex items-center gap-1">
          {it.icon}
          <span>{it.text}</span>
        </span>
      ))}
    </div>
  );
}

/* ---------- 分支导航 ‹ n/N ›（count=1 不渲染；生成中禁用） ---------- */
function BranchNav({
  msg,
  generating,
  onSwitchBranch,
}: {
  msg: Message;
  generating: boolean;
  onSwitchBranch: (msg: Message, targetId: string) => void;
}) {
  const { t } = useTranslation();
  const b = msg.branch;
  if (!b || b.count <= 1) return null;
  const prevId = b.index > 1 ? b.ids[b.index - 2] : null;
  const nextId = b.index < b.count ? b.ids[b.index] : null;
  const hint = t('chat.actions.disabledWhileGenerating');
  return (
    <span
      className="inline-flex items-center gap-0.5"
      role="group"
      aria-label={t('chat.branch.label', { index: b.index, count: b.count })}
    >
      <IconButton
        size="sm"
        label={t('chat.branch.prev')}
        disabled={generating || !prevId}
        disabledHint={hint}
        onClick={() => prevId && onSwitchBranch(msg, prevId)}
      >
        <IconChevronLeft />
      </IconButton>
      <span className="min-w-8 text-center text-[0.6875rem] tabular-nums text-tertiary">
        {b.index}/{b.count}
      </span>
      <IconButton
        size="sm"
        label={t('chat.branch.next')}
        disabled={generating || !nextId}
        disabledHint={hint}
        onClick={() => nextId && onSwitchBranch(msg, nextId)}
      >
        <IconChevronRight />
      </IconButton>
    </span>
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
        <IconButton
          label={t('chat.message.retry')}
          variant="ghost"
          disabled={busy}
          disabledHint={t('chat.actions.disabledWhileGenerating')}
          onClick={onRetry}
          className="row-surface"
        >
          <IconRegenerate />
          <span className="text-xs">{t('chat.message.retry')}</span>
        </IconButton>
      </div>
    </div>
  );
}

export interface BubbleProps {
  msg: Message;
  /** 流式中（本会话正在生成且该消息是尾部 assistant） */
  streaming: boolean;
  generating: boolean;
  /** 选择模式（右键进入）：复选框 + 操作行仅 delete + 隐藏分支导航 */
  selectionMode: boolean;
  selected: boolean;
  onEnterSelection: (msg: Message) => void;
  onToggleSelect: (msg: Message) => void;
  onRetry: (msg: Message) => void;
  /** user 编辑后"保存并重新发送"（内容变更 → sendMessage siblingOf；未变 → regenerate） */
  onEditResend: (msg: Message, newContent: string) => void;
  /** assistant 原地编辑（updateMessageContent，不重发） */
  onEditContent: (msg: Message, newContent: string) => void;
  /** branch：setActiveLeaf —— 在此消息之后分叉聊天 */
  onBranch: (msg: Message) => void;
  onDelete: (ids: string[]) => void;
  onRegenerate: (msg: Message) => void;
  onContinue: (msg: Message) => void;
  onSwitchBranch: (msg: Message, targetId: string) => void;
}

export function MessageBubble({
  msg,
  streaming,
  generating,
  selectionMode,
  selected,
  onEnterSelection,
  onToggleSelect,
  onRetry,
  onEditResend,
  onEditContent,
  onBranch,
  onDelete,
  onRegenerate,
  onContinue,
  onSwitchBranch,
}: BubbleProps) {
  const { t, i18n } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(msg.content);
  const [copied, setCopied] = useState(false);
  const isUser = msg.role === 'user';
  const disabledHint = t('chat.actions.disabledWhileGenerating');

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

  const showActions = !editing && !msg.error && (msg.content !== '' || !streaming);

  return (
    <div
      className={`msg-in flex min-w-0 ${selectionMode ? 'justify-start' : isUser ? 'justify-end' : 'justify-start'}`}
      onContextMenu={(e) => {
        // 右键进入选择模式（已在选择模式则不重复触发，交由复选框/气泡点击切换）
        if (selectionMode) return;
        e.preventDefault();
        onEnterSelection(msg);
      }}
    >
      {/* wrapper 撑满整行（flex-1）并承担左右对齐：group 的 max-w-[85%] 以它为
          确定基准。此前 wrapper 是 fit-content，百分比 max-width 引发 intrinsic
          循环（wrapper ≈ 气泡宽/0.85）且 group 左对齐 → 用户气泡不贴右、看似提前换行 */}
      <div
        className={`flex min-w-0 flex-1 items-start gap-2 ${isUser && !selectionMode ? 'justify-end' : 'justify-start'}`}
        style={selectionMode ? { cursor: 'pointer' } : undefined}
        onClick={selectionMode ? () => onToggleSelect(msg) : undefined}
      >
        {selectionMode ? (
          /* 勾选列：固定 24px 命中区；mt-1.5 + 垂直居中使勾选框中心对齐气泡头部行，
             行级 justify-start 保证所有勾选框左侧对齐、不随用户气泡长度漂移 */
          <span
            className="mt-1.5 flex h-6 w-6 flex-none items-center justify-center"
            /* 阻止冒泡：否则勾选会再触发气泡包装器的 toggle（双重切换=没切） */
            onClick={(e) => e.stopPropagation()}
          >
            <Checkbox
              checked={selected}
              label={t('chat.select.toggleMessage')}
              onChange={() => onToggleSelect(msg)}
            />
          </span>
        ) : null}

        {/* min-w-0 链（行/包装/列/气泡）：断掉不可断内容（长代码行、宽表格）的
            min-content 经 min-width:auto 逐层撑破 max-width —— 气泡恒 ≤ 聊天区宽，
            长内容由 pre/表格自身的 overflow-x:auto 内部滚动，列表永不出现横向滚动条 */}
        <div className={`group min-w-0 max-w-[85%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
          <div
            className="row-surface min-w-0 max-w-full px-3.5 py-2.5"
            style={{
              background: isUser ? 'var(--bubble-user-bg)' : 'var(--row-bg)',
              borderRadius: 'var(--radius-panel)',
              /* 最小宽度：user 7.5rem / assistant 12rem —— 气泡宽度至少能单行容纳
                 消息头（角色/时间/tokens）与"思考中…"计时行，短回复不再尴尬折行。
                 （不可用 min(...,100%)：气泡处于 fit-content 宽度上下文中，百分比无法解析会归零） */
              minWidth: isUser ? '7.5rem' : '12rem',
              // 选择模式勾选反馈：accent 发丝描边（不动布局）
              outline: selectionMode && selected ? '1.5px solid var(--accent)' : undefined,
              outlineOffset: '1px',
            }}
          >
            {/* 内容区：分支切换时 key=msg.id 触发 150ms 淡入（.fade-in-fast，reduced-motion 门控） */}
            <div key={msg.id} className="fade-in-fast">
              {/* 头部行整体 nowrap：宽度不足时避免"角色/时间/tokens"被 flex 压缩后竖排折行 */}
              <div
                className="mb-1 flex flex-nowrap items-center gap-2 whitespace-nowrap text-[0.6875rem] text-tertiary"
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
                    {/* 编辑态确认为 icon+文字（IconButton 约定的例外场景） */}
                    <IconButton
                      variant="accent"
                      label={isUser ? t('chat.message.resend') : t('chat.message.saveEdit')}
                      disabled={!draft.trim() || generating}
                      disabledHint={disabledHint}
                      onClick={() => {
                        setEditing(false);
                        if (isUser) onEditResend(msg, draft.trim());
                        else onEditContent(msg, draft.trim());
                      }}
                    >
                      <IconCheck />
                      <span className="text-xs">
                        {isUser ? t('chat.message.resend') : t('chat.message.saveEdit')}
                      </span>
                    </IconButton>
                    <IconButton
                      label={t('chat.message.cancelEdit')}
                      onClick={() => setEditing(false)}
                    >
                      <IconClose />
                      <span className="text-xs">{t('chat.message.cancelEdit')}</span>
                    </IconButton>
                  </div>
                </div>
              ) : msg.error ? (
                <ErrorCard error={msg.error} busy={generating} onRetry={() => onRetry(msg)} />
              ) : (
                <>
                  {!isUser && msg.reasoning ? (
                    <ReasoningBlock reasoning={msg.reasoning} streaming={streaming} stats={msg.stats} />
                  ) : null}
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
              {/* 统计行在气泡内部底部：气泡随内容撑宽，统计永远与气泡对齐
                  （放外部时短气泡 min-width 装不下统计行，会向右突出错位） */}
              {!isUser && !editing && !msg.error && !streaming && !msg.partial ? (
                <StatsRow msg={msg} />
              ) : null}
            </div>
          </div>


          {showActions ? (
            <div
              className="mt-1 flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100"
              role="toolbar"
              aria-label={t('aria.messageActions')}
              onClick={selectionMode ? (e) => e.stopPropagation() : undefined}
            >
              {/* 分支导航（选择模式隐藏，线性显示当前路径） */}
              {!selectionMode ? (
                <BranchNav msg={msg} generating={generating} onSwitchBranch={onSwitchBranch} />
              ) : null}

              {selectionMode ? (
                /* 选择模式：操作行只剩 delete 相关 */
                <IconButton
                  size="sm"
                  variant="danger"
                  label={t('chat.actions.delete')}
                  onClick={() => onDelete([msg.id])}
                >
                  <IconTrash />
                </IconButton>
              ) : (
                <>
                  <IconButton
                    size="sm"
                    label={t('chat.actions.branch')}
                    disabled={generating}
                    disabledHint={disabledHint}
                    onClick={() => onBranch(msg)}
                  >
                    <IconBranch />
                  </IconButton>
                  <IconButton
                    size="sm"
                    label={copied ? t('common.copied') : t('chat.actions.copy')}
                    title={copied ? t('common.copied') : t('chat.actions.copy')}
                    active={copied || undefined}
                    onClick={() => void copyContent()}
                  >
                    {copied ? <IconCheck /> : <IconCopy />}
                  </IconButton>
                  <IconButton
                    size="sm"
                    label={t('chat.actions.edit')}
                    disabled={generating}
                    disabledHint={disabledHint}
                    onClick={() => {
                      setDraft(msg.content);
                      setEditing(true);
                    }}
                  >
                    <IconEdit />
                  </IconButton>
                  {!isUser ? (
                    <>
                      <IconButton
                        size="sm"
                        label={t('chat.actions.regenerate')}
                        disabled={generating}
                        disabledHint={disabledHint}
                        onClick={() => onRegenerate(msg)}
                      >
                        <IconRegenerate />
                      </IconButton>
                      <IconButton
                        size="sm"
                        label={t('chat.actions.continue')}
                        disabled={generating}
                        disabledHint={disabledHint}
                        onClick={() => onContinue(msg)}
                      >
                        <IconContinue />
                      </IconButton>
                    </>
                  ) : null}
                  <IconButton
                    size="sm"
                    variant="danger"
                    label={t('chat.actions.delete')}
                    disabled={generating}
                    disabledHint={disabledHint}
                    onClick={() => onDelete([msg.id])}
                  >
                    <IconTrash />
                  </IconButton>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
