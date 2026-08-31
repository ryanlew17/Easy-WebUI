/**
 * 全局 Toast（右下角堆叠，自动消失，role=status 供读屏）。
 * 进/退场动画：.toast-item（--dur-base）；退场由 store 两阶段关闭支撑
 * （dismissToast 先标记 closingToastIds 播动画，200ms 后移除）。
 */
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../store/ui';

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
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-72 flex-col gap-2">
      {toasts.map((toast) => {
        const closing = closingIds.includes(toast.id);
        return (
          <div
            key={toast.id}
            role="status"
            className="toast-item glass-pop pointer-events-auto flex items-start gap-2 px-3 py-2.5"
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
