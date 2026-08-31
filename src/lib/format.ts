/**
 * 数字 / 时间格式化（kimi.md §5.5）：一律走 Intl，按当前语言。
 * locale 参数由调用方从 i18n.language 传入，保持纯函数。
 */

export function formatDateTime(ts: number, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toISOString();
  }
}

export function formatTime(ts: number, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(
      new Date(ts),
    );
  } catch {
    return '';
  }
}

export function formatNumber(n: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale).format(n);
  } catch {
    return String(n);
  }
}

export function formatBytes(n: number, locale: string): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const num =
    i === 0
      ? String(Math.round(v))
      : new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(v);
  return `${num} ${units[i]}`;
}

export function formatLatency(ms: number, locale: string): string {
  return `${formatNumber(ms, locale)} ms`;
}

/**
 * 生成耗时统一格式化（reasoning 块标题 / 统计行共用）：
 * <60s → zh「X.XX 秒」/ en「X.XXs」；≥60s → zh「X 分 XX 秒」/ en「Xm XXs」。
 */
export function formatDurationMs(ms: number, locale: string): string {
  const zh = locale.startsWith('zh');
  const s = ms / 1000;
  if (s < 60) {
    const v = s.toFixed(2);
    return zh ? `${v} 秒` : `${v}s`;
  }
  const m = Math.floor(s / 60);
  const rest = String(Math.round(s % 60)).padStart(2, '0');
  return zh ? `${m} 分 ${rest} 秒` : `${m}m ${rest}s`;
}

/** 速率（tok/s）两位小数，按语言本地化小数点 */
export function formatRate(perSec: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(perSec);
  } catch {
    return perSec.toFixed(2);
  }
}

/**
 * 会话标题展示的唯一入口（侧栏行 / 消息流顶栏共用，保证「空标题 → 占位文案」
 * 与「有标题 → 原文」两种状态在所有消费点一致联动，不再各处散写 `title || t(...)`）。
 */
export function displayTitle(title: string, untitled: string): string {
  const trimmed = title.trim();
  return trimmed.length > 0 ? trimmed : untitled;
}
