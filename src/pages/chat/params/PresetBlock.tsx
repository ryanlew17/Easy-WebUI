/**
 * Preset 分块（聊天页参数面板顶部）：
 * - 预设下拉：「全局预设（默认）」(preset_id=null) + 全部用户预设；
 * - 另存为新预设：把当前生效参数（全局←预设←overrides 解析后的值）存为新预设，
 *   行内小输入框命名（Enter 确认 / Esc 取消），保存后自动选中新预设；
 * - 选中用户预设时可重命名（行内输入框）/ 删除（ConfirmDialog；删除后引用它的
 *   会话 preset_id 由后端置 null，前端刷新会话列表）；
 * - 全局预设不可在聊天页编辑（无重命名/删除入口；预设参数编辑在设置页预设 Tab）。
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Conversation } from '@shared/types';
import { FACTORY_DEFAULTS, GLOBAL_PRESET_ID, resolveParams } from '@shared/params';
import { useConversationsStore } from '../../../store/conversations';
import { usePresetsStore } from '../../../store/presets';
import { useUiStore } from '../../../store/ui';
import { ConfirmDialog } from '../../../components/Modal';
import { SelectField } from '../../../components/controls';
import { ParamBlock } from '../../../components/params/Block';
import { SectionIcons } from '../../../components/params/ParamSections';

export function PresetBlock({ conv }: { conv: Conversation }) {
  const { t } = useTranslation();
  const presets = usePresetsStore((s) => s.presets);
  const createPreset = usePresetsStore((s) => s.create);
  const renamePreset = usePresetsStore((s) => s.rename);
  const removePreset = usePresetsStore((s) => s.remove);
  const patch = useConversationsStore((s) => s.patch);
  const refreshConversations = useConversationsStore((s) => s.refresh);
  const toast = useUiStore((s) => s.toast);

  const [editing, setEditing] = useState<'none' | 'save' | 'rename'>('none');
  const [nameDraft, setNameDraft] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const globalPreset = presets.find((p) => p.is_global) ?? null;
  const selected = conv.preset_id ? (presets.find((p) => p.id === conv.preset_id) ?? null) : null;
  const effective = resolveParams(globalPreset?.params ?? FACTORY_DEFAULTS, selected, conv.overrides);

  const onSelect = (id: string): void => {
    void patch(conv.id, { preset_id: id === GLOBAL_PRESET_ID ? null : id }).catch(() =>
      toast('error', t('toast.errorGeneric')),
    );
  };

  const commitSaveAs = async (): Promise<void> => {
    const name = nameDraft.trim();
    if (!name) return;
    setBusy(true);
    try {
      const created = await createPreset(name, effective);
      await patch(conv.id, { preset_id: created.id });
      setEditing('none');
      setNameDraft('');
      toast('success', t('toast.presetSaved'));
    } catch {
      toast('error', t('toast.errorGeneric'));
    } finally {
      setBusy(false);
    }
  };

  const commitRename = async (): Promise<void> => {
    const name = nameDraft.trim();
    if (!name || !selected) return;
    setBusy(true);
    try {
      await renamePreset(selected.id, name);
      setEditing('none');
      setNameDraft('');
    } catch {
      toast('error', t('toast.errorGeneric'));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async (): Promise<void> => {
    if (!selected) return;
    setBusy(true);
    try {
      await removePreset(selected.id);
      // 后端已把引用会话的 preset_id 置 null，刷新会话列表同步视图
      await refreshConversations();
      toast('success', t('toast.presetDeleted'));
    } catch {
      toast('error', t('toast.errorGeneric'));
    } finally {
      setBusy(false);
      setConfirmingDelete(false);
    }
  };

  return (
    <ParamBlock icon={SectionIcons.preset} title={t('params.blocks.preset')}>
      <SelectField
        value={selected?.id ?? GLOBAL_PRESET_ID}
        ariaLabel={t('params.preset.select')}
        options={[
          { value: GLOBAL_PRESET_ID, label: t('params.preset.global') },
          ...presets
            .filter((p) => !p.is_global)
            .map((p) => ({ value: p.id, label: p.name })),
        ]}
        onChange={onSelect}
      />

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          className="btn btn-surface"
          style={{ minHeight: '1.75rem', fontSize: '0.75rem' }}
          aria-label={t('params.preset.saveAs')}
          onClick={() => {
            setNameDraft('');
            setEditing(editing === 'save' ? 'none' : 'save');
          }}
        >
          {t('params.preset.saveAs')}
        </button>
        {selected ? (
          <>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ minHeight: '1.75rem', fontSize: '0.75rem' }}
              aria-label={t('params.preset.rename')}
              onClick={() => {
                setNameDraft(selected.name);
                setEditing(editing === 'rename' ? 'none' : 'rename');
              }}
            >
              {t('common.rename')}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-danger"
              style={{ minHeight: '1.75rem', fontSize: '0.75rem' }}
              aria-label={t('params.preset.delete')}
              onClick={() => setConfirmingDelete(true)}
            >
              {t('common.delete')}
            </button>
          </>
        ) : null}
      </div>

      {editing !== 'none' ? (
        <div className="mt-2 flex items-center gap-1.5">
          <input
            type="text"
            className="input-surface min-w-0 flex-1"
            style={{ minHeight: '1.75rem' }}
            value={nameDraft}
            autoFocus
            disabled={busy}
            aria-label={
              editing === 'save' ? t('params.preset.saveAs') : t('params.preset.rename')
            }
            placeholder={t('params.preset.namePlaceholder')}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                void (editing === 'save' ? commitSaveAs() : commitRename());
              }
              if (e.key === 'Escape') {
                setEditing('none');
                setNameDraft('');
              }
            }}
          />
          <button
            type="button"
            className="btn btn-accent flex-none"
            style={{ minHeight: '1.75rem', fontSize: '0.75rem' }}
            disabled={busy || nameDraft.trim().length === 0}
            aria-label={t('common.save')}
            onClick={() => void (editing === 'save' ? commitSaveAs() : commitRename())}
          >
            {t('common.save')}
          </button>
        </div>
      ) : null}

      {confirmingDelete && selected ? (
        <ConfirmDialog
          title={t('params.preset.deleteTitle')}
          body={t('params.preset.deleteBody', { name: selected.name })}
          confirmLabel={t('common.delete')}
          danger
          busy={busy}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}
    </ParamBlock>
  );
}
