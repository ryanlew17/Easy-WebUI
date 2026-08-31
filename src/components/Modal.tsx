/**
 * 统一模态封装（硬约束：所有模态/确认对话框走这里）。
 * - .glass-strong 强玻璃面板 + 遮罩 backdrop-filter 模糊（临时态，防背景文字透底）；
 *   max-height 90vh + 内部滚动（缩放鲁棒）；
 * - 进/退场动画：入场 .modal-panel/.modal-overlay（--dur-slow 面板缓动）；退场由
 *   requestClose 驱动 —— Esc / 点遮罩 / ✕ / ModalCloseContext 取得的 close() 先置
 *   data-closing 播反向动画（--dur-base），200ms 后再调父级 onClose 真正卸载
 *   （prefers-reduced-motion 下立即关闭）。父级主动关闭（如保存成功）仍即时卸载。
 * - Esc 关闭（与 App 级 Esc 停止生成经 ui.modalDepth 协调，模态优先）；
 * - 点击遮罩关闭可配（确认对话框默认关）。
 */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../store/ui';

/** 模态关闭通道：footer/children 内的按钮用它关闭可播退场动画（与 ✕/Esc 一致） */
const ModalCloseContext = createContext<() => void>(() => {});
export function useModalClose(): () => void {
  return useContext(ModalCloseContext);
}

/** 退场动画时长（与 tokens.css --dur-base 一致） */
const MODAL_EXIT_MS = 200;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** 面板最大宽度（Tailwind max-w-* 类），默认 max-w-lg */
  maxWidthClass?: string;
  closeOnOverlay?: boolean;
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  maxWidthClass = 'max-w-lg',
  closeOnOverlay = true,
}: ModalProps) {
  const { t } = useTranslation();
  const incModal = useUiStore((s) => s.incModal);
  const decModal = useUiStore((s) => s.decModal);
  const panelRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  /** 请求关闭：播退场动画后回调父级 onClose；重复调用幂等 */
  const requestClose = (): void => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (prefersReducedMotion()) {
      onCloseRef.current();
      return;
    }
    setClosing(true);
    window.setTimeout(() => onCloseRef.current(), MODAL_EXIT_MS);
  };
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;

  useEffect(() => {
    incModal();
    return () => decModal();
  }, [incModal, decModal]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        requestCloseRef.current();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  useEffect(() => {
    // 初始焦点进面板，保证可 Tab 到达（kimi.md §9 可访问性）
    const el = panelRef.current;
    if (!el) return;
    const focusable = el.querySelector<HTMLElement>(
      'input, textarea, select, button:not([disabled])',
    );
    (focusable ?? el).focus();
  }, []);

  return createPortal(
    <div
      className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'var(--overlay-bg)' }}
      data-closing={closing ? 'true' : undefined}
      onMouseDown={(e) => {
        if (closeOnOverlay && e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`modal-panel glass-strong flex w-full ${maxWidthClass} flex-col`}
        data-closing={closing ? 'true' : undefined}
        style={{ maxHeight: '90vh' }}
      >
        <div className="flex items-center justify-between gap-3 px-5 pb-1 pt-4">
          <h2 className="truncate text-sm font-semibold">{title}</h2>
          <button
            type="button"
            className="btn btn-ghost icon-btn"
            onClick={requestClose}
            aria-label={t('aria.closeModal')}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path
                d="M2 2l8 8M10 2l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <ModalCloseContext.Provider value={requestClose}>
            {children}
          </ModalCloseContext.Provider>
        </div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 px-5 pb-4 pt-2">
            <ModalCloseContext.Provider value={requestClose}>
              {footer}
            </ModalCloseContext.Provider>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

export interface ConfirmDialogProps {
  title: string;
  body: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  return (
    <Modal
      title={title}
      onClose={onCancel}
      closeOnOverlay={false}
      maxWidthClass="max-w-md"
      footer={<ConfirmFooter confirmLabel={confirmLabel} danger={danger} busy={busy} onConfirm={onConfirm} />}
    >
      <p className="text-sm leading-relaxed text-secondary">{body}</p>
    </Modal>
  );
}

/** 确认对话框页脚：取消走 ModalCloseContext（播退场动画），确认仍由父级语义处理 */
function ConfirmFooter({
  confirmLabel,
  danger,
  busy,
  onConfirm,
}: {
  confirmLabel?: string;
  danger: boolean;
  busy: boolean;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const close = useModalClose();
  return (
    <>
      <button type="button" className="btn btn-surface" onClick={close} disabled={busy}>
        {t('common.cancel')}
      </button>
      <button
        type="button"
        className={`btn ${danger ? 'btn-danger-solid' : 'btn-accent'}`}
        onClick={onConfirm}
        disabled={busy}
      >
        {confirmLabel ?? t('common.confirm')}
      </button>
    </>
  );
}
