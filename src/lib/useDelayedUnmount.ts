/**
 * useDelayedUnmount：浮层「退场动效」基础设施（无第三方动画库）。
 *
 * 许多浮层（下拉/菜单/tooltip/模态/Toast）历史上只有入场动画、关闭即卸载。
 * 本 hook 在 open 翻为 false 后延迟卸载 duration 毫秒，期间返回 closing=true，
 * 组件据此挂 data-closing 属性，CSS 播反向动画；prefers-reduced-motion 下
 * 立即卸载（duration 视为 0），与 CSS 侧的 no-preference 门控保持一致。
 */
import { useEffect, useRef, useState } from 'react';

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function useDelayedUnmount(
  open: boolean,
  duration: number,
): { mounted: boolean; closing: boolean } {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      // 打开：取消挂起的卸载计时，立即挂载并清除 closing 标记
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    const ms = prefersReducedMotion() ? 0 : duration;
    if (ms <= 0) {
      setMounted(false);
      setClosing(false);
      return;
    }
    setClosing(true);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setMounted(false);
      setClosing(false);
    }, ms);
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    // mounted 刻意不入依赖：关闭沿只响应 open 的翻转
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, duration]);

  return { mounted, closing };
}
