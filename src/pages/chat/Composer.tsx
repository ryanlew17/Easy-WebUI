/**
 * 输入坞（玻璃模糊层 ③）：
 * - 多行自适应 textarea（最高 10rem 后内部滚动）；
 * - Enter 发送 / Shift+Enter 换行（可在通用设置翻转，翻转后 Ctrl/Cmd+Enter 发送）；
 * - 生成中禁用输入 + 停止按钮（Esc 亦可停，见 App 快捷键）；
 * - 左下 Think 胶囊（灯泡 icon；会话级 reasoning_enabled；模型不支持思考时隐藏）；
 * - 发送键左侧上下文用量环（SVG stroke-dasharray，>80% 转 warning；悬停浮层三行明细）；
 * - 激活路径最后是 user 消息时，上方浮出「✨ Generate Response」胶囊（Ctrl/Cmd+R，
 *   不与输入框交互、不清空草稿）。
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../store/settings';
import { useUiStore } from '../../store/ui';
import { IconButton } from '../../components/controls';
import { IconBulb, IconSend, IconStop } from '../../components/icons';
import { formatNumber } from '../../lib/format';

/** 上下文用量（由 ChatPage 汇总历史与系统提示词；草稿估算在本组件内叠加） */
export interface ContextUsage {
  historyTokens: number;
  systemTokens: number;
  budget: number;
}

/** 4 字符 ≈ 1 token 的草稿/缺省估算 */
export function estimateDraftTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/* ---------- 上下文用量环（环形进度 + 悬停明细浮层） ---------- */
function ContextRing({ usage, draftTokens }: { usage: ContextUsage; draftTokens: number }) {
  const { t, i18n } = useTranslation();
  const used = usage.historyTokens + usage.systemTokens + draftTokens;
  const budget = Math.max(usage.budget, 1);
  const pct = used / budget;
  const pctShown = Math.min(Math.max(pct, 0), 1);
  const over = pct > 0.8;
  const lang = i18n.language;
  const R = 7;
  const C = 2 * Math.PI * R;
  const usedPct = Math.min(Math.round(pct * 100), 999);
  const leftPct = Math.max(0, 100 - Math.round(pct * 100));
  const label = t('chat.composer.contextUsage');
  return (
    <span
      className="ctx-ring relative inline-flex flex-none items-center gap-1.5"
      tabIndex={0}
      role="img"
      aria-label={`${label}: ${usedPct}%`}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="9" cy="9" r={R} fill="none" stroke="var(--separator)" strokeWidth="2.5" />
        <circle
          cx="9"
          cy="9"
          r={R}
          fill="none"
          stroke={over ? 'var(--warning)' : 'var(--accent)'}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${(pctShown * C).toFixed(2)} ${C.toFixed(2)}`}
          style={{ transition: 'stroke-dashoffset var(--dur-base) var(--ease-interactive), stroke var(--dur-fast) var(--ease-interactive)' }}
        />
      </svg>
      <span
        className="text-[0.6875rem] tabular-nums"
        style={{ color: over ? 'var(--warning-text)' : 'var(--text-tertiary)' }}
      >
        {usedPct}%
      </span>
      {/* 悬停/聚焦浮层（.ctx-tip 显隐见 index.css；.glass-pop 浮层令牌） */}
      <span className="ctx-tip glass-pop block px-3 py-2 text-xs leading-relaxed">
        <span className="block whitespace-nowrap text-secondary">
          {t('chat.composer.ctxSession', { tokens: formatNumber(used, lang) })}
        </span>
        <span className="block whitespace-nowrap text-secondary">
          {t('chat.composer.ctxWindow', { budget: formatNumber(budget, lang) })}
        </span>
        <span className="block whitespace-nowrap" style={{ color: over ? 'var(--warning-text)' : 'var(--text-tertiary)' }}>
          {t('chat.composer.ctxPercent', { used: usedPct, left: leftPct })}
        </span>
      </span>
    </span>
  );
}

export function Composer({
  disabled,
  generating,
  hasModel,
  onSend,
  onStop,
  thinkSupported,
  thinkEnabled,
  onToggleThink,
  usage,
  canGenerate,
  onGenerate,
}: {
  disabled: boolean;
  generating: boolean;
  hasModel: boolean;
  onSend: (content: string) => void;
  onStop: () => void;
  /** 当前模型是否支持思考开关（模型未知 → true 显示） */
  thinkSupported: boolean;
  thinkEnabled: boolean;
  onToggleThink: () => void;
  usage: ContextUsage;
  /** 激活路径最后是 user 消息且无生成中 → 浮出 Generate Response */
  canGenerate: boolean;
  onGenerate: () => void;
}) {
  const { t } = useTranslation();
  const enterSend = useSettingsStore((s) => s.settings.enter_send);
  const [text, setText] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);

  // 自适应高度
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160) / 16}rem`;
  }, [text]);

  const canSend = !disabled && !generating && hasModel && text.trim().length > 0;
  const showGenerate = canGenerate && !generating && hasModel && !disabled;

  const doSend = (): void => {
    if (!canSend) return;
    onSend(text.trim());
    setText('');
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key !== 'Enter') return;
    if (e.shiftKey) return; // Shift+Enter 恒为换行
    if (enterSend) {
      if (!e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        doSend();
      }
    } else if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      doSend();
    }
  };

  /* Ctrl/Cmd+R = Generate Response（仅按钮可见时生效；模态打开时让位） */
  useEffect(() => {
    if (!showGenerate) return;
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key !== 'r' && e.key !== 'R') return;
      if (useUiStore.getState().modalDepth > 0) return;
      e.preventDefault();
      onGenerate();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showGenerate, onGenerate]);

  return (
    <div
      className="glass-bar relative flex-none px-4 py-3"
      style={{ borderTop: '0.5px solid var(--glass-border)', borderBottom: 'none' }}
    >
      {/* Generate Response 浮出胶囊（输入坞上方居中；不清空草稿、不与输入框交互） */}
      {showGenerate ? (
        <div className="pointer-events-none absolute inset-x-0 -top-3 z-30 flex justify-center">
          <button
            type="button"
            className="glass-pop pop-layer btn btn-pill pointer-events-auto px-4 text-xs font-medium"
            style={{ color: 'var(--accent)', minHeight: '2rem' }}
            onClick={onGenerate}
            aria-label={t('chat.composer.generateResponse')}
          >
            {t('chat.composer.generateResponse')}
          </button>
        </div>
      ) : null}

      <div className="mx-auto flex max-w-3xl items-end gap-2">
        {thinkSupported ? (
          <IconButton
            round
            active={thinkEnabled}
            label={t('chat.composer.thinkToggle')}
            title={t('chat.composer.think')}
            onClick={onToggleThink}
            className="mb-0.5 flex-none"
          >
            <IconBulb />
            <span className="text-xs">{t('chat.composer.think')}</span>
          </IconButton>
        ) : null}
        <textarea
          ref={taRef}
          rows={1}
          className="input-surface flex-1"
          style={{ resize: 'none', maxHeight: '10rem', minHeight: '2.25rem', padding: '0.4375rem 0.75rem' }}
          placeholder={
            !hasModel
              ? t('chat.input.placeholderNoModel')
              : enterSend
                ? t('chat.input.placeholder')
                : t('chat.input.placeholderAlt')
          }
          aria-label={t('aria.composer')}
          value={text}
          disabled={disabled || generating}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <ContextRing usage={usage} draftTokens={estimateDraftTokens(text)} />
        {generating ? (
          <IconButton
            round
            variant="danger-solid"
            label={t('aria.stopGeneration')}
            title={t('chat.input.stop')}
            onClick={onStop}
            className="mb-0.5 flex-none"
            size="md"
          >
            <IconStop />
          </IconButton>
        ) : (
          <IconButton
            round
            variant="accent"
            label={t('aria.sendMessage')}
            title={t('chat.input.send')}
            onClick={doSend}
            disabled={!canSend}
            className="mb-0.5 flex-none"
            size="md"
          >
            <IconSend />
          </IconButton>
        )}
      </div>
    </div>
  );
}
