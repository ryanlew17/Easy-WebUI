/**
 * UI 轻量偏好持久化（prd.md §5.4）：
 * - 单 Cookie `easyui_prefs`，值 = encodeURIComponent(JSON.stringify(obj))，<2KB；
 * - 365 天、SameSite=Lax、不设 HttpOnly；绝不含敏感信息；
 * - localStorage 同名 key 兜底（Cookie 异常时不白屏）；
 * - 与 index.html 防 FOUC 内联脚本保持同一数据格式（theme/lang 字段名一致）。
 */

export interface Prefs {
  theme?: 'light' | 'dark' | 'system';
  /** 注意：cookie 中存的是*已解析*语言（zh-CN/en-US），与防 FOUC 脚本一致 */
  lang?: 'zh-CN' | 'en-US';
  /** 右栏折叠态 */
  sidebar_collapsed?: boolean;
  /** 右栏宽度（px 数值，应用时折算 rem，避免 px 写死） */
  right_width?: number;
  /** 外观（防 FOUC 首帧应用）：缩放因子 / 界面字体栈 / 代码字体栈 / 代码块主题 / 两项字号 */
  zoom?: number;
  font_ui?: string;
  font_code?: string;
  code_theme?: 'light' | 'dark' | 'auto';
  /** 界面字号 px（null = 默认 16px rem 基准） */
  font_ui_size?: number | null;
  /** 代码块字号 px（null = 内置默认） */
  font_code_size?: number | null;
}

const COOKIE_NAME = 'easyui_prefs';
const LS_KEY = 'easyui_prefs';

export function readPrefs(): Prefs {
  try {
    const m = document.cookie.match(/(?:^|;\s*)easyui_prefs=([^;]*)/);
    if (m) return JSON.parse(decodeURIComponent(m[1])) as Prefs;
  } catch {
    /* fallthrough */
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as Prefs;
  } catch {
    /* fallthrough */
  }
  return {};
}

export function writePrefs(patch: Partial<Prefs>): void {
  const next = { ...readPrefs(), ...patch };
  const json = JSON.stringify(next);
  try {
    const expires = new Date(Date.now() + 365 * 24 * 3600 * 1000).toUTCString();
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(json)}; expires=${expires}; path=/; SameSite=Lax`;
  } catch {
    /* Cookie 异常时 localStorage 已兜底，不白屏 */
  }
  try {
    localStorage.setItem(LS_KEY, json);
  } catch {
    /* ignore */
  }
}
