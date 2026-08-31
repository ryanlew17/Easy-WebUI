/**
 * 外观应用层（设置 → 通用 → 外观）——即时生效，web 与 Electron 同一代码路径。
 *
 * - 缩放：document.documentElement.style.zoom = factor（Chromium 支持 CSS zoom）；
 *   同时禁用浏览器默认缩放手势（ctrl+wheel / ctrl/cmd +/-/0 / gesturestart），
 *   避免与应用内缩放叠加（Electron 侧另有 main.ts 的 setVisualZoomLevelLimits 兜底）。
 * - 字体：落到 CSS 变量 --font-ui / --font-code（空值 = 移除变量，回退默认栈）；
 *   输入一律先过 shared/appearance.ts 的白名单消毒。
 * - 代码块主题：documentElement data-code-theme 属性（auto = 移除属性，跟随页面主题）。
 * - 全部四项写 cookie 偏好（prefs.ts），index.html 内联脚本首帧应用，无 FOUC。
 */
import {
  FONT_CODE_SIZE_MAX,
  FONT_CODE_SIZE_MIN,
  FONT_UI_SIZE_MAX,
  FONT_UI_SIZE_MIN,
  clampZoom,
  normalizeCodeTheme,
  parseFontSize,
  sanitizeFontStack,
  type CodeTheme,
} from '@shared/appearance';
import { readPrefs, writePrefs } from './prefs';

/* ---------- 单项应用（立即写 DOM + cookie） ---------- */

export function applyZoom(factor: number): void {
  const z = clampZoom(factor);
  setZoomDom(z);
  writePrefs({ zoom: z });
}

/**
 * CSS zoom 补偿：documentElement 缩放后 vw/vh 仍按未缩放视口解析（100vw 只占
 * 窗口的 z 倍），故 html 显式尺寸 = 视口 / z，抵消后恰好填满窗口；
 * --app-zoom 变量供 index.css 的 calc() 使用（与防 FOUC 内联脚本同一约定）。
 */
function setZoomDom(z: number): void {
  const el = document.documentElement;
  if (z === 1) {
    el.style.zoom = '';
    el.style.removeProperty('--app-zoom');
  } else {
    el.style.zoom = String(z);
    el.style.setProperty('--app-zoom', String(z));
  }
}

export function applyUiFont(stack: string): void {
  setFontVar('--font-ui', stack);
  writePrefs({ font_ui: stack });
}

export function applyCodeFont(stack: string): void {
  setFontVar('--font-code', stack);
  writePrefs({ font_code: stack });
}

function setFontVar(name: '--font-ui' | '--font-code', stack: string): void {
  if (stack) document.documentElement.style.setProperty(name, stack);
  else document.documentElement.style.removeProperty(name);
}

export function applyCodeTheme(mode: CodeTheme): void {
  const m = normalizeCodeTheme(mode);
  if (m === 'auto') delete document.documentElement.dataset.codeTheme;
  else document.documentElement.dataset.codeTheme = m;
  writePrefs({ code_theme: m });
}

/* ---------- 字号（即时生效；null = 恢复默认） ---------- */

/**
 * 界面字号：documentElement.style.fontSize = n px —— 直接改 rem 基准
 * （index.css html 默认 16px），全部 rem 尺寸随之缩放，属预期语义；
 * null = 清空内联值回退默认。超界/非法数值防御性视为 null。
 */
export function applyUiFontSize(n: number | null): void {
  const v = n === null ? null : parseFontSize(n, FONT_UI_SIZE_MIN, FONT_UI_SIZE_MAX);
  setUiFontSizeDom(v);
  writePrefs({ font_ui_size: v });
}

/** 代码块字号：--font-code-size CSS 变量（消费端 var(--font-code-size, 内置默认)）；null = 移除变量 */
export function applyCodeFontSize(n: number | null): void {
  const v = n === null ? null : parseFontSize(n, FONT_CODE_SIZE_MIN, FONT_CODE_SIZE_MAX);
  setCodeFontSizeDom(v);
  writePrefs({ font_code_size: v });
}

function setUiFontSizeDom(n: number | null): void {
  document.documentElement.style.fontSize = n === null ? '' : `${n}px`;
}

function setCodeFontSizeDom(n: number | null): void {
  const el = document.documentElement;
  if (n === null) el.style.removeProperty('--font-code-size');
  else el.style.setProperty('--font-code-size', `${n}px`);
}

/** cookie/设置兜底归一化：null/undefined/非法值 → null（= 默认语义，与 parseFontSize 的 null 一致） */
function normalizeFontSize(v: unknown, min: number, max: number): number | null {
  if (v === null || v === undefined) return null;
  return parseFontSize(v, min, max);
}

/* ---------- 启动 hydrate（cookie 优先，设置兜底；内联脚本已落首帧，这里补齐并纠偏） ---------- */

export interface AppearanceLike {
  zoom: number;
  font_ui: string;
  font_code: string;
  font_ui_size: number | null;
  font_code_size: number | null;
  code_theme: CodeTheme;
}

export function hydrateAppearance(settings: AppearanceLike): void {
  const prefs = readPrefs();
  // 缩放（CSS zoom + 视口补偿变量，补偿规则在 index.css html 选择器）
  const zoom = prefs.zoom ?? settings.zoom;
  setZoomDom(clampZoom(zoom));
  // 字体（cookie 里的值同样过白名单，防手工构造 cookie 注入）
  setFontVar('--font-ui', sanitizeFontStack(prefs.font_ui ?? settings.font_ui) ?? '');
  setFontVar('--font-code', sanitizeFontStack(prefs.font_code ?? settings.font_code) ?? '');
  // 字号（cookie 优先；非法值经 parseFontSize 兜底为默认）
  setUiFontSizeDom(
    normalizeFontSize(prefs.font_ui_size ?? settings.font_ui_size, FONT_UI_SIZE_MIN, FONT_UI_SIZE_MAX),
  );
  setCodeFontSizeDom(
    normalizeFontSize(
      prefs.font_code_size ?? settings.font_code_size,
      FONT_CODE_SIZE_MIN,
      FONT_CODE_SIZE_MAX,
    ),
  );
  // 代码块主题
  const ct = normalizeCodeTheme(prefs.code_theme ?? settings.code_theme);
  if (ct === 'auto') delete document.documentElement.dataset.codeTheme;
  else document.documentElement.dataset.codeTheme = ct;
}

/* ---------- 禁用浏览器默认缩放（web preview 需要；Electron 下加上无害） ---------- */

let guardsInstalled = false;

export function initZoomGuards(): void {
  if (guardsInstalled || typeof window === 'undefined') return;
  guardsInstalled = true;

  // ctrl + 滚轮（ pinch 触控板在 Chromium 上也映射为 ctrl+wheel ）
  window.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey) e.preventDefault();
    },
    { passive: false },
  );
  // ctrl/cmd +/-/0 键盘缩放（不拦截输入框正常打字：这些组合键本就不是文本输入）
  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0') {
      e.preventDefault();
    }
  });
  // Safari 系手势（历史兼容，Chromium 不触发）
  window.addEventListener('gesturestart', (e) => e.preventDefault());
}
