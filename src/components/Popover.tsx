/**
 * AnchoredPopover：portal 到 document.body 的锚点浮层定位器（.glass-pop 液态玻璃）。
 *
 * 为什么必须 portal：浮层若仍作为带 backdrop-filter 祖先（.glass-bar 顶栏 / 输入坞 /
 * .modal-overlay）的 DOM 子孙，祖先即构成 backdrop root，子层的 backdrop-filter 只能
 * 采样到祖先内部的内容（几乎空白）——40px 模糊视觉上完全失效，浮层只剩
 * rgba 半透明底，表现为背后文字透出重叠。portal 到 body 后祖先链干净，
 * backdrop-filter 采样整页，模糊真正生效（InfoTip 已是同一做法的先例）。
 *
 * 定位坐标系纪律（与 InfoTip 相同，实测见 controls.tsx InfoTip 头注释）：
 * - getBoundingClientRect / visualViewport 为「视觉 px」；fixed 定位的 style.top/left
 *   为「layout px」，两者差界面缩放系数 k；
 * - 全部几何在视觉 px 系内计算，写入 style 前除以 k
 *   （k = 锚点 gBCR 宽 / offsetWidth，任何缩放实现下自校准）；
 * - 打开后 useLayoutEffect 同步首测 + rAF 二次测量（字体/布局沉淀后纠偏），
 *   首帧前 visibility:hidden 防闪烁；
 * - 随 scroll(capture) / resize / visualViewport 重定位（锚点被滚动或缩放时跟随）。
 */
import { useLayoutEffect, useRef, useState, type CSSProperties, type MutableRefObject, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function AnchoredPopover({
  anchorRef,
  popoverRef,
  mounted,
  closing,
  placement = 'bottom',
  align = 'start',
  matchAnchorWidth = false,
  gap = 6,
  viewportMargin = 8,
  className = '',
  style,
  role,
  ariaLabel,
  children,
}: {
  /** 锚点元素（触发按钮或其容器） */
  anchorRef: MutableRefObject<HTMLElement | null>;
  /** 供调用方做点击外部判断（outside-click 需同时排除锚点与浮层本体） */
  popoverRef?: MutableRefObject<HTMLElement | null>;
  /** 由 useDelayedUnmount 提供：挂载期（含退场动画期）为 true */
  mounted: boolean;
  /** 退场动画期（data-closing，播反向动画，不重定位） */
  closing: boolean;
  /** bottom=锚点下方（下拉）；top=锚点上方（悬停提示类） */
  placement?: 'top' | 'bottom';
  /** start=与锚点左缘对齐（下拉）；center=相对锚点水平居中（提示类）；end=与锚点右缘对齐 */
  align?: 'start' | 'center' | 'end';
  /** 浮层宽度跟随锚点（SelectField 弹层等通栏下拉） */
  matchAnchorWidth?: boolean;
  /** 与锚点的视觉间距（px） */
  gap?: number;
  /** 视口安全边距（px） */
  viewportMargin?: number;
  className?: string;
  style?: CSSProperties;
  /** 语义角色（listbox/tooltip 等，随浮层语义传入） */
  role?: string;
  ariaLabel?: string;
  children: ReactNode;
}) {
  const tipRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width?: number } | null>(null);

  useLayoutEffect(() => {
    if (!mounted || closing) return;
    let raf = 0;
    const update = (): void => {
      const anchor = anchorRef.current;
      const tip = tipRef.current;
      if (!anchor || !tip) return;
      const br = anchor.getBoundingClientRect();
      // 缩放系数：视觉 px / layout px（zoom=1 时恒为 1，任何实现下自校准）
      const k = anchor.offsetWidth > 0 ? br.width / anchor.offsetWidth : 1;
      const zoom = k > 0 ? k : 1;
      // 视口可用区（视觉 px 系）
      const vv = window.visualViewport;
      const rootRect = document.documentElement.getBoundingClientRect();
      const vw = vv?.width ?? rootRect.width;
      const vh = vv?.height ?? rootRect.height;
      if (matchAnchorWidth) tip.style.width = 'auto';
      const tr = tip.getBoundingClientRect();
      const tw = matchAnchorWidth ? br.width / zoom : tr.width;
      const th = tr.height;
      const g = gap * zoom;
      const m = viewportMargin;
      // 垂直：优先 placement 方向，空间不足翻转，两侧都不足则钳制在视口内
      let top =
        placement === 'bottom' ? br.bottom + g : br.top - g - th;
      if (placement === 'bottom' && top + th > vh - m) top = br.top - g - th;
      if (placement === 'top' && top < m) top = br.bottom + g;
      if (top < m || top + th > vh - m) top = Math.max(m, vh - th - m);
      // 水平：按 align 对齐锚点（start 左缘 / center 居中 / end 右缘）；溢出钳制视口内
      let left =
        align === 'center'
          ? br.left + br.width / 2 - (tw * zoom) / 2
          : align === 'end'
            ? br.right - tw * zoom
            : br.left;
      left = Math.min(Math.max(left, m), Math.max(m, vw - tw * zoom - m));
      setPos({
        top: top / zoom,
        left: left / zoom,
        width: matchAnchorWidth ? tw : undefined,
      });
    };
    update();
    raf = window.requestAnimationFrame(update);
    window.addEventListener('scroll', update, { capture: true });
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('scroll', update, { capture: true } as EventListenerOptions);
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, [mounted, closing, placement, align, matchAnchorWidth, gap, viewportMargin, anchorRef]);

  if (!mounted) return null;

  return createPortal(
    <div
      ref={(node) => {
        tipRef.current = node;
        if (popoverRef) popoverRef.current = node;
      }}
      className={`glass-pop pop-layer fixed z-50 ${className}`}
      role={role}
      aria-label={ariaLabel}
      data-closing={closing ? 'true' : undefined}
      style={
        pos
          ? { top: pos.top, left: pos.left, ...(pos.width ? { width: pos.width } : null), ...style }
          : { top: 0, left: 0, visibility: 'hidden', ...style } // 首帧定位前不可见，防闪烁
      }
    >
      {children}
    </div>,
    document.body,
  );
}
