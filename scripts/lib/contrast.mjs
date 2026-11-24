// @req REQ-2026-006：WCAG 2.x sRGB 对比度与主题令牌读取，供 Vitest 和浏览器探针共用。

function channel(value, max = 255) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`Invalid color channel: ${value}`);
  return Math.min(max, Math.max(0, number));
}

export function parseCssColor(value) {
  const input = value.trim();
  const hex = /^#([\da-f]{3,8})$/i.exec(input);
  if (hex) {
    let digits = hex[1];
    if (digits.length === 3 || digits.length === 4) {
      digits = [...digits].map((part) => part + part).join('');
    }
    if (digits.length !== 6 && digits.length !== 8) throw new TypeError(`Invalid hex color: ${value}`);
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
      a: digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1,
    };
  }
  const rgb = /^rgba?\(\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(input);
  if (!rgb) throw new TypeError(`Unsupported CSS color: ${value}`);
  const parseChannel = (part) => part.endsWith('%') ? channel(part.slice(0, -1), 100) * 2.55 : channel(part);
  const alpha = rgb[4]?.endsWith('%') ? channel(rgb[4].slice(0, -1), 100) / 100 : channel(rgb[4] ?? '1', 1);
  return { r: parseChannel(rgb[1]), g: parseChannel(rgb[2]), b: parseChannel(rgb[3]), a: alpha };
}

export function compositeColor(foreground, background) {
  const alpha = foreground.a ?? 1;
  return {
    r: foreground.r * alpha + background.r * (1 - alpha),
    g: foreground.g * alpha + background.g * (1 - alpha),
    b: foreground.b * alpha + background.b * (1 - alpha),
  };
}

export function relativeLuminance({ r, g, b }) {
  const linear = (value) => {
    const s = value / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

export function contrastRatio(a, b) {
  const x = relativeLuminance(a);
  const y = relativeLuminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export function extractThemeTokens(css, theme) {
  const match = css.match(new RegExp(`:root\\[data-theme='${theme}'\\]\\s*\\{([\\s\\S]*?)\\}`));
  if (!match) throw new Error(`Theme not found: ${theme}`);
  const tokens = {};
  for (const declaration of match[1].matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    tokens[`--${declaration[1]}`] = declaration[2].trim();
  }
  return tokens;
}
