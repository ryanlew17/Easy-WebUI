/**
 * 关于标签页（v0.1.1）：
 * - 卡片一「关于」：应用标识（图标 + 名称 + tagline）、版本 / 开源协议 / 作者 / GitHub 仓库；
 * - 卡片二「在线升级」（Electron 独占语义）：检查更新 → 展示更新块 → 下载（进度事件
 *   onUpdateProgress）→ 安装前 Modal 二次确认；web 预览下控件全部禁用并提示桌面独占。
 * 状态机纯本地 useState：idle → checking →（available?）→ idle/downloading → ready →（安装）。
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UpdateInfo } from '@shared/types';
import { getApi } from '../../bridge';
import { useSettingsStore } from '../../store/settings';
import { useUiStore } from '../../store/ui';
import { ConfirmDialog } from '../../components/Modal';
import { Toggle } from '../../components/controls';

/** 与 GeneralTab 同款左右 Row（label + hint / 右侧控件） */
function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b hairline py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="text-[0.8125rem] font-medium">{label}</p>
        {hint ? <p className="mt-0.5 text-[0.6875rem] text-tertiary">{hint}</p> : null}
      </div>
      <div className="flex-none">{children}</div>
    </div>
  );
}

type DownloadState = 'idle' | 'downloading' | 'ready';

export function AboutTab() {
  const { t } = useTranslation();
  const { settings, systemInfo, update } = useSettingsStore();
  const toast = useUiStore((s) => s.toast);

  const [iconFailed, setIconFailed] = useState(false);
  const [checking, setChecking] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [dlState, setDlState] = useState<DownloadState>('idle');
  const [percent, setPercent] = useState(0);
  const [confirmingInstall, setConfirmingInstall] = useState(false);

  const isElectron = !!systemInfo?.isElectron;

  // 下载进度事件订阅（Electron 才有意义）；组件卸载时取消订阅
  useEffect(() => {
    if (!isElectron) return undefined;
    return getApi().onUpdateProgress((p) => setPercent(Math.max(0, Math.min(100, Math.round(p.percent)))));
  }, [isElectron]);

  const openGithub = async (): Promise<void> => {
    try {
      await getApi().openExternal('https://github.com/easy-webui/easy-webui');
    } catch {
      toast('warning', t('toast.errorGeneric'));
    }
  };

  const onCheck = async (): Promise<void> => {
    if (checking) return;
    setChecking(true);
    try {
      const res = await getApi().updateCheck();
      if (res.status === 'none') {
        toast('info', t('settings.about.updateNoneToast'));
      } else if (res.status === 'available') {
        toast('success', t('settings.about.updateAvailableToast', { version: res.info.version }));
        setUpdateInfo(res.info);
        setDlState('idle');
        setPercent(0);
      } else if (res.reason === 'not_configured') {
        toast('info', t('settings.about.updateNotConfiguredToast'));
      } else {
        toast('warning', t('settings.about.updateFailedToast'));
      }
    } catch {
      toast('warning', t('settings.about.updateFailedToast'));
    } finally {
      setChecking(false);
    }
  };

  const onDownload = async (): Promise<void> => {
    if (dlState !== 'idle') return;
    setDlState('downloading');
    setPercent(0);
    try {
      await getApi().updateDownload();
      setPercent(100);
      setDlState('ready');
    } catch {
      toast('warning', t('settings.about.downloadFailedToast'));
      setDlState('idle');
    }
  };

  const onInstall = async (): Promise<void> => {
    try {
      // 真实实现将退出应用并完成安装，resolve 后无后续
      await getApi().updateInstall();
    } catch {
      toast('warning', t('settings.about.installUnsupported'));
    }
  };

  return (
    <section aria-label={t('settings.tabs.about')}>
      {/* ---------- 卡片一：关于 ---------- */}
      <div className="row-surface mb-3 px-4">
        <div className="flex items-center gap-3 border-b hairline py-4">
          {iconFailed ? null : (
            <img
              src="./favicon.svg"
              alt=""
              aria-hidden="true"
              className="h-12 w-12 flex-none select-none"
              draggable={false}
              onError={() => setIconFailed(true)}
            />
          )}
          <div className="min-w-0">
            <p className="text-base font-semibold leading-tight">Easy WebUI</p>
            <p className="mt-0.5 text-xs text-secondary">{t('settings.about.appTagline')}</p>
          </div>
        </div>
        <Row label={t('settings.about.version')}>
          <span className="text-xs text-secondary">{systemInfo?.version ?? '…'}</span>
        </Row>
        <Row label={t('settings.about.license')}>
          <span className="text-xs text-secondary">{t('settings.about.licenseValue')}</span>
        </Row>
        <Row label={t('settings.about.author')}>
          <span className="text-xs text-secondary">{t('settings.about.authorValue')}</span>
        </Row>
        <Row label={t('settings.about.github')}>
          <div className="flex items-center gap-2">
            <code
              className="block max-w-[16rem] truncate rounded px-1.5 py-0.5 text-[0.6875rem]"
              style={{ background: 'var(--code-bg)' }}
              title={t('settings.about.githubValue')}
            >
              {t('settings.about.githubValue')}
            </code>
            <button
              type="button"
              className="btn btn-surface flex-none"
              aria-label={t('settings.about.githubOpen')}
              onClick={() => void openGithub()}
            >
              {t('settings.about.githubOpen')}
            </button>
          </div>
        </Row>
      </div>

      {/* ---------- 卡片二：在线升级 ---------- */}
      <div className="row-surface px-4">
        <h3 className="pt-3 text-[0.8125rem] font-medium">{t('settings.about.updateTitle')}</h3>

        {!isElectron ? (
          <>
            {/* web 预览：提示桌面独占，控件全部置灰 */}
            <div className="border-b hairline py-3">
              <p className="text-[0.8125rem] text-secondary">
                {t('settings.about.updateElectronOnly')}
              </p>
            </div>
            <Row label={t('settings.about.checkUpdate')}>
              <button
                type="button"
                className="btn btn-accent"
                disabled
                aria-label={t('settings.about.checkUpdate')}
              >
                {t('settings.about.checkUpdate')}
              </button>
            </Row>
            <Row label={t('settings.about.autoUpdate')} hint={t('settings.about.autoUpdateHint')}>
              <Toggle
                checked={settings.auto_update}
                label={t('settings.about.autoUpdate')}
                disabled
                onChange={() => undefined}
              />
            </Row>
            <Row label={t('settings.about.betaChannel')} hint={t('settings.about.betaChannelHint')}>
              <Toggle
                checked={settings.update_beta}
                label={t('settings.about.betaChannel')}
                disabled
                onChange={() => undefined}
              />
            </Row>
          </>
        ) : (
          <>
            <Row label={t('settings.about.checkUpdate')}>
              <div className="flex items-center gap-2">
                {checking ? (
                  <span className="text-xs text-secondary" role="status">
                    {t('settings.about.checking')}
                  </span>
                ) : null}
                <button
                  type="button"
                  className="btn btn-accent"
                  disabled={checking}
                  aria-label={t('settings.about.checkUpdate')}
                  onClick={() => void onCheck()}
                >
                  {checking ? t('settings.about.checking') : t('settings.about.checkUpdate')}
                </button>
              </div>
            </Row>
            <Row label={t('settings.about.autoUpdate')} hint={t('settings.about.autoUpdateHint')}>
              <Toggle
                checked={settings.auto_update}
                label={t('settings.about.autoUpdate')}
                onChange={(v) => void update({ auto_update: v })}
              />
            </Row>
            <Row label={t('settings.about.betaChannel')} hint={t('settings.about.betaChannelHint')}>
              <Toggle
                checked={settings.update_beta}
                label={t('settings.about.betaChannel')}
                onChange={(v) => void update({ update_beta: v })}
              />
            </Row>

            {/* 更新块：发现新版本后展示 */}
            {updateInfo ? (
              <div className="row-surface mb-3 mt-1 px-3.5 py-3">
                <p className="text-[0.8125rem] font-semibold">
                  {t('settings.about.newVersion', { version: updateInfo.version })}
                </p>
                {updateInfo.size ? (
                  <p className="mt-0.5 text-[0.6875rem] text-tertiary">
                    {t('settings.about.updateSize', { size: Math.round(updateInfo.size / 1048576) })}
                  </p>
                ) : null}
                <span className="mb-1 mt-2.5 block text-xs font-medium text-secondary">
                  {t('settings.about.releaseNotes')}
                </span>
                <textarea
                  readOnly
                  className="input-surface h-36 resize-none overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed"
                  value={updateInfo.release_notes}
                  aria-label={t('settings.about.releaseNotes')}
                />

                {dlState === 'ready' ? (
                  <div className="mt-3">
                    <p className="text-xs font-medium" style={{ color: 'var(--success-text)' }}>
                      ✓ {t('settings.about.ready')}
                    </p>
                    <p
                      className="mt-1 text-[0.6875rem]"
                      style={{ color: 'var(--warning-text)' }}
                    >
                      ⚠ {t('settings.about.backupWarning')}
                    </p>
                    <button
                      type="button"
                      className="btn btn-accent mt-2"
                      aria-label={t('settings.about.install')}
                      onClick={() => setConfirmingInstall(true)}
                    >
                      {t('settings.about.install')}
                    </button>
                  </div>
                ) : (
                  <div className="mt-3">
                    <button
                      type="button"
                      className="btn btn-accent"
                      disabled={dlState === 'downloading'}
                      aria-label={t('settings.about.download')}
                      onClick={() => void onDownload()}
                    >
                      {dlState === 'downloading'
                        ? t('settings.about.downloading', { percent })
                        : t('settings.about.download')}
                    </button>
                    {dlState === 'downloading' ? (
                      <div
                        className="zoom-slider-rail mt-2"
                        role="progressbar"
                        aria-label={t('settings.about.downloading', { percent })}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={percent}
                      >
                        <div className="zoom-slider-fill" style={{ width: `${percent}%` }} />
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}
          </>
        )}
      </div>

      {confirmingInstall && updateInfo ? (
        <ConfirmDialog
          title={t('settings.about.installConfirmTitle')}
          body={t('settings.about.installConfirmBody', { version: updateInfo.version })}
          confirmLabel={t('settings.about.installConfirmOk')}
          onCancel={() => setConfirmingInstall(false)}
          onConfirm={() => {
            setConfirmingInstall(false);
            void onInstall();
          }}
        />
      ) : null}
    </section>
  );
}
