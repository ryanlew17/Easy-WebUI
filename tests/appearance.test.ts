/**
 * shared/appearance.ts —— 外观设置纯逻辑单元测试。
 * 覆盖：字体栈白名单（合法/非法字符/空值/超长/空白收敛）、缩放钳制、code_theme 归一化。
 */
import { describe, expect, it } from 'vitest';
import {
  FONT_CODE_SIZE_MAX,
  FONT_CODE_SIZE_MIN,
  FONT_STACK_MAX,
  FONT_UI_SIZE_MAX,
  FONT_UI_SIZE_MIN,
  clampZoom,
  normalizeCodeTheme,
  parseFontSize,
  sanitizeFontStack,
} from '../shared/appearance';

describe('sanitizeFontStack', () => {
  it('常规字体栈原样通过', () => {
    expect(sanitizeFontStack('"SF Pro Text", "PingFang SC", sans-serif')).toBe(
      '"SF Pro Text", "PingFang SC", sans-serif',
    );
    expect(sanitizeFontStack("Consolas, 'Courier New', monospace")).toBe(
      "Consolas, 'Courier New', monospace",
    );
    expect(sanitizeFontStack('MiSans')).toBe('MiSans');
  });

  it('空串 / 纯空白 → 空串（恢复默认语义）', () => {
    expect(sanitizeFontStack('')).toBe('');
    expect(sanitizeFontStack('   ')).toBe('');
  });

  it('首尾空白 trim，内部连续空白收敛', () => {
    expect(sanitizeFontStack('  "SF Pro   Text"  , sans-serif ')).toBe('"SF Pro Text" , sans-serif');
  });

  it('注入字符一律拒绝（CSS 闭合 / URL 协议 / HTML）', () => {
    expect(sanitizeFontStack('Arial; background:url(http://evil)')).toBeNull();
    expect(sanitizeFontStack('Arial } body { display:none')).toBeNull();
    expect(sanitizeFontStack('<script>alert(1)</script>')).toBeNull();
    expect(sanitizeFontStack('Arial\\')).toBeNull();
    expect(sanitizeFontStack('x'.repeat(FONT_STACK_MAX + 1))).toBeNull();
  });

  it('边界：恰好达到长度上限仍合法', () => {
    expect(sanitizeFontStack('x'.repeat(FONT_STACK_MAX))).toBe('x'.repeat(FONT_STACK_MAX));
  });
});

describe('clampZoom', () => {
  it('界内值按 0.1 步长取整', () => {
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(1.25)).toBe(1.3); // 0.1 步长四舍五入
    expect(clampZoom(0.5)).toBe(0.5);
    expect(clampZoom(2.5)).toBe(2.5);
  });
  it('超界收敛', () => {
    expect(clampZoom(0.1)).toBe(0.5);
    expect(clampZoom(99)).toBe(2.5);
  });
  it('非有限数 → 默认 1', () => {
    expect(clampZoom(NaN)).toBe(1);
    expect(clampZoom(Infinity)).toBe(1); // 非有限一律回默认
    expect(clampZoom('abc')).toBe(1);
    expect(clampZoom(undefined)).toBe(1);
  });
});

describe('parseFontSize', () => {
  it('合法整数原样返回（数字与数字字符串）', () => {
    expect(parseFontSize(16, FONT_UI_SIZE_MIN, FONT_UI_SIZE_MAX)).toBe(16);
    expect(parseFontSize('14', FONT_CODE_SIZE_MIN, FONT_CODE_SIZE_MAX)).toBe(14);
  });

  it('边界值 10/24/6/40 合法', () => {
    expect(parseFontSize(10, FONT_UI_SIZE_MIN, FONT_UI_SIZE_MAX)).toBe(10);
    expect(parseFontSize(24, FONT_UI_SIZE_MIN, FONT_UI_SIZE_MAX)).toBe(24);
    expect(parseFontSize(6, FONT_CODE_SIZE_MIN, FONT_CODE_SIZE_MAX)).toBe(6);
    expect(parseFontSize(40, FONT_CODE_SIZE_MIN, FONT_CODE_SIZE_MAX)).toBe(40);
  });

  it('超界 → null', () => {
    expect(parseFontSize(9, FONT_UI_SIZE_MIN, FONT_UI_SIZE_MAX)).toBeNull();
    expect(parseFontSize(25, FONT_UI_SIZE_MIN, FONT_UI_SIZE_MAX)).toBeNull();
    expect(parseFontSize(5, FONT_CODE_SIZE_MIN, FONT_CODE_SIZE_MAX)).toBeNull();
    expect(parseFontSize(41, FONT_CODE_SIZE_MIN, FONT_CODE_SIZE_MAX)).toBeNull();
  });

  it('非整数取整后再判定值域', () => {
    expect(parseFontSize(13.6, FONT_UI_SIZE_MIN, FONT_UI_SIZE_MAX)).toBe(14);
    expect(parseFontSize(24.4, FONT_UI_SIZE_MIN, FONT_UI_SIZE_MAX)).toBe(24);
    // 取整后落到界外同样拒绝
    expect(parseFontSize(24.6, FONT_UI_SIZE_MIN, FONT_UI_SIZE_MAX)).toBeNull();
    expect(parseFontSize(9.6, FONT_UI_SIZE_MIN, FONT_UI_SIZE_MAX)).toBe(10);
  });

  it('非数字 / 空串 / 缺失 / 非有限数 → null', () => {
    expect(parseFontSize('abc', FONT_UI_SIZE_MIN, FONT_UI_SIZE_MAX)).toBeNull();
    expect(parseFontSize('', FONT_UI_SIZE_MIN, FONT_UI_SIZE_MAX)).toBeNull();
    expect(parseFontSize('   ', FONT_UI_SIZE_MIN, FONT_UI_SIZE_MAX)).toBeNull();
    expect(parseFontSize(null, FONT_UI_SIZE_MIN, FONT_UI_SIZE_MAX)).toBeNull();
    expect(parseFontSize(undefined, FONT_UI_SIZE_MIN, FONT_UI_SIZE_MAX)).toBeNull();
    expect(parseFontSize(NaN, FONT_UI_SIZE_MIN, FONT_UI_SIZE_MAX)).toBeNull();
    expect(parseFontSize(Infinity, FONT_CODE_SIZE_MIN, FONT_CODE_SIZE_MAX)).toBeNull();
  });
});

describe('normalizeCodeTheme', () => {
  it('合法值原样通过', () => {
    expect(normalizeCodeTheme('light')).toBe('light');
    expect(normalizeCodeTheme('dark')).toBe('dark');
    expect(normalizeCodeTheme('auto')).toBe('auto');
  });
  it('非法/缺失 → auto', () => {
    expect(normalizeCodeTheme('blue')).toBe('auto');
    expect(normalizeCodeTheme(undefined)).toBe('auto');
    expect(normalizeCodeTheme(null)).toBe('auto');
    expect(normalizeCodeTheme(1)).toBe('auto');
  });
});
