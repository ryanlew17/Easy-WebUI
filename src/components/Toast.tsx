/**
 * 全局 Toast（顶栏下方居中堆叠，自动消失，role=status 供读屏）。
 * 进/退场动画：.toast-item（--dur-base）；退场由 store 两阶段关闭支撑
 * （dismissToast 先标记 closingToastIds 播动画，200ms 后移除）。
 */
import { useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../store/ui';
import { resolvePopoverZoom } from './Popover';

const KIND_STYLE: Record<string, string> = {
  info: 'var(--text-secondary)',
  success: 'var(--success-text)',
  warning: 'var(--warning-text)',
  error: 'var(--danger-text)',
};

export function ToastHost() {
  const { t } = useTranslation();
  const toasts = useUiStore((s) => s.toasts);
  const closingIds = useUiStore((s) => s.closingToastIds);
  const dismiss = useUiStore((s) => s.dismissToast);
  const hostRef = useRef<HTMLDivElement>(null);
  const visible = toasts.length > 0;
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!visible || !host) return;
    let stage: HTMLElement | null = null;
    const update = (): void => {
      if (!stage?.isConnected) stage = document.querySelector<HTMLElement>('.app-stage');
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      const hostRect = host.getBoundingClientRect();
      const measured = stage.offsetWidth > 0 ? rect.width / stage.offsetWidth : 1;
      const zoom = resolvePopoverZoom(
        getComputedStyle(document.documentElement).getPropertyValue('--app-zoom'),
        measured,
      );
      const viewport = window.visualViewport;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const margin = 16;
      const desired = rect.left + rect.width / 2 - hostRect.width / 2;
      const maxLeft = Math.max(viewportLeft + margin, viewportLeft + viewportWidth - hostRect.width - margin);
      const left = Math.min(Math.max(desired, viewportLeft + margin), maxLeft);
      host.style.left = `${left / zoom}px`;
      host.style.visibility = 'visible';
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    const bindStage = (): void => {
      const next = document.querySelector<HTMLElement>('.app-stage');
      if (next === stage) return;
      if (stage) observer?.unobserve(stage);
      stage = next;
      if (stage) observer?.observe(stage);
      update();
    };
    bindStage();
    update();
    const raf = window.requestAnimationFrame(update);
    const root = document.getElementById('root');
    const mutations = new MutationObserver(bindStage);
    if (root) mutations.observe(root, { childList: true, subtree: true });
    const preference = new MutationObserver(update);
    preference.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      window.cancelAnimationFrame(raf);
      observer?.disconnect();
      mutations.disconnect();
      preference.disconnect();
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, [visible]);
  if (!visible) return null;
  return (
    <div ref={hostRef} className="pointer-events-none invisible fixed left-0 top-20 z-[60] flex w-72 max-w-[calc(100%-2rem)] flex-col gap-2">
      {toasts.map((toast) => {
        const closing = closingIds.includes(toast.id);
        return (
          <div
            key={toast.id}
            role="status"
            className="toast-item glass-pop glass-optics pointer-events-auto flex items-start gap-2 px-3 py-2.5"
            data-closing={closing ? 'true' : undefined}
            aria-hidden={closing || undefined}
          >
            <span
              className="mt-1 inline-block h-2 w-2 flex-none rounded-pill"
              style={{ background: KIND_STYLE[toast.kind] }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 break-words text-xs leading-relaxed">{toast.text}</span>
            <button
              type="button"
              className="btn btn-ghost icon-btn -mr-1 -mt-0.5"
              style={{ width: '1.5rem', height: '1.5rem', minHeight: '1.5rem' }}
              onClick={() => dismiss(toast.id)}
              aria-label={t('aria.toastDismiss')}
              tabIndex={closing ? -1 : undefined}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
