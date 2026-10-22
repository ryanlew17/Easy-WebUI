/**
 * shared/url.ts 纯函数测试（@req REQ-2026-001）：
 * hostOf 提取与兜底、isValidBaseUrl 的 scheme/userinfo 校验、
 * shouldClearKeyOnBaseUrlChange 的 host 变更三态。
 */
import { describe, expect, it } from 'vitest';
import { hostOf, isValidBaseUrl, shouldClearKeyOnBaseUrlChange } from '@shared/url';

describe('hostOf', () => {
  it('提取 hostname 并小写化', () => {
    expect(hostOf('https://API.OpenAI.com/v1')).toBe('api.openai.com');
    expect(hostOf('http://localhost:11434/v1')).toBe('localhost');
    expect(hostOf('https://openrouter.ai/api/v1/')).toBe('openrouter.ai');
  });

  it('解析失败回退原串 trim 小写', () => {
    expect(hostOf('Not-A-Url ')).toBe('not-a-url');
    expect(hostOf('')).toBe('');
  });
});

describe('isValidBaseUrl', () => {
  it('接受 http/https（本地 http 供应商合法）', () => {
    expect(isValidBaseUrl('https://api.openai.com')).toBe(true);
    expect(isValidBaseUrl('http://127.0.0.1:1234/v1')).toBe(true);
  });

  it('拒绝非 http(s) scheme 与畸形串', () => {
    expect(isValidBaseUrl('file:///etc/passwd')).toBe(false);
    expect(isValidBaseUrl('ftp://x.com')).toBe(false);
    expect(isValidBaseUrl('api.openai.com')).toBe(false);
    expect(isValidBaseUrl('')).toBe(false);
  });

  it('拒绝携带 userinfo 的 URL（密钥可能随 URL 进日志）', () => {
    expect(isValidBaseUrl('https://sk-abc@api.openai.com/v1')).toBe(false);
    expect(isValidBaseUrl('https://user:pass@api.openai.com')).toBe(false);
  });
});

describe('shouldClearKeyOnBaseUrlChange', () => {
  it('host 不同 → true', () => {
    expect(shouldClearKeyOnBaseUrlChange('https://api.openai.com', 'https://evil.com')).toBe(true);
    // localhost 与 127.0.0.1 保守视为不同 host
    expect(shouldClearKeyOnBaseUrlChange('http://localhost:11434', 'http://127.0.0.1:11434')).toBe(true);
  });

  it('仅端口/路径变化 → false', () => {
    expect(shouldClearKeyOnBaseUrlChange('http://localhost:11434', 'http://localhost:1234/v1')).toBe(false);
    expect(shouldClearKeyOnBaseUrlChange('https://api.openai.com', 'https://api.openai.com/v1')).toBe(false);
  });

  it('仅大小写/协议默认端口差异 → false', () => {
    expect(shouldClearKeyOnBaseUrlChange('https://API.OPENAI.com/v1', 'https://api.openai.com/v2')).toBe(false);
  });
});
