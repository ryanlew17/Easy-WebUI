/**
 * 加密层测试（不依赖 electron safeStorage——只测抽象出的纯函数）：
 * - redact：字符串/对象/数组/Error 递归脱敏，已知密钥 → 前 3 字符 + '***'；
 * - scrypt + AES-256-GCM 加解密 roundtrip、篡改检测、错误密钥失败。
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  randomSalt,
  scryptDerive,
  sha256,
} from '../electron/crypto/lowlevel';
import {
  clearRegisteredSecrets,
  redact,
  redactString,
  registerSecret,
} from '../electron/crypto/redact';

afterEach(() => clearRegisteredSecrets());

describe('redact', () => {
  it('字符串中的已知密钥替换为 前3字符+***', () => {
    registerSecret('sk-live-abcdef123456');
    expect(redactString('auth failed for key sk-live-abcdef123456, retry')).toBe(
      'auth failed for key sk-***, retry',
    );
  });

  it('同一密钥多次出现全部替换；未知串不动', () => {
    registerSecret('sk-aaa-bbb');
    expect(redactString('sk-aaa-bbb and sk-aaa-bbb and sk-other')).toBe('sk-*** and sk-*** and sk-other');
  });

  it('递归对象与数组', () => {
    registerSecret('deepseek-key-xyz');
    const out = redact({
      headers: { authorization: 'Bearer deepseek-key-xyz' },
      list: ['deepseek-key-xyz', 'ok'],
      nested: { err: { message: 'used deepseek-key-xyz' } },
      untouched: 42,
    });
    expect(out.headers.authorization).toBe('Bearer dee***');
    expect(out.list[0]).toBe('dee***');
    expect(out.list[1]).toBe('ok');
    expect(out.nested.err.message).toBe('used dee***');
    expect(out.untouched).toBe(42);
    // 非前缀切片：'deepseek-key-xyz'.slice(0,3) === 'dee'
  });

  it('Error：message/stack 脱敏，name 与 code 保留', () => {
    registerSecret('sk-err-secret');
    const err = new Error('request failed with sk-err-secret');
    err.name = 'GatewayError';
    (err as { code?: string }).code = '401';
    const out = redact(err);
    expect(out).toBeInstanceOf(Error);
    expect(out.message).toBe('request failed with sk-***');
    expect(out.name).toBe('GatewayError');
    expect((out as { code?: string }).code).toBe('401');
  });

  it('过短的值不注册（避免误伤）', () => {
    registerSecret('ab');
    expect(redactString('ab cd ab')).toBe('ab cd ab');
  });
});

describe('scrypt + AES-256-GCM roundtrip', () => {
  it('scrypt 派生确定性且长度 32', () => {
    const salt = randomSalt(16);
    const k1 = scryptDerive('password-123', salt);
    const k2 = scryptDerive('password-123', salt);
    expect(k1.equals(k2)).toBe(true);
    expect(k1.length).toBe(32);
    // 不同盐 → 不同密钥
    expect(scryptDerive('password-123', randomSalt(16)).equals(k1)).toBe(false);
  });

  it('加密 → 解密还原（含中文）', () => {
    const key = scryptDerive('pw', randomSalt(16));
    const plain = 'sk-密钥-plaintext-123';
    const blob = aesGcmEncrypt(key, plain);
    expect(aesGcmDecrypt(key, blob).toString('utf8')).toBe(plain);
  });

  it('每次加密 nonce 随机（同输入不同密文）', () => {
    const key = scryptDerive('pw', randomSalt(16));
    const a = aesGcmEncrypt(key, 'same');
    const b = aesGcmEncrypt(key, 'same');
    expect(a.equals(b)).toBe(false);
  });

  it('篡改密文 → GCM 认证失败抛错', () => {
    const key = scryptDerive('pw', randomSalt(16));
    const blob = aesGcmEncrypt(key, 'data');
    const tampered = Buffer.from(blob);
    tampered[tampered.length - 1] = tampered[tampered.length - 1] ^ 0xff;
    expect(() => aesGcmDecrypt(key, tampered)).toThrow();
  });

  it('错误密钥（等价于错误备份密码）→ 抛错', () => {
    const blob = aesGcmEncrypt(scryptDerive('right-pw', randomSalt(16)), 'data');
    const wrongKey = scryptDerive('wrong-pw', randomSalt(16));
    expect(() => aesGcmDecrypt(wrongKey, blob)).toThrow();
  });

  it('过短 blob 明确报 cipher_blob_too_short', () => {
    expect(() => aesGcmDecrypt(scryptDerive('pw', randomSalt(16)), Buffer.alloc(8))).toThrow(
      'cipher_blob_too_short',
    );
  });

  it('sha256 输出 32 字节', () => {
    expect(sha256('host|user|win32').length).toBe(32);
  });
});
