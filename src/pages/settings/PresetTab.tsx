/**
 * 设置页「预设」Tab：编辑全局预设全部参数。
 * - edit 模式复用聊天页同一套参数控件（components/params/ParamSections）：
 *   直接改预设值（无高亮、无垃圾桶——高亮/垃圾桶只属于会话 overrides 语义）；
 * - 「恢复出厂默认」按钮：ConfirmDialog 确认后 resetGlobalPreset()；
 * - 用户预设不在此 Tab 管理（在聊天页 Preset 块新建/重命名/删除）。
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ParamOverridesPatch, ParamValues } from '@shared/types';
import { usePresetsStore, useGlobalPreset } from '../../store/presets';
import { useUiStore } from '../../store/ui';
import { ConfirmDialog } from '../../components/Modal';
import { ParamBlock } from '../../components/params/Block';
import {
  SamplingSection,
  SectionIcons,
  SettingsSection,
  StructuredSection,
  SystemPromptSection,
} from '../../components/params/ParamSections';

export function PresetTab() {
  const { t } = useTranslation();
  const loaded = usePresetsStore((s) => s.loaded);
  const global = useGlobalPreset();
  const updateParams = usePresetsStore((s) => s.updateParams);
  const resetGlobal = usePresetsStore((s) => s.resetGlobal);
  const toast = useUiStore((s) => s.toast);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!loaded || !global) {
    return (
      <section aria-label={t('settings.tabs.presets')}>
        <p className="px-1 py-6 text-xs text-tertiary">{t('common.loading')}</p>
      </section>
    );
  }

  // edit 模式：patch 永不含 null；store 内本地即时 + 防抖写库
  const onPatch = (patch: ParamOverridesPatch): void => {
    updateParams(global.id, { ...global.params, ...(patch as ParamValues) });
  };

  const confirmReset = async (): Promise<void> => {
    setBusy(true);
    try {
      await resetGlobal();
      toast('success', t('toast.presetReset'));
    } catch {
      toast('error', t('toast.errorGeneric'));
    } finally {
      setBusy(false);
      setConfirmingReset(false);
    }
  };

  const sectionProps = { values: global.params, onPatch };

  return (
    <section aria-label={t('settings.tabs.presets')}>
      <div className="row-surface mb-3 flex items-center justify-between gap-4 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[0.8125rem] font-medium">{t('settings.presets.globalTitle')}</p>
          <p className="mt-0.5 text-[0.6875rem] text-tertiary">{t('settings.presets.desc')}</p>
        </div>
        <button
          type="button"
          className="btn btn-surface btn-danger flex-none"
          aria-label={t('settings.presets.resetFactory')}
          onClick={() => setConfirmingReset(true)}
        >
          {t('settings.presets.resetFactory')}
        </button>
      </div>

      <div className="row-surface px-4 py-2">
        <ParamBlock icon={SectionIcons.systemPrompt} title={t('params.blocks.systemPrompt')}>
          <SystemPromptSection {...sectionProps} />
        </ParamBlock>
        <ParamBlock icon={SectionIcons.settings} title={t('params.blocks.settings')}>
          <SettingsSection {...sectionProps} />
        </ParamBlock>
        <ParamBlock icon={SectionIcons.sampling} title={t('params.blocks.sampling')}>
          <SamplingSection {...sectionProps} />
        </ParamBlock>
        <ParamBlock icon={SectionIcons.structured} title={t('params.blocks.structured')}>
          <StructuredSection {...sectionProps} />
        </ParamBlock>
      </div>

      {confirmingReset ? (
        <ConfirmDialog
          title={t('settings.presets.resetTitle')}
          body={t('settings.presets.resetBody')}
          confirmLabel={t('settings.presets.resetFactory')}
          danger
          busy={busy}
          onCancel={() => setConfirmingReset(false)}
          onConfirm={() => void confirmReset()}
        />
      ) : null}
    </section>
  );
}
