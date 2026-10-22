/**
 * electron/webcontents-guard.ts 纯函数测试（@req REQ-2026-001 I1/I2/I3）：
 * 导航白名单、IPC senderFrame 校验、外链协议白名单。
 */
import { describe, expect, it } from 'vitest';
import {
  isAllowedNavigationUrl,
  isAppFrameUrl,
  shouldOpenExternally,
} from '../electron/webcontents-guard';

const DEV_ORIGIN = 'http://localhost:5173';

describe('isAllowedNavigationUrl', () => {
  it('dev：同源放行，跨源拦截', () => {
    expect(isAllowedNavigationUrl('http://localhost:5173/chat', DEV_ORIGIN)).toBe(true);
    expect(isAllowedNavigationUrl('https://evil.com', DEV_ORIGIN)).toBe(false);
    expect(isAllowedNavigationUrl('http://localhost:5174', DEV_ORIGIN)).toBe(false);
  });

  it('prod（devOrigin=null）：任何顶层导航都拦截', () => {
    expect(isAllowedNavigationUrl('https://evil.com', null)).toBe(false);
    expect(isAllowedNavigationUrl('file:///E:/app/dist/index.html', null)).toBe(false);
  });

  it('畸形 URL 拦截', () => {
    expect(isAllowedNavigationUrl('not a url', DEV_ORIGIN)).toBe(false);
  });
});

describe('isAppFrameUrl', () => {
  it('dev：vite origin 同源为应用文档', () => {
    expect(isAppFrameUrl('http://localhost:5173/', DEV_ORIGIN)).toBe(true);
    expect(isAppFrameUrl('https://evil.com/', DEV_ORIGIN)).toBe(false);
  });

  it('prod：仅 file:// 且指向 dist/index.html', () => {
    expect(isAppFrameUrl('file:///E:/AI_Coding/EasyWebUI/dist/index.html', null)).toBe(true);
    expect(isAppFrameUrl('file:///E:/AI_Coding/EasyWebUI/dist/index.html#/', null)).toBe(true);
    expect(isAppFrameUrl('file:///etc/passwd', null)).toBe(false);
    expect(isAppFrameUrl('https://evil.com/dist/index.html', null)).toBe(false);
  });

  it('空/畸形一律拒绝', () => {
    expect(isAppFrameUrl(undefined, null)).toBe(false);
    expect(isAppFrameUrl('', DEV_ORIGIN)).toBe(false);
    expect(isAppFrameUrl('::', DEV_ORIGIN)).toBe(false);
  });
});

describe('shouldOpenExternally', () => {
  it('仅 http/https', () => {
    expect(shouldOpenExternally('https://github.com/x')).toBe(true);
    expect(shouldOpenExternally('http://example.com')).toBe(true);
    expect(shouldOpenExternally('file:///C:/Windows')).toBe(false);
    expect(shouldOpenExternally('javascript:alert(1)')).toBe(false);
    expect(shouldOpenExternally('easywebui://x')).toBe(false);
  });
});
