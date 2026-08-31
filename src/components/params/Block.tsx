/**
 * LM Studio 式可折叠分块：header = 图标 + 标题 + 右侧操作区 + chevron。
 * 折叠动效：grid-template-rows 0fr↔1fr 双向过渡（--dur-slow --ease-panel，
 * 展开/收起都有动画；内容常驻挂载不丢控件状态，收起时 visibility:hidden
 * 移出 Tab 序；reduced-motion 下瞬时切换），见 styles/params.css。
 * header 用 div 容器 + 独立 toggle 按钮，避免按钮嵌套。
 */
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export function ParamBlock({
  icon,
  title,
  children,
  defaultOpen = true,
  actions,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  /** header 右侧操作区（不参与折叠点击） */
  actions?: ReactNode;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="param-block">
      <div className="param-block-header">
        <button
          type="button"
          className="param-block-toggle"
          aria-expanded={open}
          aria-label={`${title} — ${open ? t('common.collapse') : t('common.expand')}`}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="param-block-icon" aria-hidden="true">
            {icon}
          </span>
          <span className="param-block-title">{title}</span>
          <svg
            className="param-block-chevron"
            data-open={open ? 'true' : 'false'}
            width="10"
            height="10"
            viewBox="0 0 12 12"
            aria-hidden="true"
          >
            <path
              d="M4 2l4 4-4 4"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {actions ? <div className="flex flex-none items-center gap-1">{actions}</div> : null}
      </div>
      <div className="param-collapse" data-open={open ? 'true' : 'false'} aria-hidden={!open}>
        <div className="param-collapse-inner">
          <div className="param-block-body">{children}</div>
        </div>
      </div>
    </section>
  );
}
