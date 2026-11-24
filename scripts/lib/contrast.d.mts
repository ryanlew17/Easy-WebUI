export interface RgbColor {
  r: number;
  g: number;
  b: number;
}
export interface CssColor extends RgbColor {
  a?: number;
}
export function parseCssColor(value: string): CssColor;
export function compositeColor(foreground: CssColor, background: RgbColor): RgbColor;
export function relativeLuminance(color: RgbColor): number;
export function contrastRatio(a: RgbColor, b: RgbColor): number;
export function extractThemeTokens(css: string, theme: 'light' | 'dark'): Record<string, string>;
