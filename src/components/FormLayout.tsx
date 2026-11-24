import type { ReactNode } from 'react';

// @req REQ-2026-006：设置与参数面板共享字段栅格，长文本使用显式堆叠变体。
export function FormRow({
  label,
  hint,
  layout = 'inline',
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  layout?: 'inline' | 'stack';
  children: ReactNode;
}) {
  return (
    <div className="field-row" data-layout={layout}>
      <div className="field-row-copy">
        <div className="field-row-label">{label}</div>
        {hint ? <div className="field-row-hint">{hint}</div> : null}
      </div>
      <div className="field-row-control">{children}</div>
    </div>
  );
}

export function FormSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="form-section">
      <h2 className="form-section-title">{title}</h2>
      <div className="form-section-body">{children}</div>
    </section>
  );
}
