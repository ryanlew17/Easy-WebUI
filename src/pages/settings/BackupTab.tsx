/**
 * 备份管理标签页（docs/design/storage.md，备份与恢复 UX）：
 * - 创建备份：弹窗勾选是否含密钥；含密钥需 ≥8 位密码二次确认；
 * - 备份列表：时间/大小/是否含密钥/删除（确认）/打开所在目录；
 * - 恢复：pickBackupFile → 选合并/覆盖（覆盖二次确认）→ 完成后显示导入统计。
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BackupFileInfo, ImportResult } from '@shared/types';
import { getApi } from '../../bridge';
import { useUiStore } from '../../store/ui';
import { useProvidersStore } from '../../store/providers';
import { useConversationsStore } from '../../store/conversations';
import { ConfirmDialog, Modal } from '../../components/Modal';
import { formatBytes, formatDateTime } from '../../lib/format';
import { summarizeIpcError } from '../../lib/errors';

/* ---------- 创建备份弹窗 ---------- */
function CreateBackupModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useUiStore((s) => s.toast);
  const [includeKeys, setIncludeKeys] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const passwordError =
    includeKeys && password.length > 0 && password.length < 8
      ? t('settings.backup.passwordTooShort')
      : includeKeys && confirm.length > 0 && confirm !== password
        ? t('settings.backup.passwordMismatch')
        : null;
  const valid = !includeKeys || (password.length >= 8 && confirm === password);

  const onCreate = async (): Promise<void> => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const info = await getApi().createBackup({
        includeKeys,
        password: includeKeys ? password : undefined,
      });
      toast('success', t('settings.backup.createDone', { name: info.filename }));
      onClose();
    } catch (e) {
      toast('error', summarizeIpcError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={t('settings.backup.create')}
      onClose={onClose}
      maxWidthClass="max-w-md"
      footer={
        <>
          <button type="button" className="btn btn-surface" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-accent"
            disabled={!valid || busy}
            onClick={() => void onCreate()}
          >
            {busy ? t('settings.backup.creating') : t('settings.backup.create')}
          </button>
        </>
      }
    >
      <label className="flex cursor-pointer items-start gap-2 py-1" style={{ minHeight: '2rem' }}>
        <input
          type="checkbox"
          className="mt-1"
          checked={includeKeys}
          onChange={(e) => setIncludeKeys(e.target.checked)}
        />
        <span>
          <span className="block text-[0.8125rem]">{t('settings.backup.includeKeys')}</span>
          <span className="block text-[0.6875rem] text-tertiary">
            {t('settings.backup.includeKeysHint')}
          </span>
        </span>
      </label>

      {includeKeys ? (
        <div className="mt-3 flex flex-col gap-2.5">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-secondary">
              {t('settings.backup.password')}
            </span>
            <input
              type="password"
              className="input-surface"
              value={password}
              autoComplete="new-password"
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-secondary">
              {t('settings.backup.passwordConfirm')}
            </span>
            <input
              type="password"
              className="input-surface"
              value={confirm}
              autoComplete="new-password"
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
          {passwordError ? (
            <p className="text-xs" style={{ color: 'var(--danger-text)' }}>
              {passwordError}
            </p>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}

/* ---------- 恢复备份弹窗（模式选择 → 覆盖需二次确认 → 统计） ---------- */
function RestoreModal({ path, onClose }: { path: string; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useUiStore((s) => s.toast);
  const [mode, setMode] = useState<'merge' | 'overwrite'>('merge');
  const [password, setPassword] = useState('');
  const [confirmingOverwrite, setConfirmingOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const doRestore = async (): Promise<void> => {
    setBusy(true);
    try {
      const res = await getApi().restoreBackup({
        path,
        password: password || undefined,
        mode,
      });
      setResult(res);
      // 数据层已重载：刷新 UI 两个主列表
      await Promise.all([
        useProvidersStore.getState().load(),
        useConversationsStore.getState().load(),
      ]);
    } catch (e) {
      toast('error', summarizeIpcError(e));
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (): void => {
    if (mode === 'overwrite') {
      setConfirmingOverwrite(true);
    } else {
      void doRestore();
    }
  };

  return (
    <Modal
      title={t('settings.backup.restoreTitle')}
      onClose={onClose}
      maxWidthClass="max-w-md"
      footer={
        result ? (
          <button type="button" className="btn btn-accent" onClick={onClose}>
            {t('common.close')}
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-surface" onClick={onClose} disabled={busy}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-accent"
              disabled={busy}
              onClick={onSubmit}
            >
              {busy ? t('settings.backup.restoring') : t('settings.backup.restore')}
            </button>
          </>
        )
      }
    >
      {result ? (
        <div>
          <p className="mb-1 text-sm font-semibold" style={{ color: 'var(--success-text)' }}>
            ✓ {t('settings.backup.resultTitle')}
          </p>
          <p className="text-sm leading-relaxed text-secondary">
            {t('settings.backup.resultBody', {
              providers: result.providers,
              conversations: result.conversations,
              messages: result.messages,
              presets: result.presets,
              skipped: result.skipped,
            })}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <span className="mb-1 block text-xs font-medium text-secondary">
              {t('settings.backup.restoreFile')}
            </span>
            <code
              className="block break-all rounded-s px-2 py-1.5 text-[0.6875rem]"
              style={{ background: 'var(--code-bg)' }}
            >
              {path}
            </code>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-secondary">
              {t('settings.backup.password')}
            </span>
            <input
              type="password"
              className="input-surface"
              value={password}
              autoComplete="off"
              onChange={(e) => setPassword(e.target.value)}
            />
            <span className="mt-1 block text-[0.6875rem] text-tertiary">
              {t('settings.backup.passwordNeeded')}
            </span>
          </label>
          <div>
            <span className="mb-1.5 block text-xs font-medium text-secondary">
              {t('settings.backup.mode')}
            </span>
            <div className="flex flex-col gap-1.5">
              {(['merge', 'overwrite'] as const).map((m) => (
                <label
                  key={m}
                  className="row-surface flex cursor-pointer items-center gap-2 px-3"
                  style={{
                    minHeight: '2.25rem',
                    borderColor: mode === m ? 'var(--accent)' : undefined,
                  }}
                >
                  <input
                    type="radio"
                    name="restore-mode"
                    checked={mode === m}
                    onChange={() => setMode(m)}
                  />
                  <span className="text-[0.8125rem]">
                    {m === 'merge'
                      ? t('settings.backup.modeMerge')
                      : t('settings.backup.modeOverwrite')}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {confirmingOverwrite ? (
        <ConfirmDialog
          title={t('settings.backup.overwriteConfirmTitle')}
          body={t('settings.backup.overwriteConfirmBody')}
          confirmLabel={t('common.confirm')}
          danger
          busy={busy}
          onCancel={() => setConfirmingOverwrite(false)}
          onConfirm={() => {
            setConfirmingOverwrite(false);
            void doRestore();
          }}
        />
      ) : null}
    </Modal>
  );
}

/* ---------- 备份列表 ---------- */
export function BackupTab() {
  const { t, i18n } = useTranslation();
  const toast = useUiStore((s) => s.toast);
  const [backups, setBackups] = useState<BackupFileInfo[]>([]);
  const [creating, setCreating] = useState(false);
  const [restorePath, setRestorePath] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<BackupFileInfo | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async (): Promise<void> => {
    try {
      setBackups(await getApi().listBackups());
    } catch {
      /* 列表失败保持现状 */
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onPickRestore = async (): Promise<void> => {
    try {
      const path = await getApi().pickBackupFile();
      if (path) setRestorePath(path);
    } catch (e) {
      toast('error', summarizeIpcError(e));
    }
  };

  return (
    <section aria-label={t('settings.tabs.backup')}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t('settings.backup.list')}</h2>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-surface"
            onClick={() => void getApi().openBackupsDir().catch(() => undefined)}
          >
            {t('settings.backup.openDir')}
          </button>
          <button type="button" className="btn btn-surface" onClick={() => void onPickRestore()}>
            {t('settings.backup.restore')}
          </button>
          <button type="button" className="btn btn-accent btn-pill" onClick={() => setCreating(true)}>
            + {t('settings.backup.create')}
          </button>
        </div>
      </div>

      {backups.length === 0 ? (
        <div className="row-surface px-6 py-10 text-center">
          <p className="mb-1 text-sm font-medium">{t('settings.backup.empty')}</p>
          <p className="text-xs text-secondary">{t('settings.backup.emptyHint')}</p>
        </div>
      ) : (
        <ul className="m-0 list-none p-0">
          {backups.map((b) => (
            <li key={b.filename} className="row-surface mb-2 flex items-center gap-3 px-3.5 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[0.8125rem] font-medium" title={b.filename}>
                    {b.filename}
                  </span>
                  <span className="badge flex-none">
                    {b.includes_keys
                      ? t('settings.backup.withKeys')
                      : t('settings.backup.withoutKeys')}
                  </span>
                </div>
                <span className="text-[0.6875rem] text-tertiary">
                  {formatDateTime(b.created_at, i18n.language)} · {formatBytes(b.size, i18n.language)}
                </span>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-danger flex-none"
                style={{ minHeight: '1.75rem', fontSize: '0.75rem' }}
                onClick={() => setDeleting(b)}
              >
                {t('common.delete')}
              </button>
            </li>
          ))}
        </ul>
      )}

      {creating ? <CreateBackupModal onClose={() => { setCreating(false); void reload(); }} /> : null}
      {restorePath ? (
        <RestoreModal path={restorePath} onClose={() => setRestorePath(null)} />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title={t('settings.backup.deleteTitle')}
          body={t('settings.backup.deleteBody', { name: deleting.filename })}
          confirmLabel={t('common.delete')}
          danger
          busy={busy}
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            setBusy(true);
            getApi()
              .deleteBackup(deleting.filename)
              .then(reload)
              .catch(() => toast('error', t('toast.errorGeneric')))
              .finally(() => {
                setBusy(false);
                setDeleting(null);
              });
          }}
        />
      ) : null}
    </section>
  );
}
