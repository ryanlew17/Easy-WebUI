/**
 * 导航 / 新窗口 / IPC 发送方白名单判定（纯函数，可单测）。
 * @req REQ-2026-001 I1/I2/I3（docs/design/security.md 纵深防御）：
 * 主窗口只允许停留在应用文档（dev=vite origin；prod=file:// dist/index.html）。
 * 渲染层一旦发生 XSS，不能通过顶层导航或 window.open 把恶意页面寄生进应用窗口
 * （preload 会对窗口内每个新文档重新注入，寄生页面将获得完整 window.easyui）。
 */

/** will-navigate：dev 仅允许 vite dev origin 同源；prod 不允许任何顶层导航 */
export function isAllowedNavigationUrl(url: string, devOrigin: string | null): boolean {
  if (!devOrigin) return false;
  try {
    return new URL(url).origin === devOrigin;
  } catch {
    return false;
  }
}

/** IPC senderFrame 校验：必须是应用文档自身（dev 同源 / prod file:// dist/index.html） */
export function isAppFrameUrl(url: string | undefined, devOrigin: string | null): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (devOrigin) return u.origin === devOrigin;
    return u.protocol === 'file:' && u.pathname.replace(/\\/g, '/').endsWith('/dist/index.html');
  } catch {
    return false;
  }
}

/** window.open / target=_blank：仅 http(s) 转系统浏览器，其余一律 deny */
export function shouldOpenExternally(url: string): boolean {
  return /^https?:\/\//i.test(url);
}
