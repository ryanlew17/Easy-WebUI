/**
 * 通用设置 + 系统信息。设置变更即写库（setSettings），并即时应用主题/语言。
 */
import { create } from 'zustand';
import type { GeneralSettings, SystemInfo } from '@shared/types';
import { DEFAULT_SETTINGS } from '@shared/types';
import { getApi } from '../bridge';
import { applyTheme } from '../lib/theme';
import { readPrefs } from '../lib/prefs';
import { applyLanguage } from '../i18n';
import {
  applyCodeFont,
  applyCodeFontSize,
  applyCodeTheme,
  applyUiFont,
  applyUiFontSize,
  applyZoom,
  hydrateAppearance,
} from '../lib/appearance';

export type { SystemInfo } from '@shared/types';

interface SettingsState {
  settings: GeneralSettings;
  systemInfo: SystemInfo | null;
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<GeneralSettings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  settings: DEFAULT_SETTINGS,
  systemInfo: null,
  loaded: false,

  load: async () => {
    const api = getApi();
    const [settings, systemInfo] = await Promise.all([
      api.getSettings().catch(() => DEFAULT_SETTINGS),
      api.getSystemInfo().catch(() => null),
    ]);
    set({ settings, systemInfo, loaded: true });
    // 主题/语言以 Cookie 偏好为优先事实来源（docs/design/ui-liquid-glass.md：防 FOUC 脚本已按 cookie
    // 落好初始值）；cookie 缺失时才回退到后端设置。用户主动切换时 update() 会同时
    // 写 cookie（applyTheme/applyLanguage 内部）与后端，两者保持一致。
    const prefs = readPrefs();
    applyTheme(prefs.theme ?? settings.theme);
    applyLanguage(prefs.lang ?? settings.language);
    // 外观四项：cookie 优先（防 FOUC 脚本首帧已应用 cookie 值，这里补齐设置兜底并纠偏）
    hydrateAppearance(settings);
  },

  update: async (patch) => {
    const optimistic = { ...get().settings, ...patch };
    set({ settings: optimistic });
    if (patch.theme) applyTheme(patch.theme);
    if (patch.language) applyLanguage(patch.language);
    // 外观即时生效（apply* 内部已写 cookie 偏好；zoom/字体/字号/代码主题不必重启）
    if (patch.zoom !== undefined) applyZoom(patch.zoom);
    if (patch.font_ui !== undefined) applyUiFont(patch.font_ui);
    if (patch.font_code !== undefined) applyCodeFont(patch.font_code);
    if (patch.code_theme !== undefined) applyCodeTheme(patch.code_theme);
    // null 是合法的「恢复默认」值，必须用 !== undefined 判定
    if (patch.font_ui_size !== undefined) applyUiFontSize(patch.font_ui_size);
    if (patch.font_code_size !== undefined) applyCodeFontSize(patch.font_code_size);
    try {
      const saved = await getApi().setSettings(patch);
      set({ settings: saved });
    } catch {
      /* 写库失败保留乐观值并静默（设置项非关键路径），界面已即时生效 */
    }
  },
}));
