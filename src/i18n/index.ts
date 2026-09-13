/**
 * i18n 初始化（docs/design/i18n.md）：
 * - 资源静态内联（两份 JSON，无网络加载）；
 * - 默认语言：读 cookie「easyui_prefs」中已解析的 lang；否则系统 locale 命中中文 → zh-CN，否则 en-US；
 * - 用户切换语言后写 cookie（已解析值），与 index.html 防 FOUC 脚本同一格式。
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhCN from './zh-CN.json';
import enUS from './en-US.json';
import { readPrefs, writePrefs } from '../lib/prefs';

export type LangChoice = 'zh-CN' | 'en-US' | 'system';
export type ResolvedLang = 'zh-CN' | 'en-US';

export function resolveSystemLang(): ResolvedLang {
  try {
    const loc = navigator.language || '';
    return /zh|cn/i.test(loc) ? 'zh-CN' : 'en-US';
  } catch {
    return 'en-US';
  }
}

function initialLang(): ResolvedLang {
  const pref = readPrefs().lang;
  if (pref === 'en-US' || pref === 'zh-CN') return pref;
  return resolveSystemLang();
}

void i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: zhCN },
    'en-US': { translation: enUS },
  },
  lng: initialLang(),
  fallbackLng: 'en-US',
  interpolation: { escapeValue: false },
  returnNull: false,
});

/** 应用语言（立即生效 + documentElement.lang + 写 cookie 已解析值） */
export function applyLanguage(choice: LangChoice): ResolvedLang {
  const resolved: ResolvedLang = choice === 'system' ? resolveSystemLang() : choice;
  void i18n.changeLanguage(resolved);
  document.documentElement.lang = resolved;
  writePrefs({ lang: resolved });
  return resolved;
}

export default i18n;
