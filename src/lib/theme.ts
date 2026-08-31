/**
 * 主题应用（kimi.md §5.2）：
 * - 三档 light / dark / system；system 档用 JS 媒体查询解析成具体值再写 data-theme；
 * - system 档下监听系统主题变化，实时跟随；
 * - data-theme 属性是 tokens.css 的唯一入口；切换过渡由 CSS（prefers-reduced-motion 感知）承担。
 */
import { readPrefs, writePrefs } from './prefs';

export type ThemeChoice = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const media =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: light)')
    : null;

export function resolveSystemTheme(): ResolvedTheme {
  // 与 index.html 防 FOUC 脚本同一策略：媒体查询不可用则默认 dark
  return media?.matches ? 'light' : 'dark';
}

export function resolveTheme(choice: ThemeChoice | undefined): ResolvedTheme {
  if (choice === 'light' || choice === 'dark') return choice;
  return resolveSystemTheme();
}

function applyResolved(resolved: ResolvedTheme): void {
  document.documentElement.dataset.theme = resolved;
}

const systemListener = (): void => {
  const pref = readPrefs().theme;
  if (pref === 'light' || pref === 'dark') return; // 显式选择不跟随系统
  applyResolved(resolveSystemTheme());
};

/** 应用启动时调用一次：按 cookie 偏好挂 system 监听（初始值已由防 FOUC 脚本落好） */
export function initTheme(): void {
  media?.addEventListener?.('change', systemListener);
}

/** 用户切换主题：立即生效 + 写 cookie（system 档写 'system'，由解析层落具体值） */
export function applyTheme(choice: ThemeChoice): void {
  applyResolved(resolveTheme(choice));
  writePrefs({ theme: choice });
}
