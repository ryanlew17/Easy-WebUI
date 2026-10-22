/**
 * URL 纯函数（主进程与渲染/mock 桥共用，保证行为一致）。
 * @req REQ-2026-001 — C1（base_url 换 host 清密钥）与 M5（base_url 合法性校验）。
 */

/** base_url → hostname 小写（解析失败回退原串 trim 小写，供子串匹配兜底） */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

/**
 * base_url 合法性：仅 http/https，且不得携带 userinfo
 * （`https://key@host` 形态会让密钥随 URL 进入超时错误消息与日志）。
 */
export function isValidBaseUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    const u = new URL(url);
    return u.username === '' && u.password === '';
  } catch {
    return false;
  }
}

/** base_url 的 host 是否变化（换 host = 已存密钥可能被发往新端点 → 须清除重输） */
export function shouldClearKeyOnBaseUrlChange(oldUrl: string, newUrl: string): boolean {
  return hostOf(oldUrl) !== hostOf(newUrl);
}
