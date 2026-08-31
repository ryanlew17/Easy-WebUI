/**
 * 表单控件集：Toggle / Checkbox / SliderField（滑块+数字）/ NumberField / TextField /
 * TextAreaField / SelectField / SegmentedControl / FieldRow。
 * 最小点击区 ≥32px（kimi.md §5.3）；全部可 Tab 到达、aria-label 由调用方传 i18n 文案。
 *
 * 参数面板覆盖语义（LM Studio 式）：
 * - FieldRow 传 modified + onReset 时：label 前显示 accent 小圆点（高亮）+
 *   右侧垃圾桶小图标按钮（点击删除该参数/参数组的 override，值回落预设）；
 * - NumberField/TextField/TextAreaField 均为本地编辑态，blur/Enter 提交；
 * - step 为小数时按 step 的小数位取整显示（避免 0.30000000000000004 浮点噪声）。
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useDelayedUnmount } from '../lib/useDelayedUnmount';

/** 按 step 的小数位取整（step=1 → 整数；step=0.05 → 两位小数） */
export function roundForStep(v: number, step: number): number {
  const decimals = (String(step).split('.')[1] ?? '').length;
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

/* ---------- IconButton：图标按钮（操作行/发送/停止等唯一按钮形态） ----------
 * 约定：未来新增按钮一律用 IconButton（SVG 图标 + title/aria-label），
 * 不再新增纯文字按钮；编辑态确认/取消可为 icon+文字（MessageBubble 内自拟）。
 * - ghost 为默认风格（btn-ghost 悬浮底色），variant 切换 accent/danger 语义色；
 * - 命中区 ≥24px（1.5rem，kimi.md §5.3 最小点击区的紧凑档）；
 * - 动效走 .btn 的令牌过渡（--dur-fast / --ease-interactive，active:scale 0.98）。
 */
export function IconButton({
  label,
  title,
  variant = 'ghost',
  round = false,
  size = 'md',
  disabled,
  disabledHint,
  active,
  onClick,
  children,
  className,
}: {
  /** aria-label（必填，i18n 文案） */
  label: string;
  /** 悬浮 tooltip；缺省 = label */
  title?: string;
  /** ghost=默认；accent=accent 实心（发送）；danger=danger 文字色；danger-solid=danger 实心（停止） */
  variant?: 'ghost' | 'accent' | 'danger' | 'danger-solid';
  /** 圆形（发送/停止等主按钮） */
  round?: boolean;
  /** md=2rem 命中区；sm=1.5rem 命中区（消息操作行） */
  size?: 'md' | 'sm';
  disabled?: boolean;
  /** 禁用时的 tooltip（如"生成中，暂不可用"），优先级高于 title */
  disabledHint?: string;
  /** 开启态高亮（Think 胶囊等 toggle 场景） */
  active?: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
  className?: string;
}) {
  const variantClass =
    variant === 'accent'
      ? 'btn-accent'
      : variant === 'danger'
        ? 'btn-danger'
        : variant === 'danger-solid'
          ? 'btn-danger-solid'
          : 'btn-ghost';
  const dim =
    size === 'sm'
      ? { minWidth: '1.5rem', minHeight: '1.5rem', padding: '0.25rem' }
      : { minWidth: '2rem', minHeight: '2rem', padding: '0.375rem' };
  return (
    <button
      type="button"
      className={`btn ${variantClass}${className ? ` ${className}` : ''}`}
      style={{
        ...dim,
        borderRadius: round ? 'var(--radius-pill)' : 'var(--radius-m)',
        ...(active
          ? { background: 'var(--accent-soft)', color: 'var(--accent)' }
          : undefined),
      }}
      title={disabled ? (disabledHint ?? title ?? label) : (title ?? label)}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/* ---------- Toggle ---------- */
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className="switch"
      data-on={checked ? 'true' : 'false'}
      onClick={() => onChange(!checked)}
    />
  );
}

/* ---------- SegmentedControl（语言/主题等三选） ---------- */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="row-surface inline-flex p-0.5"
      style={{ borderRadius: 'var(--radius-control)' }}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          className="btn btn-ghost"
          style={{
            minHeight: '1.75rem',
            padding: '0 0.75rem',
            fontSize: '0.75rem',
            background: value === opt.value ? 'var(--row-bg-active)' : 'transparent',
            boxShadow: value === opt.value ? '0 1px 3px rgba(0,0,0,0.12)' : undefined,
            color: value === opt.value ? 'var(--text-primary)' : 'var(--text-secondary)',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- SliderField：滑块 + 数字框联动 ---------- */
export function SliderField({
  value,
  min,
  max,
  step,
  onChange,
  ariaLabel,
  disabled,
  disabledHint,
  formatValue,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  ariaLabel: string;
  disabled?: boolean;
  disabledHint?: string;
  formatValue?: (v: number) => string;
}) {
  const clamp = (v: number): number => roundForStep(Math.min(max, Math.max(min, v)), step);
  const shown = formatValue ? formatValue(value) : String(roundForStep(value, step));
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        className="slider flex-1"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        title={disabled ? disabledHint : undefined}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
      />
      <input
        type="number"
        className="input-surface w-20 flex-none text-right"
        min={min}
        max={max}
        step={step}
        value={shown}
        disabled={disabled}
        aria-label={`${ariaLabel} value`}
        title={disabled ? disabledHint : undefined}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(clamp(v));
        }}
      />
    </div>
  );
}

/* ---------- NumberField：本地编辑态，blur/Enter 才提交（避免半输入即写库） ---------- */
export function NumberField({
  value,
  min,
  max,
  step = 1,
  onCommit,
  ariaLabel,
  disabled,
}: {
  value: number;
  min: number;
  max: number;
  /** 缺省 1（整数提交）；小数 step（如 0.05）按小数位取整 */
  step?: number;
  onCommit: (v: number) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  const commit = (): void => {
    const v = Number(text);
    if (Number.isFinite(v)) {
      onCommit(roundForStep(Math.min(max, Math.max(min, v)), step));
    } else {
      setText(String(value));
    }
  };

  return (
    <input
      type="number"
      className="input-surface w-full text-right"
      min={min}
      max={max}
      step={step}
      value={text}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit();
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

/* ---------- TextField：单行文本，blur/Enter 提交（本地编辑态） ---------- */
export function TextField({
  value,
  onCommit,
  ariaLabel,
  placeholder,
  disabled,
}: {
  value: string;
  onCommit: (v: string) => void;
  ariaLabel: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);

  const commit = (): void => {
    if (text !== value) onCommit(text);
  };

  return (
    <input
      type="text"
      className="input-surface w-full"
      value={text}
      disabled={disabled}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit();
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

/* ---------- TextAreaField：多行文本（原生右下角拖拽 resize:vertical），blur 提交 ---------- */
export function TextAreaField({
  value,
  onCommit,
  ariaLabel,
  placeholder,
  rows = 4,
  mono = false,
  disabled,
}: {
  value: string;
  onCommit: (v: string) => void;
  ariaLabel: string;
  placeholder?: string;
  rows?: number;
  /** 等宽字体（JSON Schema 等） */
  mono?: boolean;
  disabled?: boolean;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);

  return (
    <textarea
      className={`input-surface${mono ? ' param-mono' : ''}`}
      rows={rows}
      style={{ resize: 'vertical', minHeight: `${rows * 1.125 + 0.75}rem` }}
      value={text}
      disabled={disabled}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text !== value) onCommit(text);
      }}
    />
  );
}

/* ---------- Checkbox（自绘勾选框：SVG checkmark 描边绘制 + 轻微 scale pop） ---------- */
export function Checkbox({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className="checkbox"
      data-checked={checked ? 'true' : 'false'}
      onClick={() => onChange(!checked)}
    >
      <svg viewBox="0 0 12 12" aria-hidden="true" className="checkbox-icon">
        <path className="checkbox-mark" d="M2 6.5l2.5 2.5L10 3.5" />
      </svg>
    </button>
  );
}

/*
 * ---------- SelectField：自定义玻璃下拉（Context Overflow 等三选） ----------
 * 原生 <select> 的弹出列表由操作系统渲染（Windows 上白底蓝高亮），与液态玻璃
 * UI 完全脱节，故重写为自定义组件（props API 不变，调用方零改动）：
 * - 触发按钮：.input-surface 样式 + chevron 图标，aria-haspopup/expanded/
 *   activedescendant 齐全，焦点始终留在按钮上（WAI-ARIA listbox 模式）；
 * - 弹层：.glass-pop 强玻璃浮层（防文字透底），role=listbox/option，
 *   选中项 var(--accent-soft) 高亮，键盘高亮项 var(--row-bg-hover)；
 * - 交互：点击外部 / Esc 关闭（capture 阶段拦截，避免误触全局 Esc=停止生成），
 *   ↑↓ 导航（循环）+ Enter 选定 + Home/End 跳首尾，打开时高亮当前值；
 * - 动效：进/场均走 tokens.css .pop-layer（--dur-fast 淡入+下沉 / 反向退场，
 *   退场由 useDelayedUnmount 延迟卸载支撑），尊重 prefers-reduced-motion。
 */
export function SelectField<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  disabled,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /* 退场动效：open 翻 false 后延迟 150ms（--dur-fast）卸载，期间 data-closing 播反向动画 */
  const pop = useDelayedUnmount(open, 150);
  const uid = useId();
  const optionId = (i: number): string => `${uid}-opt-${i}`;

  const selectedIdx = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const selectedLabel = options[selectedIdx]?.label ?? '';

  const close = (refocus: boolean): void => {
    setOpen(false);
    if (refocus) rootRef.current?.querySelector('button')?.focus();
  };

  const commit = (idx: number): void => {
    const opt = options[idx];
    if (!opt) return;
    if (opt.value !== value) onChange(opt.value);
    close(true);
  };

  const openList = (idx?: number): void => {
    setActiveIdx(idx ?? selectedIdx);
    setOpen(true);
  };

  /* 打开时：高亮项滚动进可视区；点击外部关闭（mousedown 捕获，早于 blur） */
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector(`[id="${CSS.escape(optionId(activeIdx))}"]`)
      ?.scrollIntoView({ block: 'nearest' });
    const onDown = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在打开瞬间定位一次
  }, [open]);

  /* 键盘：capture 阶段处理并 stopPropagation，避免冒泡到全局快捷键（Esc=停止生成） */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      const move = (next: number): void => {
        const wrapped = (next + options.length) % options.length;
        setActiveIdx(wrapped);
        listRef.current
          ?.querySelector(`[id="${CSS.escape(optionId(wrapped))}"]`)
          ?.scrollIntoView({ block: 'nearest' });
      };
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          close(true);
          break;
        case 'ArrowDown':
          e.preventDefault();
          e.stopPropagation();
          move(activeIdx + 1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          e.stopPropagation();
          move(activeIdx - 1);
          break;
        case 'Home':
          e.preventDefault();
          e.stopPropagation();
          move(0);
          break;
        case 'End':
          e.preventDefault();
          e.stopPropagation();
          move(options.length - 1);
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          e.stopPropagation();
          commit(activeIdx);
          break;
        case 'Tab':
          setOpen(false); // 不拦截焦点流转，仅关弹层
          break;
        default:
          break;
      }
    };
    document.addEventListener('keydown', onKey, { capture: true });
    return () => document.removeEventListener('keydown', onKey, { capture: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- commit/close 为稳定闭包
  }, [open, activeIdx, options, value]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="input-surface flex w-full items-center justify-between gap-2 text-left"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-activedescendant={open ? optionId(activeIdx) : undefined}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(e) => {
          if (open) return; // 打开态由 document capture 监听统一处理
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            openList(selectedIdx);
          }
        }}
      >
        <span className="truncate">{selectedLabel}</span>
        <svg
          width="10"
          height="6"
          viewBox="0 0 10 6"
          aria-hidden="true"
          className="flex-none"
          style={{
            transform: open ? 'rotate(180deg)' : undefined,
            transition: 'transform var(--dur-fast) var(--ease-interactive)',
          }}
        >
          <path
            d="M1 1l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {pop.mounted ? (
        <div
          ref={listRef}
          role="listbox"
          aria-label={ariaLabel}
          className="glass-pop pop-layer absolute left-0 right-0 top-full z-40 mt-1.5 max-h-60 overflow-y-auto p-1"
          data-closing={pop.closing ? 'true' : undefined}
        >
          {options.map((opt, i) => {
            const selected = opt.value === value;
            const active = i === activeIdx;
            return (
              <div
                key={opt.value}
                id={optionId(i)}
                role="option"
                aria-selected={selected}
                className="select-option"
                style={{
                  background: selected
                    ? 'var(--accent-soft)'
                    : active
                      ? 'var(--row-bg-hover)'
                      : undefined,
                  color: selected ? 'var(--accent)' : undefined,
                }}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => commit(i)}
              >
                <span className="truncate">{opt.label}</span>
                {selected ? (
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 12 12"
                    aria-hidden="true"
                    className="flex-none"
                  >
                    <path
                      d="M2 6.5l2.5 2.5L10 3.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/* ---------- InfoTip：ⓘ 悬停浮窗 ----------
 * 显隐：hover（MouseEnter/Leave）+ focus（Focus/Blur）+ click 切换钉住（触摸端可用）；
 * 进/退场动画走 .pop-layer（--dur-fast，prefers-reduced-motion 下自动无动画并立即卸载）。
 * 防裁切：FieldRow/GatedRow 所在的参数面板（ParamsPanel）与设置页（SettingsPage）
 * 滚动容器均为 overflow-y-auto，容器内绝对定位的浮层向上展开必被裁切 —— 故浮层
 * portal 到 document.body 用 fixed 定位。 ≥32px 点击区由按钮内 -inset-2 隐形扩展层保证。
 *
 * 定位（2025-08 重写，修复右缘溢出）——坐标系纪律：
 * 实测（Chromium CSS zoom，scripts/zoom-probe.mjs）：
 * - getBoundingClientRect / window.innerWidth / visualViewport 均为「视觉 px」；
 * - fixed 定位的 style.top/left 与 offsetWidth、documentElement.clientWidth
 *   均为「layout px」，与视觉 px 差 zoom 倍（旧实现混用两系 → 缩放 >100% 时
 *   钳制上限虚高，浮窗必溢出视口右缘）。
 * 因此：几何计算全部在视觉 px 系内完成（按钮/浮窗/视口一律用 gBCR 测量，
 * 视口尺寸首选 visualViewport，兜底 documentElement.getBoundingClientRect ——
 * html 经 --app-zoom 视口补偿后恰好填满窗口，其 rect 恒等于窗口视觉尺寸，
 * 与按钮 rect 同系可比），最后写入 style 时除以实测缩放系数 k
 * （k = 按钮 gBCR 宽 / offsetWidth，任何缩放实现下都自校准）。
 * 打开后经 useLayoutEffect + requestAnimationFrame 二次测量（首帧隐藏防闪烁），
 * 并跟随 scroll（capture）/ resize / visualViewport resize 重定位。
 */
export function InfoTip({ text }: { text: string }) {
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const open = pinned || hovered || focused;
  const btnRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const pop = useDelayedUnmount(open, 150);
  const [pos, setPos] = useState<{ top: number; left: number; maxWidth: number } | null>(null);

  /* 定位：默认图标上方居中；上方空间不足翻转到下方；横向钳制视口内（8px 视觉边距） */
  useLayoutEffect(() => {
    if (!pop.mounted || pop.closing) return;
    let raf = 0;
    const update = (): void => {
      const btn = btnRef.current;
      const tip = tipRef.current;
      if (!btn || !tip) return;
      // 实测缩放系数：视觉 px / layout px（zoom=1 时恒为 1，任何实现下自校准）
      const br = btn.getBoundingClientRect();
      const k = btn.offsetWidth > 0 ? br.width / btn.offsetWidth : 1;
      const zoom = k > 0 ? k : 1;
      // 视口可用区（视觉 px 系）：visualViewport 优先，html 根矩形兜底
      const vv = window.visualViewport;
      const rootRect = document.documentElement.getBoundingClientRect();
      const vw = vv?.width ?? rootRect.width;
      const vh = vv?.height ?? rootRect.height;
      // max-width：min(14rem, 视口可用宽 - 16px)，style 单位是 layout px → 除以 zoom
      const remBase = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const maxWidth = Math.max(8 * remBase, Math.min(14 * remBase, (vw - 16) / zoom));
      tip.style.maxWidth = `${maxWidth}px`;
      // max-width 生效后重测浮窗真实尺寸（视觉 px）
      const tr = tip.getBoundingClientRect();
      const tw = tr.width;
      const th = tr.height;
      const gap = 6 * zoom; // 视觉 px 间距
      const margin = 8; // 视觉 px 视口边距
      // 垂直：上方不足翻转到下方；两侧都不足则钳制在视口内
      let top = br.top - gap - th;
      if (top < margin) top = br.bottom + gap;
      if (top + th > vh - margin) top = Math.max(margin, vh - th - margin);
      // 水平：优先以按钮为中心，溢出则贴视口边缘
      let left = br.left + br.width / 2 - tw / 2;
      left = Math.min(Math.max(left, margin), Math.max(margin, vw - tw - margin));
      // 写 style（layout px 系 = 视觉 px / zoom）
      setPos({ top: top / zoom, left: left / zoom, maxWidth });
    };
    update(); // 首测（useLayoutEffect 内同步，首帧前完成）
    raf = window.requestAnimationFrame(update); // 二次测量：字体/布局沉淀后纠偏
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, [pop.mounted, pop.closing]);

  /* 钉住态：Esc / 点击外部解除（Esc 走 capture + stopPropagation，避免误触全局快捷键） */
  useEffect(() => {
    if (!pinned) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setPinned(false);
      }
    };
    const onDown = (e: MouseEvent): void => {
      const target = e.target as Node;
      if (btnRef.current?.contains(target) || tipRef.current?.contains(target)) return;
      setPinned(false);
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onDown);
    };
  }, [pinned]);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        ref={btnRef}
        type="button"
        aria-label={text}
        aria-expanded={open}
        className="relative inline-flex h-4 w-4 cursor-help items-center justify-center rounded-pill text-tertiary"
        style={{ border: '0.5px solid var(--separator)', fontSize: '0.625rem' }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onClick={() => setPinned((v) => !v)}
      >
        ⓘ
        {/* 隐形点击区扩展：视觉 16px，命中区 32px（kimi.md §5.3） */}
        <span className="absolute -inset-2" aria-hidden="true" />
      </button>
      {pop.mounted
        ? createPortal(
            <div
              ref={tipRef}
              role="tooltip"
              className="glass-pop pop-layer fixed z-50 whitespace-normal px-2.5 py-2 text-left text-xs leading-relaxed"
              data-closing={pop.closing ? 'true' : undefined}
              style={
                pos
                  ? { top: pos.top, left: pos.left, maxWidth: pos.maxWidth }
                  : { top: 0, left: 0, visibility: 'hidden' } // 首帧定位前不可见，防闪烁
              }
            >
              {text}
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}

/* ---------- 参数行 ---------- */
export function FieldRow({
  label,
  hint,
  modified,
  onReset,
  resetLabel,
  children,
}: {
  label: string;
  hint?: string;
  /** 该参数（组）与预设基线不一致 → label 前 accent 小圆点高亮 */
  modified?: boolean;
  /** 提供时显示垃圾桶小图标按钮（点击删除该参数组的 override） */
  onReset?: () => void;
  /** 垃圾桶按钮的 aria-label / title（i18n） */
  resetLabel?: string;
  children: ReactNode;
}) {
  return (
    <div className="py-2">
      <div className="mb-1.5 flex items-center gap-1.5">
        {modified ? <span className="param-dot" aria-hidden="true" /> : null}
        <span
          className="text-xs font-medium"
          style={{ color: modified ? 'var(--accent)' : 'var(--text-secondary)' }}
        >
          {label}
        </span>
        {hint ? <InfoTip text={hint} /> : null}
        {modified && onReset ? (
          <button
            type="button"
            className="btn btn-ghost param-icon-btn"
            title={resetLabel}
            aria-label={resetLabel}
            onClick={onReset}
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9.5h6.6L12 4"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}
