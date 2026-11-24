import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  compositeColor,
  contrastRatio,
  extractThemeTokens,
  parseCssColor,
} from '../scripts/lib/contrast.mjs';

type RgbColor = { r: number; g: number; b: number };

// @req REQ-2026-006：对实际主题令牌做 WCAG 数值检查，不以截图目测替代对比度。
const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');

function surface(tokens: Record<string, string>, name: string, base: RgbColor): RgbColor {
  return compositeColor(parseCssColor(tokens[name]), base);
}

function textContrast(tokens: Record<string, string>, foreground: string, background: RgbColor): number {
  return contrastRatio(compositeColor(parseCssColor(tokens[foreground]), background), background);
}

describe('@req REQ-2026-006 visual contrast', () => {
  it('computes the WCAG reference ratio', () => {
    expect(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBe(21);
  });

  it.each(['light', 'dark'] as const)('%s theme keeps text at AA on every semantic surface', (theme) => {
    const tokens = extractThemeTokens(css, theme);
    const base = parseCssColor(tokens['--surface-canvas-bg']);
    const surfaces = [
      base,
      surface(tokens, '--surface-card-bg', base),
      surface(tokens, '--surface-chrome-bg', base),
      surface(tokens, '--surface-control-bg', base),
      surface(tokens, '--surface-pop-bg', base),
      surface(tokens, '--surface-modal-bg', base),
    ];
    // --text-tertiary 同时是 ::placeholder 颜色，此处已按数值覆盖 REQ 的占位符对比度校准。
    for (const foreground of ['--text-primary', '--text-secondary', '--text-tertiary']) {
      for (const background of surfaces) {
        expect(textContrast(tokens, foreground, background)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it.each(['light', 'dark'] as const)('%s theme separates text, fill and focus accents', (theme) => {
    const tokens = extractThemeTokens(css, theme);
    const base = parseCssColor(tokens['--surface-canvas-bg']);
    const card = surface(tokens, '--surface-card-bg', base);
    const control = surface(tokens, '--surface-control-bg', base);
    expect(tokens['--accent-text']).toBeDefined();
    expect(tokens['--accent-fill']).toBeDefined();
    expect(tokens['--control-border']).toBeDefined();
    expect(tokens['--focus-ring']).toBeDefined();
    for (const background of [base, card]) {
      expect(textContrast(tokens, '--accent-text', background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(parseCssColor(tokens['--on-accent']), parseCssColor(tokens['--accent-fill'])))
        .toBeGreaterThanOrEqual(4.5);
    }
    expect(contrastRatio(parseCssColor(tokens['--accent']), base)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(parseCssColor(tokens['--focus-ring']), control)).toBeGreaterThanOrEqual(3);
  });

  it.each(['light', 'dark'] as const)('%s theme keeps status text readable', (theme) => {
    const tokens = extractThemeTokens(css, theme);
    const base = parseCssColor(tokens['--surface-canvas-bg']);
    const card = surface(tokens, '--surface-card-bg', base);
    for (const foreground of ['--danger-text', '--success-text', '--warning-text']) {
      for (const background of [base, card]) {
        expect(textContrast(tokens, foreground, background)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
