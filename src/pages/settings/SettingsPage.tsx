/**
 * 设置页：顶部返回 + 五标签（平台管理 / 预设 / 通用 / 备份 / 关于）。
 * safeStorage 不可用时顶部常驻黄色警告条（kimi.md §8.1）。
 */
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../store/settings';
import { useUiStore, type SettingsTab } from '../../store/ui';
import { ProvidersTab } from './ProvidersTab';
import { PresetTab } from './PresetTab';
import { GeneralTab } from './GeneralTab';
import { BackupTab } from './BackupTab';
import { AboutTab } from './AboutTab';

export function SettingsPage() {
  const { t } = useTranslation();
  const { settingsTab, setSettingsTab, setPage } = useUiStore();
  const systemInfo = useSettingsStore((s) => s.systemInfo);

  const tabs: { key: SettingsTab; label: string }[] = [
    { key: 'providers', label: t('settings.tabs.providers') },
    { key: 'presets', label: t('settings.tabs.presets') },
    { key: 'general', label: t('settings.tabs.general') },
    { key: 'backup', label: t('settings.tabs.backup') },
    { key: 'about', label: t('settings.tabs.about') },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 设置页顶栏（玻璃；设置页与模态同屏时模糊层仍 ≤5） */}
      <div className="glass-bar flex flex-none items-center gap-3 px-4 py-2.5">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setPage('chat')}
          aria-label={t('aria.backToChat')}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M8 2L4 6l4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          </svg>
          {t('common.back')}
        </button>
        <h1 className="text-sm font-semibold">{t('settings.title')}</h1>
        <div
          role="tablist"
          aria-label={t('aria.settingsTabs')}
          className="seg ml-2"
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={settingsTab === tab.key}
              className="btn btn-ghost"
              style={{
                minHeight: '1.75rem',
                padding: '0 0.875rem',
                borderRadius: 'var(--radius-pill)',
                background: settingsTab === tab.key ? 'var(--row-bg-active)' : 'transparent',
                boxShadow: settingsTab === tab.key ? '0 1px 3px rgba(0,0,0,0.12)' : undefined,
                color: settingsTab === tab.key ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
              onClick={() => setSettingsTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {systemInfo && !systemInfo.encryption.available ? (
        <div
          role="alert"
          className="flex-none px-4 py-2 text-xs"
          style={{ background: 'var(--warning-bg)', color: 'var(--warning-text)' }}
        >
          ⚠ {t('settings.general.encWeakWarn')}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-4">
          {/* key=tab 触发 .tab-swap 挂载入场（--dur-base），reduced-motion 下无动画 */}
          <div key={settingsTab} className="tab-swap">
            {settingsTab === 'providers' ? <ProvidersTab /> : null}
            {settingsTab === 'presets' ? <PresetTab /> : null}
            {settingsTab === 'general' ? <GeneralTab /> : null}
            {settingsTab === 'backup' ? <BackupTab /> : null}
            {settingsTab === 'about' ? <AboutTab /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
