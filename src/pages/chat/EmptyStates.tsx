/**
 * 空状态（docs/design/ux-guidelines.md，空状态与引导）：无平台引导卡片 / 无会话快捷开始卡片。
 * 交错入场：--stagger × 90ms（tokens.css .stagger-in，reduced-motion 下直接显示）。
 */
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../store/ui';
import { useConversationsStore } from '../../store/conversations';

const stagger = (i: number): CSSProperties => ({ ['--stagger' as never]: i });

export function EmptyNoProvider() {
  const { t } = useTranslation();
  const openSettings = useUiStore((s) => s.openSettings);
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <div className="row-surface w-full max-w-md px-8 py-10 text-center">
        <div className="stagger-in" style={stagger(0)}>
          <div
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-panel"
            style={{ background: 'var(--accent-soft)' }}
            aria-hidden="true"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 3l7 4v10l-7 4-7-4V7l7-4z"
                stroke="var(--accent)"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
              <path d="M12 8v8M8.5 10l7 4M15.5 10l-7 4" stroke="var(--accent)" strokeWidth="1.2" />
            </svg>
          </div>
        </div>
        <h2 className="stagger-in mb-2 text-base font-semibold" style={stagger(1)}>
          {t('chat.empty.noProvider.title')}
        </h2>
        <p className="stagger-in mb-6 text-sm leading-relaxed text-secondary" style={stagger(2)}>
          {t('chat.empty.noProvider.desc')}
        </p>
        <div className="stagger-in" style={stagger(3)}>
          <button
            type="button"
            className="btn btn-accent btn-pill px-5"
            style={{ minHeight: '2.25rem' }}
            onClick={() => openSettings('providers')}
          >
            {t('chat.empty.noProvider.cta')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function EmptyNoConversation() {
  const { t } = useTranslation();
  const create = useConversationsStore((s) => s.create);
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <div className="row-surface w-full max-w-md px-8 py-10 text-center">
        <div className="stagger-in" style={stagger(0)}>
          <div
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-panel"
            style={{ background: 'var(--accent-soft)' }}
            aria-hidden="true"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 6a2 2 0 012-2h12a2 2 0 012 2v9a2 2 0 01-2 2H9l-5 4V6z"
                stroke="var(--accent)"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
        <h2 className="stagger-in mb-2 text-base font-semibold" style={stagger(1)}>
          {t('chat.empty.noConversation.title')}
        </h2>
        <p className="stagger-in mb-6 text-sm leading-relaxed text-secondary" style={stagger(2)}>
          {t('chat.empty.noConversation.desc')}
        </p>
        <div className="stagger-in flex flex-col items-center gap-2" style={stagger(3)}>
          <button
            type="button"
            className="btn btn-accent btn-pill px-5"
            style={{ minHeight: '2.25rem' }}
            onClick={() => void create()}
          >
            {t('chat.empty.noConversation.cta')}
          </button>
          <span className="text-[0.6875rem] text-tertiary">
            {t('chat.empty.noConversation.hintShortcut')}
          </span>
        </div>
      </div>
    </div>
  );
}
