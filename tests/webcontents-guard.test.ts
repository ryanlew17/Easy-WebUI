/**
 * 渲染与导航安全测试（@req REQ-2026-001 I1/I2/I3）：
 * 导航白名单、IPC senderFrame 校验、外链协议白名单与首帧脚本 CSP 一致性。
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
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

describe('startup script CSP', () => {
  it('meta 与主进程响应头放行同一实际脚本哈希，且不启用 unsafe-inline', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const main = readFileSync(new URL('../electron/main.ts', import.meta.url), 'utf8');
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    const meta = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
    const header = main.match(/const CSP =\s*"([^"]+)"/)?.[1];
    expect(script).toBeDefined();
    expect(meta).toBeDefined();
    expect(header).toBeDefined();
    const token = `sha256-${createHash('sha256').update(script!, 'utf8').digest('base64')}`;
    expect(meta).toContain(`script-src 'self' '${token}'`);
    expect(header).toContain(`script-src 'self' '${token}'`);
    expect(meta?.match(/script-src[^;]+/)?.[0]).not.toContain('unsafe-inline');
    expect(header?.match(/script-src[^;]+/)?.[0]).not.toContain('unsafe-inline');
  });
});
