/**
 * 底层加密原语（纯 node:crypto，不依赖 electron / better-sqlite3）：
 * - scrypt KDF
 * - AES-256-GCM 加解密（输出 blob 布局：12B nonce ‖ 16B tag ‖ ciphertext）
 * - SHA-256
 *
 * 被 crypto/index.ts（safeStorage 回退）与 backup/core.ts（备份密码加密）共用；
 * 单元测试（tests/crypto.test.ts、tests/backup.test.ts）直接测本模块。
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from 'node:crypto';

export interface ScryptParams {
  N: number;
  r: number;
  p: number;
}

/** 备份密码 KDF 参数（docs/contracts/backup-format.md：scrypt N=2^15, r=8, p=1） */
export const BACKUP_KDF: ScryptParams = { N: 2 ** 15, r: 8, p: 1 };

const NONCE_LEN = 12; // AES-GCM 标准 96-bit nonce
const TAG_LEN = 16;

export function sha256(input: string | Buffer): Buffer {
  return createHash('sha256').update(input).digest();
}

export function randomSalt(len = 16): Buffer {
  return randomBytes(len);
}

export function scryptDerive(
  secret: string | Buffer,
  salt: Buffer,
  keylen = 32,
  params: ScryptParams = BACKUP_KDF,
): Buffer {
  // OpenSSL 3 默认 maxmem=32MB，N=2^15·r=8·p=1 需要 ~64MB，必须显式放大上限
  return scryptSync(secret, salt, keylen, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: 256 * 1024 * 1024,
  });
}

export function aesGcmEncrypt(key: Buffer, plaintext: string | Buffer): Buffer {
  const nonce = randomBytes(NONCE_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: TAG_LEN });
  const data = typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : plaintext;
  const enc = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([nonce, tag, enc]);
}

export function aesGcmDecrypt(key: Buffer, blob: Buffer): Buffer {
  if (blob.length < NONCE_LEN + TAG_LEN) {
    throw new Error('cipher_blob_too_short');
  }
  const nonce = blob.subarray(0, NONCE_LEN);
  const tag = blob.subarray(NONCE_LEN, NONCE_LEN + TAG_LEN);
  const data = blob.subarray(NONCE_LEN + TAG_LEN);
  const decipher = createDecipheriv('aes-256-gcm', key, nonce, { authTagLength: TAG_LEN });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}
