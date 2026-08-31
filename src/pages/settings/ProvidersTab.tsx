/**
 * 平台管理标签页（kimi.md §3.2）：
 * - 平台卡片列表；展开显示已勾选模型：状态圆点（绿 ok+延迟 / 红 fail 悬浮错误 / 灰 unknown）；
 * - 单个"检测" + "全部检测"（onModelCheck 事件实时更新，见 App 订阅）；
 * - 删除确认框显示"该平台的 N 个会话将保留，但需重新指定模型"。
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Provider, ProviderModel } from '@shared/types';
import { getApi } from '../../bridge';
import { useProvidersStore } from '../../store/providers';
import { useConversationsStore } from '../../store/conversations';
import { useUiStore } from '../../store/ui';
import { ConfirmDialog } from '../../components/Modal';
import { formatLatency } from '../../lib/format';
import { summarizeIpcError } from '../../lib/errors';
import { ProviderModal } from './ProviderModal';

function StatusDot({ model }: { model: ProviderModel }) {
  const { t, i18n } = useTranslation();
  const check = model.last_check;
  const status = check?.status ?? 'unknown';
  const color =
    status === 'ok'
      ? 'var(--success)'
      : status === 'fail'
        ? 'var(--danger)'
        : 'var(--text-tertiary)';
  const label =
    status === 'ok'
      ? `${t('settings.providers.status.ok')}${check?.latency_ms != null ? ` · ${formatLatency(check.latency_ms, i18n.language)}` : ''}`
      : status === 'fail'
        ? `${t('settings.providers.status.fail')}${check?.error ? ` · ${check.error}` : ''}`
        : t('settings.providers.status.unknown');
  return (
    <span className="inline-flex flex-none items-center gap-1.5" title={label} aria-label={label}>
      <span
        className="inline-block h-2 w-2 rounded-pill"
        style={{ background: color }}
        aria-hidden="true"
      />
      <span className="text-[0.6875rem] text-tertiary">
        {status === 'ok' && check?.latency_ms != null
          ? formatLatency(check.latency_ms, i18n.language)
          : t(`settings.providers.status.${status}`)}
      </span>
    </span>
  );
}

function ProviderCard({ provider }: { provider: Provider }) {
  const { t } = useTranslation();
  const toast = useUiStore((s) => s.toast);
  const remove = useProvidersStore((s) => s.remove);
  const applyModelCheck = useProvidersStore((s) => s.applyModelCheck);
  const conversations = useConversationsStore((s) => s.conversations);

  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testingAll, setTestingAll] = useState(false);
  const [testingOne, setTestingOne] = useState<string | null>(null);

  const enabledModels = provider.models.filter((m) => m.enabled);
  const affected = conversations.filter((c) => c.provider_id === provider.id).length;

  const testOne = async (modelId: string): Promise<void> => {
    setTestingOne(modelId);
    try {
      const check = await getApi().testModel(provider.id, modelId);
      applyModelCheck(provider.id, modelId, check);
    } catch (e) {
      toast('error', summarizeIpcError(e));
    } finally {
      setTestingOne(null);
    }
  };

  const testAll = async (): Promise<void> => {
    setTestingAll(true);
    try {
      // 结果逐个经 onModelCheck 事件回流（App 层订阅），这里只等收尾
      await getApi().testAllModels(provider.id);
    } catch (e) {
      toast('error', summarizeIpcError(e));
    } finally {
      setTestingAll(false);
    }
  };

  return (
    <div className="row-surface mb-3">
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[0.875rem] font-medium">{provider.name}</span>
            <span className="badge flex-none">{provider.api_format}</span>
            <span
              className="badge flex-none"
              style={{
                color: provider.has_key ? 'var(--success-text)' : 'var(--warning-text)',
              }}
            >
              {provider.has_key ? t('settings.providers.keyYes') : t('settings.providers.keyNo')}
            </span>
          </div>
          <div className="truncate text-[0.6875rem] text-tertiary" title={provider.base_url}>
            {provider.base_url}
          </div>
        </div>
        <div
          className="flex flex-none items-center gap-1"
          role="toolbar"
          aria-label={t('aria.providerActions')}
        >
          <button
            type="button"
            className="btn btn-surface"
            style={{ minHeight: '1.75rem', fontSize: '0.75rem' }}
            disabled={testingAll || enabledModels.length === 0}
            onClick={() => void testAll()}
          >
            {testingAll ? t('settings.providers.testing') : t('settings.providers.testAll')}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ minHeight: '1.75rem', fontSize: '0.75rem' }}
            onClick={() => setEditing(true)}
          >
            {t('common.edit')}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-danger"
            style={{ minHeight: '1.75rem', fontSize: '0.75rem' }}
            onClick={() => setConfirming(true)}
          >
            {t('common.delete')}
          </button>
          <button
            type="button"
            className="btn btn-ghost icon-btn"
            aria-label={expanded ? t('common.collapse') : t('common.expand')}
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            <svg
              width="10"
              height="6"
              viewBox="0 0 10 6"
              aria-hidden="true"
              style={{ transform: expanded ? 'rotate(180deg)' : undefined }}
            >
              <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="border-t hairline px-3.5 py-2">
          {enabledModels.length === 0 ? (
            <p className="py-1 text-xs text-tertiary">{t('settings.providers.modelListEmpty')}</p>
          ) : (
            <ul className="m-0 list-none p-0">
              {enabledModels.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center gap-2 border-b hairline py-1.5 last:border-b-0"
                  style={{ minHeight: '2rem' }}
                >
                  <StatusDot model={m} />
                  <span className="min-w-0 flex-1 truncate text-xs" title={m.id}>
                    {m.display_name || m.id}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost flex-none"
                    style={{ minHeight: '1.625rem', fontSize: '0.6875rem', padding: '0 0.5rem' }}
                    disabled={testingOne === m.id || testingAll}
                    onClick={() => void testOne(m.id)}
                    aria-label={`${t('aria.testModel')} ${m.id}`}
                  >
                    {testingOne === m.id
                      ? t('settings.providers.testingOne')
                      : t('settings.providers.test')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {editing ? <ProviderModal provider={provider} onClose={() => setEditing(false)} /> : null}
      {confirming ? (
        <ConfirmDialog
          title={t('settings.providers.deleteTitle')}
          body={t('settings.providers.deleteBody', { count: affected })}
          confirmLabel={t('common.delete')}
          danger
          busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setBusy(true);
            remove(provider.id)
              .then(() => useConversationsStore.getState().refresh())
              .catch(() => toast('error', t('toast.errorGeneric')))
              .finally(() => {
                setBusy(false);
                setConfirming(false);
              });
          }}
        />
      ) : null}
    </div>
  );
}

export function ProvidersTab() {
  const { t } = useTranslation();
  const providers = useProvidersStore((s) => s.providers);
  const loaded = useProvidersStore((s) => s.loaded);
  const [adding, setAdding] = useState(false);

  return (
    <section aria-label={t('settings.tabs.providers')}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{t('settings.tabs.providers')}</h2>
        <button type="button" className="btn btn-accent btn-pill" onClick={() => setAdding(true)}>
          + {t('settings.providers.add')}
        </button>
      </div>

      {loaded && providers.length === 0 ? (
        <div className="row-surface px-6 py-10 text-center">
          <p className="mb-1 text-sm font-medium">{t('settings.providers.empty')}</p>
          <p className="text-xs text-secondary">{t('settings.providers.emptyHint')}</p>
        </div>
      ) : (
        providers.map((p) => <ProviderCard key={p.id} provider={p} />)
      )}

      {adding ? <ProviderModal provider={null} onClose={() => setAdding(false)} /> : null}
    </section>
  );
}
