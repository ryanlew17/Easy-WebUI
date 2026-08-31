/**
 * 模型选择器：按平台分组列出已启用模型（enabledModelsByProvider）。
 * 触发按钮显示当前模型（长名 ellipsis）；弹层为 .glass-pop 强玻璃浮层（临时态，防透底）；
 * 进/退场走 .pop-layer + useDelayedUnmount（150ms），与 SelectField 同一视觉/动效规范。
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { enabledModelsByProvider, useProvidersStore } from '../../store/providers';
import { useUiStore } from '../../store/ui';
import { useDelayedUnmount } from '../../lib/useDelayedUnmount';

export function ModelPicker({
  providerId,
  model,
  onSelect,
}: {
  providerId: string | null;
  model: string | null;
  onSelect: (providerId: string, modelId: string) => void;
}) {
  const { t } = useTranslation();
  const providers = useProvidersStore((s) => s.providers);
  const openSettings = useUiStore((s) => s.openSettings);
  const [open, setOpen] = useState(false);
  const pop = useDelayedUnmount(open, 150);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const groups = enabledModelsByProvider(providers);
  const currentLabel = model ?? t('chat.selectModel');

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        className="btn btn-surface max-w-full"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('aria.modelPicker')}
      >
        <span className="truncate">{currentLabel}</span>
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
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
      </button>

      {pop.mounted ? (
        <div
          role="listbox"
          aria-label={t('aria.modelPicker')}
          className="glass-pop pop-layer absolute left-0 top-full z-40 mt-1.5 max-h-80 w-72 overflow-y-auto p-1.5"
          data-closing={pop.closing ? 'true' : undefined}
        >
          {groups.length === 0 ? (
            <div className="px-3 py-3 text-xs text-secondary">
              <p className="mb-1 font-medium text-primary">{t('chat.noModels')}</p>
              <p className="mb-2.5">{t('chat.noModelsHint')}</p>
              <button
                type="button"
                className="btn btn-accent btn-pill"
                onClick={() => {
                  setOpen(false);
                  openSettings('providers');
                }}
              >
                {t('chat.manageProviders')}
              </button>
            </div>
          ) : (
            groups.map(({ provider, models }) => (
              <div key={provider.id} className="mb-1 last:mb-0">
                <div className="truncate px-2.5 pb-1 pt-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-tertiary">
                  {provider.name}
                </div>
                {models.map((m) => {
                  const active = provider.id === providerId && m.id === model;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className="select-option w-full"
                      style={{
                        background: active ? 'var(--accent-soft)' : undefined,
                        color: active ? 'var(--accent)' : undefined,
                      }}
                      onClick={() => {
                        onSelect(provider.id, m.id);
                        setOpen(false);
                      }}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="inline-block h-1.5 w-1.5 flex-none rounded-pill"
                          style={{
                            background:
                              m.last_check?.status === 'ok'
                                ? 'var(--success)'
                                : m.last_check?.status === 'fail'
                                  ? 'var(--danger)'
                                  : 'var(--text-tertiary)',
                          }}
                          aria-hidden="true"
                        />
                        <span className="truncate">{m.display_name || m.id}</span>
                      </span>
                      {active ? (
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
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
