import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBackupService } from '../electron/backup';
import type { CryptoService } from '../electron/crypto';
import type { DB } from '../electron/db';

const zipMock = vi.hoisted(() => ({ getData: vi.fn(), size: 0 }));
vi.mock('adm-zip', () => ({
  default: class {
    getEntry() {
      return {
        header: { size: zipMock.size },
        getData: zipMock.getData,
      };
    }
  },
}));

let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(process.cwd(), 'build', 'backup-service-test-'));
  fs.mkdirSync(path.join(dataDir, 'backups'), { recursive: true });
  zipMock.size = 256 * 1024 * 1024 + 1;
  zipMock.getData.mockReturnValue(Buffer.from('{"includes_keys":false}', 'utf8'));
});

afterEach(() => {
  zipMock.getData.mockReset();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function service() {
  return createBackupService({
    db: {} as DB,
    crypto: {} as CryptoService,
    dataDir,
    appVersion: '1.0.3',
  });
}

function backupFile(name = 'easyui-backup-20990101-0000.zip'): string {
  const full = path.join(dataDir, 'backups', name);
  fs.writeFileSync(full, 'zip placeholder');
  return full;
}

describe('备份清单读取（@req REQ-2026-001）', () => {
  it('manifest 超过 256MB 时不调用 getData 解压', () => {
    backupFile();
    expect(service().listBackups()).toHaveLength(1);
    expect(zipMock.getData).not.toHaveBeenCalled();
  });
});

describe('备份 manifest 元数据缓存（@req REQ-2026-003）', () => {
  it('文件未变化时重复列表只解压一次', () => {
    zipMock.size = 128;
    backupFile();
    const backups = service();
    backups.listBackups();
    backups.listBackups();
    expect(zipMock.getData).toHaveBeenCalledTimes(1);
  });

  it('mtime 变化时重新读取，不返回过期元数据', () => {
    zipMock.size = 128;
    const full = backupFile();
    const backups = service();
    backups.listBackups();
    fs.utimesSync(full, new Date('2099-01-01T00:00:00Z'), new Date('2099-01-01T00:00:00Z'));
    backups.listBackups();
    expect(zipMock.getData).toHaveBeenCalledTimes(2);
  });

  it('损坏 manifest 不缓存；成功解析后才复用', () => {
    zipMock.size = 128;
    backupFile();
    zipMock.getData
      .mockReturnValueOnce(Buffer.from('{broken', 'utf8'))
      .mockReturnValue(Buffer.from('{"includes_keys":true,"created_at":1234}', 'utf8'));
    const backups = service();
    expect(backups.listBackups()[0].includes_keys).toBe(false);
    expect(backups.listBackups()[0].includes_keys).toBe(true);
    expect(backups.listBackups()[0].created_at).toBe(1234);
    expect(zipMock.getData).toHaveBeenCalledTimes(2);
  });
});
