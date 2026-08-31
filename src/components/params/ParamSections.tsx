/**
 * 参数分区控件集（System Prompt / Settings / Sampling / Structured Output）——
 * 聊天页参数面板（override 模式）与设置页预设 Tab（edit 模式）共用同一套控件。
 *
 * - override 模式：传 base（预设基线）+ overrides，逐行计算 modified（值比较），
 *   label 右侧渲染垃圾桶（onReset → patch 各键传 null 删除 override）；
 * - edit 模式（设置页直接编辑预设值）：省略 base/overrides，无高亮无垃圾桶，
 *   onPatch 只携带新值（永不含 null）。
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ContextOverflow, ParamOverrides, ParamOverridesPatch, ParamValues } from '@shared/types';
import { PARAM_GROUPS, isGroupModified, type ParamGroupKey } from '@shared/params';
import {
  IconBraces,
  IconDoc,
  IconNote,
  IconSliders,
  IconSparkle,
} from '../icons';
import {
  Checkbox,
  FieldRow,
  InfoTip,
  NumberField,
  SelectField,
  SliderField,
  TextAreaField,
  TextField,
  Toggle,
} from '../controls';

export interface ParamSectionsProps {
  /** 当前展示值：override 模式=生效值；edit 模式=预设值 */
  values: ParamValues;
  onPatch: (patch: ParamOverridesPatch) => void;
  /** override 模式的判定基准（= 全局预设 ← 选中用户预设，不含会话 overrides） */
  base?: ParamValues;
  overrides?: ParamOverrides;
}

type SingleKey = keyof ParamValues;

interface RowExtras {
  modified: boolean;
  onReset?: () => void;
  resetLabel?: string;
}

/** 分块图标（统一走 icons.tsx，16 视口墨迹居中） */
export const SectionIcons = {
  preset: <IconDoc size={13} />,
  systemPrompt: <IconNote size={13} />,
  settings: <IconSliders size={13} />,
  sampling: <IconSparkle size={13} />,
  structured: <IconBraces size={13} />,
};

/**
 * 勾选门控行（Limit Response Length / Repeat / Presence / Top P / Min P / Structured）：
 * label（+高亮点+垃圾桶）居左，勾选框/开关居右；勾选后下方展开子控件。
 */
function GatedRow({
  label,
  hint,
  control,
  expanded,
  modified,
  onReset,
  resetLabel,
  children,
}: {
  label: string;
  hint?: string;
  control: ReactNode;
  expanded: boolean;
  modified: boolean;
  onReset?: () => void;
  resetLabel?: string;
  children?: ReactNode;
}) {
  return (
    <div className="py-2">
      <div className="param-check-row">
        <div className="flex min-w-0 items-center gap-1.5">
          {modified ? <span className="param-dot" aria-hidden="true" /> : null}
          <span
            className="text-xs font-medium"
            style={{ color: modified ? 'var(--accent)' : 'var(--text-secondary)' }}
          >
            {label}
          </span>
          {hint ? <InfoTip text={hint} /> : null}
          {modified && onReset ? (
            <button
              type="button"
              className="btn btn-ghost param-icon-btn"
              title={resetLabel}
              aria-label={resetLabel}
              onClick={onReset}
            >
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9.5h6.6L12 4"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          ) : null}
        </div>
        {control}
      </div>
      {expanded ? <div className="mt-1.5">{children}</div> : null}
    </div>
  );
}

/** 计算某行（单键或参数组）的 modified/onReset/resetLabel（edit 模式全为假值） */
function useRowExtras(props: ParamSectionsProps): (keys: readonly SingleKey[]) => RowExtras {
  const { t } = useTranslation();
  const { base, overrides, onPatch } = props;
  return (keys) => {
    if (!base || !overrides) return { modified: false };
    const modified = isGroupModified(base, overrides, keys);
    if (!modified) return { modified: false };
    return {
      modified: true,
      onReset: () =>
        onPatch(Object.fromEntries(keys.map((k) => [k, null])) as ParamOverridesPatch),
      resetLabel: t('params.resetToPreset'),
    };
  };
}

/* ---------------- System Prompt ---------------- */

export function SystemPromptSection(props: ParamSectionsProps) {
  const { t } = useTranslation();
  const row = useRowExtras(props);
  const { values, onPatch } = props;
  return (
    <FieldRow label={t('params.systemPrompt')} {...row(['system_prompt'])}>
      <TextAreaField
        value={values.system_prompt}
        rows={4}
        ariaLabel={t('params.systemPrompt')}
        placeholder={t('params.systemPromptPlaceholder')}
        onCommit={(v) => onPatch({ system_prompt: v })}
      />
    </FieldRow>
  );
}

/* ---------------- Settings ---------------- */

const OVERFLOW_OPTIONS: ContextOverflow[] = ['rolling', 'truncate_middle', 'stop'];

export function SettingsSection(props: ParamSectionsProps) {
  const { t } = useTranslation();
  const row = useRowExtras(props);
  const { values, onPatch } = props;
  return (
    <>
      <FieldRow label={t('params.temperature')} {...row(['temperature'])}>
        <SliderField
          value={values.temperature}
          min={0}
          max={2}
          step={0.01}
          ariaLabel={t('params.temperature')}
          onChange={(v) => onPatch({ temperature: v })}
        />
      </FieldRow>

      <GatedRow
        label={t('params.limitResponseLength')}
        control={
          <Checkbox
            checked={values.limit_response_length}
            label={t('params.limitResponseLength')}
            onChange={(v) => onPatch({ limit_response_length: v })}
          />
        }
        expanded={values.limit_response_length}
        {...row(PARAM_GROUPS.limit)}
      >
        <SliderField
          value={values.max_tokens}
          min={1}
          max={128000}
          step={1}
          ariaLabel={t('params.maxTokens')}
          onChange={(v) => onPatch({ max_tokens: v })}
        />
      </GatedRow>

      <FieldRow label={t('params.contextOverflow')} {...row(['context_overflow'])}>
        <SelectField<ContextOverflow>
          value={values.context_overflow}
          ariaLabel={t('params.contextOverflow')}
          options={OVERFLOW_OPTIONS.map((v) => ({ value: v, label: t(`params.overflow.${v}`) }))}
          onChange={(v) => onPatch({ context_overflow: v })}
        />
      </FieldRow>

      <FieldRow
        label={t('params.stopStrings')}
        hint={t('params.stopStringsHint')}
        {...row(['stop_strings'])}
      >
        <TextField
          value={values.stop_strings.join(', ')}
          ariaLabel={t('params.stopStrings')}
          placeholder={t('params.stopStringsPlaceholder')}
          onCommit={(v) =>
            onPatch({
              stop_strings: v
                .split(',')
                .map((s) => s.trim())
                .filter((s) => s.length > 0),
            })
          }
        />
      </FieldRow>

      <FieldRow label={t('params.contextWindow')} {...row(['context_window'])}>
        <NumberField
          value={values.context_window}
          min={256}
          max={2000000}
          ariaLabel={t('params.contextWindow')}
          onCommit={(v) => onPatch({ context_window: v })}
        />
      </FieldRow>

      <GatedRow
        label={t('params.stream')}
        control={
          <Toggle
            checked={values.stream}
            label={t('params.stream')}
            onChange={(v) => onPatch({ stream: v })}
          />
        }
        expanded={false}
        {...row(['stream'])}
      />
    </>
  );
}

/* ---------------- Sampling ---------------- */

export function SamplingSection(props: ParamSectionsProps) {
  const { t } = useTranslation();
  const row = useRowExtras(props);
  const { values, onPatch } = props;
  return (
    <>
      <FieldRow
        label={t('params.topK')}
        hint={t('params.zeroMeansOff')}
        {...row(['top_k'])}
      >
        <NumberField
          value={values.top_k}
          min={0}
          max={500}
          ariaLabel={t('params.topK')}
          onCommit={(v) => onPatch({ top_k: v })}
        />
      </FieldRow>

      <GatedRow
        label={t('params.repeatPenalty')}
        hint={t('params.repeatPenaltyHint')}
        control={
          <Checkbox
            checked={values.repeat_penalty_enabled}
            label={t('params.repeatPenalty')}
            onChange={(v) => onPatch({ repeat_penalty_enabled: v })}
          />
        }
        expanded={values.repeat_penalty_enabled}
        {...row(PARAM_GROUPS.repeat)}
      >
        <NumberField
          value={values.repeat_penalty}
          min={0}
          max={2}
          step={0.05}
          ariaLabel={t('params.repeatPenalty')}
          onCommit={(v) => onPatch({ repeat_penalty: v })}
        />
      </GatedRow>

      <GatedRow
        label={t('params.presencePenalty')}
        control={
          <Checkbox
            checked={values.presence_penalty_enabled}
            label={t('params.presencePenalty')}
            onChange={(v) => onPatch({ presence_penalty_enabled: v })}
          />
        }
        expanded={values.presence_penalty_enabled}
        {...row(PARAM_GROUPS.presence)}
      >
        <NumberField
          value={values.presence_penalty}
          min={-2}
          max={2}
          step={0.05}
          ariaLabel={t('params.presencePenalty')}
          onCommit={(v) => onPatch({ presence_penalty: v })}
        />
      </GatedRow>

      <GatedRow
        label={t('params.topP')}
        control={
          <Checkbox
            checked={values.top_p_enabled}
            label={t('params.topP')}
            onChange={(v) => onPatch({ top_p_enabled: v })}
          />
        }
        expanded={values.top_p_enabled}
        {...row(PARAM_GROUPS.top_p)}
      >
        <SliderField
          value={values.top_p}
          min={0}
          max={1}
          step={0.01}
          ariaLabel={t('params.topP')}
          onChange={(v) => onPatch({ top_p: v })}
        />
      </GatedRow>

      <GatedRow
        label={t('params.minP')}
        control={
          <Checkbox
            checked={values.min_p_enabled}
            label={t('params.minP')}
            onChange={(v) => onPatch({ min_p_enabled: v })}
          />
        }
        expanded={values.min_p_enabled}
        {...row(PARAM_GROUPS.min_p)}
      >
        <SliderField
          value={values.min_p}
          min={0}
          max={1}
          step={0.01}
          ariaLabel={t('params.minP')}
          onChange={(v) => onPatch({ min_p: v })}
        />
      </GatedRow>
    </>
  );
}

/* ---------------- Structured Output ---------------- */

export function StructuredSection(props: ParamSectionsProps) {
  const { t } = useTranslation();
  const row = useRowExtras(props);
  const { values, onPatch } = props;
  return (
    <GatedRow
      label={t('params.structuredEnable')}
      hint={t('params.structuredHint')}
      control={
        <Checkbox
          checked={values.structured_output_enabled}
          label={t('params.structuredEnable')}
          onChange={(v) => onPatch({ structured_output_enabled: v })}
        />
      }
      expanded={values.structured_output_enabled}
      {...row(PARAM_GROUPS.structured)}
    >
      <TextAreaField
        value={values.structured_output_schema}
        rows={6}
        mono
        ariaLabel={t('params.structuredSchema')}
        placeholder={t('params.structuredSchemaPlaceholder')}
        onCommit={(v) => onPatch({ structured_output_schema: v })}
      />
    </GatedRow>
  );
}
