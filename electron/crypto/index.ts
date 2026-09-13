/**
 * 密钥加密服务（docs/design/security.md，密钥存储）：
 * - 首选 Electron safeStorage（Windows DPAPI / macOS Keychain / Linux 系统密钥环）。
 * - safeStorage 不可用时的回退：机器指纹（hostname+用户名+平台 的 SHA-256，
 *   简化实现，非硬件 GUID——见下）经 scrypt 派生 AES-256-GCM 密钥；
 *   随机盐（密钥材料）存 data/keyring.bin，权限 600。
 *
 * 密文格式（自描述前缀，解密时按前缀分发）：
 *   'v1:ss:<base64>'   —— safeStorage 密文
 *   'v1:mf:<base64>'   —— machine-fallback（nonce‖tag‖ct 的 base64）
 *
 * 红线：密钥明文只允许存在于本模块调用瞬间与请求组装瞬间；
 * 解密方（编排层）拿到明文后必须立即 registerSecret() 以便日志/错误脱敏。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { EncryptionStatus } from '../../shared/types';
import { aesGcmDecrypt, aesGcmEncrypt, scryptDerive, sha256, randomSalt } from './lowlevel';

/** 与 electron.safeStorage 结构兼容的可注入接口（便于测试与解耦） */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export interface CryptoService {
  status(): EncryptionStatus;
  /** 返回带前缀的密文字符串（适合以 BLOB/TEXT 落库） */
  encryptString(plain: string): string;
  decryptString(cipher: string): string;
}

const PREFIX_SAFE = 'v1:ss:';
const PREFIX_MACH = 'v1:mf:';

/**
 * 机器指纹（简化取舍）：hostname + 用户名 + 平台 的 SHA-256。
 * 未读取主板 UUID / 机器 GUID（跨平台代价高）；真正的保密强度来自
 * keyring.bin（600 权限）中的随机盐，指纹只提供"换机器/换用户即解不开"的绑定。
 */
function machineFingerprint(): Buffer {
  let username = 'unknown';
  try {
    username = os.userInfo().username;
  } catch {
    /* 某些容器环境 userInfo 会抛错，退化为 unknown */
  }
  return sha256(`${os.hostname()}|${username}|${process.platform}|${process.arch}`);
}

/** 读取或创建 keyring.bin（随机盐，权限 600） */
function loadOrCreateKeyring(dataDir: string): Buffer {
  const file = path.join(dataDir, 'keyring.bin');
  try {
    const existing = fs.readFileSync(file);
    if (existing.length >= 16) return existing;
  } catch {
    /* 不存在则创建 */
  }
  const salt = randomSalt(16);
  fs.writeFileSync(file, salt, { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600); // Windows 上 chmod 是尽力而为
  } catch {
    /* ignore */
  }
  return salt;
}

export function createCryptoService(opts: {
  dataDir: string;
  safeStorage?: SafeStorageLike | null;
}): CryptoService {
  const ss = opts.safeStorage ?? null;
  const useSafe = !!ss && safeIsAvailable(ss);

  // 回退路径的派生密钥（惰性，仅在真正需要时计算）
  let fallbackKey: Buffer | null = null;
  const getFallbackKey = (): Buffer => {
    if (!fallbackKey) {
      const salt = loadOrCreateKeyring(opts.dataDir);
      fallbackKey = scryptDerive(machineFingerprint(), salt, 32);
    }
    return fallbackKey;
  };

  return {
    status(): EncryptionStatus {
      return {
        method: useSafe ? 'safeStorage' : 'machine-fallback',
        available: useSafe,
      };
    },

    encryptString(plain: string): string {
      if (useSafe) {
        return PREFIX_SAFE + ss!.encryptString(plain).toString('base64');
      }
      return PREFIX_MACH + aesGcmEncrypt(getFallbackKey(), plain).toString('base64');
    },

    decryptString(cipher: string): string {
      if (cipher.startsWith(PREFIX_SAFE)) {
        if (!ss) throw new Error('safestorage_unavailable');
        return ss.decryptString(Buffer.from(cipher.slice(PREFIX_SAFE.length), 'base64'));
      }
      if (cipher.startsWith(PREFIX_MACH)) {
        return aesGcmDecrypt(
          getFallbackKey(),
          Buffer.from(cipher.slice(PREFIX_MACH.length), 'base64'),
        ).toString('utf8');
      }
      throw new Error('unknown_cipher_format');
    },
  };
}

function safeIsAvailable(ss: SafeStorageLike): boolean {
  try {
    return ss.isEncryptionAvailable();
  } catch {
    return false;
  }
}
