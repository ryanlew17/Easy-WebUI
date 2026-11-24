import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../store/settings';
import { useUiStore, type SettingsTab } from '../../store/ui';
import { AppFrame } from '../../components/AppFrame';
import {
  IconArchive,
  IconChevronLeft,
  IconDoc,
  IconInfo,
  IconServer,
  IconSliders,
} from '../../components/icons';
import { ProvidersTab } from './ProvidersTab';
import { PresetTab } from './PresetTab';
import { GeneralTab } from './GeneralTab';
import { BackupTab } from './BackupTab';
import { AboutTab } from './AboutTab';

// @req REQ-2026-006：设置与会话共享应用骨架，五类导航位于同宽左栏。
export function SettingsPage() {
  const { t } = useTranslation();
  const { settingsTab, setSettingsTab, setPage } = useUiStore();
  const systemInfo = useSettingsStore((s) => s.systemInfo);

  const tabs = [
    { key: 'providers' as const, label: t('settings.tabs.providers'), Icon: IconServer },
    { key: 'presets' as const, label: t('settings.tabs.presets'), Icon: IconDoc },
    { key: 'general' as const, label: t('settings.tabs.general'), Icon: IconSliders },
    { key: 'backup' as const, label: t('settings.tabs.backup'), Icon: IconArchive },
    { key: 'about' as const, label: t('settings.tabs.about'), Icon: IconInfo },
  ];

  const selectTab = (tab: SettingsTab): void => setSettingsTab(tab);

  return (
    <AppFrame
      navigation={
        <aside className="app-sidebar drawer settings-nav" aria-label={t('aria.settingsTabs')}>
          <div className="sidebar-brand">{t('app.name')}</div>
          <div
            role="tablist"
            aria-label={t('aria.settingsTabs')}
            aria-orientation="vertical"
            className="settings-nav-list"
          >
            {tabs.map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={settingsTab === key}
                className="btn btn-ghost settings-nav-item"
                onClick={() => selectTab(key)}
              >
                <Icon />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <div className="settings-nav-footer">
            <button
              type="button"
              className="btn btn-ghost w-full justify-start"
              onClick={() => setPage('chat')}
              aria-label={t('aria.backToChat')}
            >
              <IconChevronLeft />
              {t('common.back')}
            </button>
          </div>
        </aside>
      }
    >
      <div className="settings-workspace app-workspace">
        <header className="workspace-topbar glass-bar glass-optics flex items-center px-5">
          <h1 className="text-title">{t('settings.title')}</h1>
        </header>
        <div className="settings-scroll">
          <div className="settings-content">
            {systemInfo && !systemInfo.encryption.available ? (
              <div role="alert" className="settings-warning">
                {t('settings.general.encWeakWarn')}
              </div>
            ) : null}
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
    </AppFrame>
  );
}
