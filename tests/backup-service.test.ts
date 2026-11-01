import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBackupService } from '../electron/backup';
import type { CryptoService } from '../electron/crypto';
import type { DB } from '../electron/db';

const zipMock = vi.hoisted(() => ({ getData: vi.fn() }));
vi.mock('adm-zip', () => ({
  default: class {
    getEntry() {
      return {
        header: { size: 256 * 1024 * 1024 + 1 },
        getData: zipMock.getData,
      };
    }
  },
}));

let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(process.cwd(), 'build', 'backup-service-test-'));
  fs.mkdirSync(path.join(dataDir, 'backups'), { recursive: true });
  zipMock.getData.mockReturnValue(Buffer.from('{"includes_keys":false}', 'utf8'));
});

afterEach(() => {
  zipMock.getData.mockReset();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('备份清单读取（@req REQ-2026-001）', () => {
  it('manifest 超过 256MB 时不调用 getData 解压', () => {
    const filename = 'easyui-backup-20990101-0000.zip';
    fs.writeFileSync(path.join(dataDir, 'backups', filename), 'zip placeholder');
    const service = createBackupService({
      db: {} as DB,
      crypto: {} as CryptoService,
      dataDir,
      appVersion: '1.0.2',
    });
    expect(service.listBackups()).toHaveLength(1);
    expect(zipMock.getData).not.toHaveBeenCalled();
  });
});
