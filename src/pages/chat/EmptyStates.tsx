/**
 * 空状态：开放画布上的图标、标题、说明与主操作，不再嵌套白卡或图标底块。
 * 交错入场使用 --stagger × 90ms，reduced-motion 下直接显示。
 */
import type { CSSProperties, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../store/ui';
import { useConversationsStore } from '../../store/conversations';
import { IconNote, IconServer } from '../../components/icons';

const stagger = (i: number): CSSProperties => ({ ['--stagger' as never]: i });

function EmptyFrame({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="empty-state flex min-h-0 flex-1 items-center justify-center p-6">
      <div className="empty-state-content w-full max-w-md text-center">
        <div className="stagger-in mb-4 inline-flex text-tertiary" style={stagger(0)} aria-hidden="true">
          {icon}
        </div>
        <h2 className="stagger-in mb-2 text-title" style={stagger(1)}>{title}</h2>
        <p className="stagger-in mb-6 text-body leading-relaxed text-secondary" style={stagger(2)}>
          {description}
        </p>
        {children}
      </div>
    </div>
  );
}

export function EmptyNoProvider() {
  const { t } = useTranslation();
  const openSettings = useUiStore((s) => s.openSettings);
  return (
    <EmptyFrame
      icon={<IconServer size={24} />}
      title={t('chat.empty.noProvider.title')}
      description={t('chat.empty.noProvider.desc')}
    >
      <div className="stagger-in" style={stagger(3)}>
        <button
          type="button"
          className="btn btn-accent btn-pill px-5"
          onClick={() => openSettings('providers')}
        >
          {t('chat.empty.noProvider.cta')}
        </button>
      </div>
    </EmptyFrame>
  );
}

export function EmptyNoConversation() {
  const { t } = useTranslation();
  const create = useConversationsStore((s) => s.create);
  return (
    <EmptyFrame
      icon={<IconNote size={24} />}
      title={t('chat.empty.noConversation.title')}
      description={t('chat.empty.noConversation.desc')}
    >
      <div className="stagger-in flex flex-col items-center gap-2" style={stagger(3)}>
        <button
          type="button"
          className="btn btn-accent btn-pill px-5"
          onClick={() => void create()}
        >
          {t('chat.empty.noConversation.cta')}
        </button>
        <span className="text-caption text-tertiary">
          {t('chat.empty.noConversation.hintShortcut')}
        </span>
      </div>
    </EmptyFrame>
  );
}
