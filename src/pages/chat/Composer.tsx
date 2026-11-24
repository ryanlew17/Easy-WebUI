/**
 * @req REQ-2026-006：输入坞使用语义排版与强调色令牌。
 * 输入坞：浮在画布上的 ChatGPT 式玻璃输入卡片。
 * - textarea 在上（透明无边框，自适应增高 ≤10rem）；底行左侧为 Think + 上下文用量，
 *   右侧为独立圆形发送/停止；选择模式隐藏输入坞但保留组件与草稿；
 * - 「✨ Generate Response」液态玻璃胶囊浮于卡片上方 12px 居中（仅末条为 user 消息时）；
 * - Enter 发送 / Shift+Enter 换行（可在通用设置翻转）；生成中禁用输入 + 停止（Esc 亦可）；
 * - 浮层（胶囊 / 用量环明细）均 portal 到 body：输入卡片自带 backdrop-filter，
 *   浮层留在其 DOM 内则模糊失效。
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../store/settings';
import { useUiStore } from '../../store/ui';
import { IconButton } from '../../components/controls';
import { AnchoredPopover } from '../../components/Popover';
import { useDelayedUnmount } from '../../lib/useDelayedUnmount';
import { IconBulb, IconSend, IconStop } from '../../components/icons';
import { formatNumber } from '../../lib/format';
import { quantizeComposerHeight } from '../../lib/glass/geometry';
import { useGlassSurface } from '../../components/GlassMaterialProvider';

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

/* ---------- 上下文用量环（环形进度 + 悬停明细浮层，portal 到 body） ---------- */
function ContextRing({ usage, draftTokens }: { usage: ContextUsage; draftTokens: number }) {
  const { t, i18n } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const open = hovered || focused;
  const pop = useDelayedUnmount(open, 150);
  const ringRef = useRef<HTMLSpanElement>(null);
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
      ref={ringRef}
      className="ctx-ring context-usage relative inline-flex min-h-8 flex-none items-center gap-1.5"
      tabIndex={0}
      role="img"
      aria-label={`${label}: ${usedPct}%`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="9" cy="9" r={R} fill="none" stroke="var(--separator)" strokeWidth="2.5" />
        <circle
          cx="9"
          cy="9"
          r={R}
          fill="none"
          stroke={over ? 'var(--warning)' : 'var(--text-tertiary)'}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${(pctShown * C).toFixed(2)} ${C.toFixed(2)}`}
          style={{ transition: 'stroke-dashoffset var(--dur-base) var(--ease-interactive), stroke var(--dur-fast) var(--ease-interactive)' }}
        />
      </svg>
      <span
        className="text-caption tabular-nums"
        style={{ color: over ? 'var(--warning-text)' : 'var(--text-tertiary)' }}
      >
        {usedPct}%
      </span>
      {/* 悬停/聚焦明细浮层：AnchoredPopover portal 到 body（glass-pop 模糊在输入坞内会失效） */}
      <AnchoredPopover
        anchorRef={ringRef}
        mounted={pop.mounted}
        closing={pop.closing}
        placement="top"
        align="end"
        className="px-3 py-2 text-xs leading-relaxed"
        role="tooltip"
      >
        <span className="block whitespace-nowrap text-secondary">
          {t('chat.composer.ctxSession', { tokens: formatNumber(used, lang) })}
        </span>
        <span className="block whitespace-nowrap text-secondary">
          {t('chat.composer.ctxWindow', { budget: formatNumber(budget, lang) })}
        </span>
        <span className="block whitespace-nowrap" style={{ color: over ? 'var(--warning-text)' : 'var(--text-tertiary)' }}>
          {t('chat.composer.ctxPercent', { used: usedPct, left: leftPct })}
        </span>
      </AnchoredPopover>
    </span>
  );
}

/* Generate Response：bare AnchoredPopover 只负责 portal 与定位，按钮自身是唯一玻璃胶囊。
 * 仅激活路径最后是 user 消息时出现；锚定输入卡片顶缘居中，随缩放/布局重定位。 */
function GeneratePill({
  anchorRef,
  popoverRef,
  mounted,
  closing,
  label,
  onClick,
}: {
  anchorRef: React.MutableRefObject<HTMLElement | null>;
  popoverRef: React.MutableRefObject<HTMLElement | null>;
  mounted: boolean;
  closing: boolean;
  label: string;
  onClick: () => void;
}) {
  if (!mounted) return null;
  return (
    <AnchoredPopover
      anchorRef={anchorRef}
      popoverRef={popoverRef}
      mounted={mounted}
      closing={closing}
      placement="top"
      align="center"
      gap={16}
      variant="bare"
      className="p-0"
    >
      <button
        type="button"
        className="generate-response-button btn btn-pill glass glass-optics px-4 text-xs font-medium"
        style={{ color: 'var(--text-primary)', minHeight: '2.25rem' }}
        onClick={onClick}
        title={label}
        aria-label={label}
      >
        {label}
      </button>
    </AnchoredPopover>
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
  selectionMode,
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
  selectionMode: boolean;
}) {
  const { t } = useTranslation();
  const enterSend = useSettingsStore((s) => s.settings.enter_send);
  const [text, setText] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLSpanElement>(null);
  const generateRef = useRef<HTMLDivElement>(null);
  useGlassSurface('composer', shellRef);

  // @req REQ-2026-006：按实际行高阶梯化，避免逐像素重建材质地图。
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const style = getComputedStyle(ta);
    const height = quantizeComposerHeight(
      ta.scrollHeight,
      Number.parseFloat(style.lineHeight),
      Number.parseFloat(style.minHeight) || 28,
      Number.parseFloat(style.maxHeight) || 160,
    );
    ta.style.height = `${height / 16}rem`;
  }, [text]);

  // @req REQ-2026-006：高光只在单个 rAF 中写 transform/opacity，不进入 React 渲染。
  useEffect(() => {
    const shell = shellRef.current;
    const highlight = highlightRef.current;
    if (!shell || !highlight) return;
    const preference = window.matchMedia(
      '(prefers-reduced-motion: reduce), (prefers-reduced-transparency: reduce), (forced-colors: active)',
    );
    let raf = 0;
    let showTimer = 0;
    let settling = false;
    let inside = false;
    let rect: DOMRect | null = null;
    let point = { x: 0, y: 0 };
    const hide = (): void => {
      if (raf) window.cancelAnimationFrame(raf);
      window.clearTimeout(showTimer);
      raf = 0;
      highlight.style.setProperty('--highlight-opacity', '0');
    };
    const settle = (): void => {
      settling = true;
      highlight.dataset.settling = 'true';
      hide();
      showTimer = window.setTimeout(() => {
        settling = false;
        delete highlight.dataset.settling;
        if (inside && !preference.matches && !document.hidden) {
          highlight.style.setProperty('--highlight-opacity', '1');
        }
      }, 150);
    };
    const measure = (): void => {
      rect = shell.getBoundingClientRect();
    };
    const onMove = (event: PointerEvent): void => {
      if (preference.matches || document.hidden) return;
      inside = true;
      if (!rect) measure();
      const current = rect;
      if (!current) return;
      const zoom = shell.offsetWidth > 0 ? current.width / shell.offsetWidth : 1;
      point = {
        x: (event.clientX - current.left) / zoom - highlight.offsetWidth / 2,
        y: (event.clientY - current.top) / zoom - highlight.offsetHeight / 2,
      };
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        if (preference.matches || document.hidden) {
          hide();
          return;
        }
        highlight.style.setProperty('--highlight-x', `${point.x}px`);
        highlight.style.setProperty('--highlight-y', `${point.y}px`);
        if (!settling) highlight.style.setProperty('--highlight-opacity', '1');
      });
    };
    const onLeave = (): void => {
      inside = false;
      settling = false;
      delete highlight.dataset.settling;
      hide();
    };
    const onPreferenceChange = (): void => {
      onLeave();
      if (preference.matches) {
        shell.removeEventListener('pointermove', onMove);
      } else {
        measure();
        shell.addEventListener('pointermove', onMove);
      }
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      measure();
      settle();
    });
    observer?.observe(shell);
    shell.addEventListener('pointerleave', onLeave);
    shell.addEventListener('input', settle);
    document.addEventListener('visibilitychange', onLeave);
    preference.addEventListener('change', onPreferenceChange);
    onPreferenceChange();
    return () => {
      onLeave();
      observer?.disconnect();
      shell.removeEventListener('pointermove', onMove);
      shell.removeEventListener('pointerleave', onLeave);
      shell.removeEventListener('input', settle);
      document.removeEventListener('visibilitychange', onLeave);
      preference.removeEventListener('change', onPreferenceChange);
    };
  }, []);

  const canSend = !disabled && !generating && hasModel && text.trim().length > 0;
  const showGenerate = canGenerate && !generating && hasModel && !disabled && !selectionMode;
  /* 胶囊退场动画（150ms 反向 .pop-layer）后再卸载 */
  const genPop = useDelayedUnmount(showGenerate, 150);
  useGlassSurface('generate-pill', generateRef, showGenerate && genPop.mounted);

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
    <div className="composer-dock flex-none px-4 pb-1 pt-1" data-selection-mode={selectionMode ? 'true' : undefined}>
      {/* Generate Response 液态玻璃胶囊：LM Studio 式浮于输入卡片上方居中
          （Ctrl/Cmd+R；不清空草稿）。portal 到 body 保证模糊生效。 */}
      <GeneratePill
        anchorRef={shellRef}
        popoverRef={generateRef}
        mounted={genPop.mounted && !selectionMode}
        closing={genPop.closing}
        label={t('chat.composer.generateResponse')}
        onClick={onGenerate}
      />

      {/* 输入卡片：浮在画布上的玻璃卡（.glass 模糊/边缘/高光，几何见 .composer-shell） */}
      <div className="composer-focus-frame">
        <div ref={shellRef} className="composer-shell glass glass-optics mx-auto">
        <span ref={highlightRef} className="composer-highlight" aria-hidden="true" />
        <textarea
          ref={taRef}
          rows={1}
          className="composer-input"
          style={{ resize: 'none', maxHeight: '10rem' }}
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
        {/* 次级控制靠左，发送/停止作为独立圆形主操作靠右。 */}
        <div className="flex flex-none items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {thinkSupported ? (
              <IconButton
                active={thinkEnabled}
                label={t('chat.composer.thinkToggle')}
                title={t('chat.composer.think')}
                onClick={onToggleThink}
                className="composer-secondary btn-pill flex-none"
              >
                <IconBulb />
                <span className="text-xs">{t('chat.composer.think')}</span>
              </IconButton>
            ) : null}
            <ContextRing usage={usage} draftTokens={estimateDraftTokens(text)} />
          </div>
          {generating ? (
            <IconButton
              round
              variant="danger-solid"
              label={t('aria.stopGeneration')}
              title={t('chat.input.stop')}
              onClick={onStop}
              className="flex-none"
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
              className="flex-none"
              size="md"
            >
              <IconSend />
            </IconButton>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
