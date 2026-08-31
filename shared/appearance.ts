/**
 * 外观设置（设置 → 通用 → 外观）共享纯逻辑 —— 无 electron / node / DOM 依赖，
 * 渲染进程（src/lib/appearance.ts）、防 FOUC 内联脚本逻辑参考、vitest 三方共用。
 *
 * 注入安全红线：font_ui / font_code 会写入 CSS 自定义属性并进入 cookie，
 * 只允许 字母/数字/空格/逗号/单双引号/连字符/点 —— 足以表达
 * `"SF Pro Text", 'PingFang SC', sans-serif` 这类字体栈，同时挡住
 * `;` `(` `)` `<` `>` `}` 等可闭合 CSS 声明 / URL 协议的字符。
 */

/** 缩放合法区间（步长 0.1 由 UI 控件保证） */
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2.5;
export const ZOOM_DEFAULT = 1;

/** 字体栈输入长度上限（zod 同步约束） */
export const FONT_STACK_MAX = 200;

/** 字体栈字符白名单 */
const FONT_STACK_RE = /^[A-Za-z0-9 ,.'"-]*$/;

/**
 * 消毒字体栈输入：
 * - trim + 收敛内部连续空白；
 * - 空串 → ''（合法，语义 = 恢复默认字体栈）；
 * - 含白名单外字符或超长 → null（调用方回退默认 + 提示）。
 */
export function sanitizeFontStack(raw: string): string | null {
  const collapsed = raw.trim().replace(/\s+/g, ' ');
  if (collapsed === '') return '';
  if (collapsed.length > FONT_STACK_MAX) return null;
  if (!FONT_STACK_RE.test(collapsed)) return null;
  return collapsed;
}

/** 缩放钳制：非有限数 / 超界 → 收敛到 [0.5, 2.5]，并按 0.1 步长取整（防浮点噪声） */
export function clampZoom(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return ZOOM_DEFAULT;
  const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, n));
  return Math.round(clamped * 10) / 10;
}

/** 界面字号合法区间（px 整数，rem 基准；参考 VSCode 常用 UI 字号带） */
export const FONT_UI_SIZE_MIN = 10;
export const FONT_UI_SIZE_MAX = 24;
/** 代码块字号合法区间（px 整数；参考 VSCode editor.fontSize 默认 14，下限放宽到 6） */
export const FONT_CODE_SIZE_MIN = 6;
export const FONT_CODE_SIZE_MAX = 40;

/**
 * 字号输入归一化：非有限数 / 非整数取整后超界 → null（调用方视为非法输入，
 * 拒绝并提示；与 sanitizeFontStack 的 null 语义一致）。合法值返回整数。
 */
export function parseFontSize(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  if (!Number.isFinite(n)) return null;
  const i = Math.round(n);
  if (i < min || i > max) return null;
  return i;
}

export type CodeTheme = 'light' | 'dark' | 'auto';

/** 归一化 code_theme 输入（cookie / 旧数据防御）：非法值 → 'auto' */
export function normalizeCodeTheme(v: unknown): CodeTheme {
  return v === 'light' || v === 'dark' ? v : 'auto';
}
