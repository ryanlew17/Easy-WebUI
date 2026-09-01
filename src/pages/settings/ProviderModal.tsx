/**
 * 新增/编辑平台模态框（prd.md §3.2）：
 * - 预置供应商快捷选择（12 家，点选自动填充 base_url + api_format）；
 * - API 密钥：编辑时留空 = 不修改；
 * - 响应格式三选 + 自动探测（失败不阻断保存）；
 * - 检测模型列表：成功弹复选框勾选；失败显示脱敏错误 + 手动添加模型 ID 兜底（硬性要求）。
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  ApiFormat,
  PresetProvider,
  Provider,
  ProviderModel,
} from '@shared/types';
import { getApi } from '../../bridge';
import { useProvidersStore } from '../../store/providers';
import { useUiStore } from '../../store/ui';
import { Modal } from '../../components/Modal';
import { Checkbox } from '../../components/controls';
import { summarizeIpcError } from '../../lib/errors';

const FORMATS: ApiFormat[] = ['openai-chat', 'openai-responses', 'anthropic'];

export function ProviderModal({
  provider,
  onClose,
}: {
  /** null = 新增 */
  provider: Provider | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useUiStore((s) => s.toast);
  const createProvider = useProvidersStore((s) => s.create);
  const updateProvider = useProvidersStore((s) => s.update);

  const [presets, setPresets] = useState<PresetProvider[]>([]);
  const [name, setName] = useState(provider?.name ?? '');
  const [baseUrl, setBaseUrl] = useState(provider?.base_url ?? '');
  const [apiKey, setApiKey] = useState('');
  const [format, setFormat] = useState<ApiFormat>(provider?.api_format ?? 'openai-chat');
  const [models, setModels] = useState<ProviderModel[]>(provider?.models ?? []);

  const [detecting, setDetecting] = useState(false);
  const [detectNote, setDetectNote] = useState<'ok' | 'fail' | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetched, setFetched] = useState<string[] | null>(null);
  const [fetchedChecked, setFetchedChecked] = useState<Record<string, boolean>>({});
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [manualId, setManualId] = useState('');
  const [saving, setSaving] = useState(false);
  const [nameTouched, setNameTouched] = useState(!!provider);

  useEffect(() => {
    void getApi()
      .getPresets()
      .then(setPresets)
      .catch(() => setPresets([]));
  }, []);

  const canSubmit = name.trim().length > 0 && baseUrl.trim().length > 0;

  const applyPreset = (preset: PresetProvider): void => {
    setBaseUrl(preset.base_url);
    setFormat(preset.api_format);
    if (!nameTouched) setName(preset.label);
    setDetectNote(null);
  };

  const draftPayload = () => ({
    name: name.trim(),
    base_url: baseUrl.trim(),
    api_format: format,
    ...(apiKey ? { api_key: apiKey } : {}),
  });

  const onDetect = async (): Promise<void> => {
    setDetecting(true);
    setDetectNote(null);
    try {
      const result = await getApi().detectFormat({
        base_url: baseUrl.trim(),
        api_key: apiKey || undefined,
        providerId: provider?.id,
      });
      if (result) {
        setFormat(result);
        setDetectNote('ok');
      } else {
        setDetectNote('fail');
      }
    } catch {
      setDetectNote('fail'); // 探测失败不阻断（prd.md §3.3）
    } finally {
      setDetecting(false);
    }
  };

  const onFetchModels = async (): Promise<void> => {
    setFetching(true);
    setFetchError(null);
    setFetched(null);
    try {
      // 已存平台且未改地址/密钥时用 providerId（主进程取已存密钥）；否则走 draft
      const useSavedKey =
        !!provider && !apiKey && provider.base_url === baseUrl.trim() && provider.api_format === format;
      const list = await getApi().fetchModels(
        useSavedKey ? { providerId: provider.id } : { draft: draftPayload() },
      );
      setFetched(list);
      const initial: Record<string, boolean> = {};
      for (const id of list) initial[id] = models.some((m) => m.id === id && m.enabled);
      setFetchedChecked(initial);
    } catch (e) {
      // 主进程错误已过 redact() + EASYUI_ERR: 编码；解码后展示（code 不丢失）
      setFetchError(summarizeIpcError(e));
    } finally {
      setFetching(false);
    }
  };

  const mergeFetched = (): void => {
    if (!fetched) return;
    setModels((prev) => {
      const map = new Map(prev.map((m) => [m.id, m]));
      for (const id of fetched) {
        if (fetchedChecked[id]) {
          map.set(id, { ...(map.get(id) ?? { id, last_check: { status: 'unknown' } }), enabled: true });
        }
      }
      return [...map.values()];
    });
    setFetched(null);
  };

  const addManual = (): void => {
    const id = manualId.trim();
    if (!id) return;
    setModels((prev) =>
      prev.some((m) => m.id === id)
        ? prev
        : [...prev, { id, enabled: true, last_check: { status: 'unknown' } }],
    );
    setManualId('');
  };

  const onSave = async (): Promise<void> => {
    if (!canSubmit || saving) return;
    setSaving(true);
    try {
      if (provider) {
        await updateProvider(provider.id, { ...draftPayload(), models });
      } else {
        await createProvider(draftPayload(), models);
      }
      toast('success', t('toast.saved'));
      onClose();
    } catch (e) {
      toast('error', summarizeIpcError(e));
    } finally {
      setSaving(false);
    }
  };

  const presetButtons = useMemo(
    () =>
      presets.map((preset) => (
        <button
          key={preset.key}
          type="button"
          className="btn btn-surface"
          style={{ minHeight: '1.75rem', padding: '0 0.625rem', fontSize: '0.75rem' }}
          title={preset.base_url}
          onClick={() => applyPreset(preset)}
        >
          {preset.label}
        </button>
      )),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [presets, nameTouched],
  );

  return (
    <Modal
      title={provider ? t('settings.providers.edit') : t('settings.providers.add')}
      onClose={onClose}
      maxWidthClass="max-w-xl"
      footer={
        <>
          <button type="button" className="btn btn-surface" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-accent"
            onClick={() => void onSave()}
            disabled={!canSubmit || saving}
          >
            {saving ? t('common.saving') : t('settings.providers.save')}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {presets.length > 0 ? (
          <div>
            <p className="mb-1.5 text-xs font-medium text-secondary">{t('settings.providers.preset')}</p>
            <div className="flex flex-wrap gap-1.5">{presetButtons}</div>
          </div>
        ) : null}

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-secondary">
            {t('settings.providers.nameLabel')}
          </span>
          <input
            className="input-surface"
            value={name}
            placeholder={t('settings.providers.namePlaceholder')}
            onChange={(e) => {
              setName(e.target.value);
              setNameTouched(true);
            }}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-secondary">
            {t('settings.providers.baseUrlLabel')}
          </span>
          <input
            className="input-surface"
            value={baseUrl}
            placeholder="https://api.openai.com"
            spellCheck={false}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-secondary">
            {t('settings.providers.apiKeyLabel')}
          </span>
          <input
            className="input-surface"
            type="password"
            value={apiKey}
            autoComplete="off"
            placeholder={
              provider
                ? t('settings.providers.apiKeyPlaceholderEdit')
                : t('settings.providers.apiKeyPlaceholderNew')
            }
            onChange={(e) => setApiKey(e.target.value)}
          />
        </label>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-secondary">
            {t('settings.providers.formatLabel')}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {FORMATS.map((f) => (
              <button
                key={f}
                type="button"
                className="btn btn-surface"
                style={{
                  minHeight: '1.75rem',
                  padding: '0 0.625rem',
                  fontSize: '0.75rem',
                  background: format === f ? 'var(--accent-soft)' : undefined,
                  borderColor: format === f ? 'var(--accent)' : undefined,
                }}
                aria-pressed={format === f}
                onClick={() => setFormat(f)}
              >
                {f}
              </button>
            ))}
            <button
              type="button"
              className="btn btn-ghost"
              style={{ minHeight: '1.75rem', fontSize: '0.75rem' }}
              disabled={detecting || !baseUrl.trim()}
              onClick={() => void onDetect()}
            >
              {detecting ? t('settings.providers.detecting') : t('settings.providers.detect')}
            </button>
            {detectNote === 'ok' ? (
              <span className="text-xs" style={{ color: 'var(--success-text)' }}>
                ✓ {t('settings.providers.detected')}：{format}
              </span>
            ) : null}
            {detectNote === 'fail' ? (
              <span className="text-xs" style={{ color: 'var(--warning-text)' }}>
                {t('settings.providers.detectFailed')}
              </span>
            ) : null}
          </div>
        </div>

        {/* 模型列表：检测获取 + 手动兜底 */}
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-xs font-medium text-secondary">{t('settings.providers.models')}</span>
            <button
              type="button"
              className="btn btn-surface"
              style={{ minHeight: '1.75rem', fontSize: '0.75rem' }}
              disabled={fetching || !baseUrl.trim()}
              onClick={() => void onFetchModels()}
            >
              {fetching ? t('settings.providers.fetching') : t('settings.providers.fetchModels')}
            </button>
          </div>

          {fetchError ? (
            <p className="mb-2 break-all text-xs" style={{ color: 'var(--danger-text)' }}>
              {t('settings.providers.fetchFailed')}：{fetchError}
            </p>
          ) : null}

          {fetched ? (
            <div className="row-surface mb-2 p-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs text-secondary">
                  {t('settings.providers.fetchSelectHint')}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ minHeight: '1.5rem', fontSize: '0.6875rem', padding: '0 0.5rem' }}
                  onClick={() => {
                    const all: Record<string, boolean> = {};
                    for (const id of fetched) all[id] = true;
                    setFetchedChecked(all);
                  }}
                >
                  {t('common.selectAll')}
                </button>
              </div>
              <div className="max-h-40 overflow-y-auto">
                {fetched.map((id) => (
                  <div
                    key={id}
                    className="flex cursor-pointer items-center gap-2 rounded-s px-1.5 py-1 text-xs"
                    style={{ minHeight: '2rem' }}
                    onClick={(e) => {
                      // 点击勾选框按钮自身已由 Checkbox 处理，避免冒泡造成双触发
                      if ((e.target as HTMLElement).closest('.checkbox')) return;
                      setFetchedChecked((prev) => ({ ...prev, [id]: !prev[id] }));
                    }}
                  >
                    <Checkbox
                      checked={!!fetchedChecked[id]}
                      onChange={(v) =>
                        setFetchedChecked((prev) => ({ ...prev, [id]: v }))
                      }
                      label={id}
                    />
                    <span className="truncate" title={id}>
                      {id}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ minHeight: '1.75rem', fontSize: '0.75rem' }}
                  onClick={() => setFetched(null)}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  className="btn btn-accent"
                  style={{ minHeight: '1.75rem', fontSize: '0.75rem' }}
                  onClick={mergeFetched}
                >
                  {t('common.confirm')}
                </button>
              </div>
            </div>
          ) : null}

          {/* 手动添加（列表接口不可用的端点兜底 —— 硬性要求） */}
          <div className="mb-2 flex gap-2">
            <input
              className="input-surface flex-1"
              value={manualId}
              placeholder={t('settings.providers.manualPlaceholder')}
              aria-label={t('settings.providers.addModelManual')}
              onChange={(e) => setManualId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addManual();
                }
              }}
            />
            <button
              type="button"
              className="btn btn-surface flex-none"
              onClick={addManual}
              disabled={!manualId.trim()}
            >
              {t('common.add')}
            </button>
          </div>

          {models.length === 0 ? (
            <p className="text-xs text-tertiary">{t('settings.providers.modelListEmpty')}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {models.map((m) => (
                <span key={m.id} className="badge max-w-full gap-1" style={{ minHeight: '1.625rem' }}>
                  <span className="truncate" title={m.id}>
                    {m.display_name || m.id}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost icon-btn"
                    style={{ width: '1.25rem', height: '1.25rem', minHeight: '1.25rem' }}
                    aria-label={`${t('common.remove')} ${m.id}`}
                    onClick={() => setModels((prev) => prev.filter((x) => x.id !== m.id))}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
