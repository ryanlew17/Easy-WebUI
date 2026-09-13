/**
 * 右栏：LM Studio 式参数面板（可折叠分块；面板宽度拖拽把手在 ChatPage）。
 *
 * 分块（从上到下）：Preset / System Prompt / Settings / Sampling / Structured Output。
 * 生效参数 = 全局预设 ← 选中用户预设 ← 会话 overrides（shared/params.ts resolveParams）；
 * 每个参数（组）与预设基线不一致时 label 高亮（accent 圆点+文字）并显示垃圾桶，
 * 点击垃圾桶删除该组 override（值立即回落预设）；改回与预设相等时 override 自动修剪。
 * 所有变更即写库（patchParams 本地即时 + 防抖落库）。
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Conversation, ParamOverridesPatch } from '@shared/types';
import { FACTORY_DEFAULTS, resolveParams } from '@shared/params';
import { useConversationsStore } from '../../store/conversations';
import { useGlobalPreset, usePresetById } from '../../store/presets';
import { FieldRow } from '../../components/controls';
import { ParamBlock } from '../../components/params/Block';
import {
  SamplingSection,
  SectionIcons,
  SettingsSection,
  StructuredSection,
  SystemPromptSection,
} from '../../components/params/ParamSections';
import { ModelPicker } from './ModelPicker';
import { PresetBlock } from './params/PresetBlock';

export function ParamsPanel({ conv }: { conv: Conversation }) {
  const { t } = useTranslation();
  const patch = useConversationsStore((s) => s.patch);
  const patchParams = useConversationsStore((s) => s.patchParams);
  const globalPreset = useGlobalPreset();
  const preset = usePresetById(conv.preset_id);

  const globalParams = globalPreset?.params ?? FACTORY_DEFAULTS;
  /** 覆盖基线（全局←预设，不含会话 overrides）与生效值 */
  const base = useMemo(() => resolveParams(globalParams, preset, {}), [globalParams, preset]);
  const effective = useMemo(
    () => resolveParams(globalParams, preset, conv.overrides),
    [globalParams, preset, conv.overrides],
  );

  const onPatch = (p: ParamOverridesPatch): void => patchParams(conv.id, p);

  const onModelSelect = (pid: string, mid: string): void => {
    // 模型切换不回溯历史消息（docs/design/params.md）；provider_id/model 只存顶层字段
    void patch(conv.id, { provider_id: pid, model: mid }).catch(() => undefined);
  };

  const sectionProps = { values: effective, base, overrides: conv.overrides, onPatch };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <div className="param-block mb-1.5" style={{ padding: '0.25rem 0.625rem' }}>
        <FieldRow label={t('params.model')}>
          <ModelPicker providerId={conv.provider_id} model={conv.model} onSelect={onModelSelect} />
        </FieldRow>
      </div>

      <PresetBlock conv={conv} />

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
  );
}
