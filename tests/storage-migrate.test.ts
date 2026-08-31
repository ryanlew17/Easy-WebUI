/**
 * 存储迁移（electron/storage-migrate.ts）与数据目录解析（electron/paths.ts）测试。
 * 纯 Node：只用 os.tmpdir() 临时目录 + 假 AppLike；绝不能 import 任何依赖
 * better-sqlite3 / electron 的模块（Electron ABI 与 vitest 的 Node 不兼容）。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrateStorageDir, STORAGE_LAYOUT_VERSION } from '../electron/storage-migrate';
import { resolveDataDir, type AppLike } from '../electron/paths';

let tmp: string;
const logs: { msg: string; extra?: unknown }[] = [];
const log = (msg: string, extra?: unknown) => logs.push({ msg, extra });

function mkApp(overrides: Partial<AppLike> = {}): AppLike {
  return {
    isPackaged: true,
    getAppPath: () => path.join(tmp, 'app'),
    getPath: () => path.join(tmp, 'userData'),
    ...overrides,
  };
}

function writeFakeDb(dir: string, content = 'fake-sqlite'): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'easyui.db'), content);
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'easyui-storage-test-'));
  logs.length = 0;
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('migrateStorageDir', () => {
  it('① 旧目录数据迁移到新默认目录（含子文件），并写 marker', () => {
    const legacy = path.join(tmp, 'legacy', 'data');
    writeFakeDb(legacy);
    fs.writeFileSync(path.join(legacy, 'note.txt'), 'keep-me');
    fs.mkdirSync(path.join(legacy, 'backups'));
    fs.writeFileSync(path.join(legacy, 'backups', 'b1.zip'), 'zip');

    const target = path.join(tmp, 'userData', 'data');
    const r = migrateStorageDir(target, [legacy], log);

    expect(r.migratedFrom).toBe(legacy);
    expect(fs.readFileSync(path.join(target, 'easyui.db'), 'utf8')).toBe('fake-sqlite');
    expect(fs.readFileSync(path.join(target, 'note.txt'), 'utf8')).toBe('keep-me');
    expect(fs.readFileSync(path.join(target, 'backups', 'b1.zip'), 'utf8')).toBe('zip');
    // 旧目录不删除
    expect(fs.existsSync(path.join(legacy, 'easyui.db'))).toBe(true);
    // marker 已写
    const marker = JSON.parse(
      fs.readFileSync(path.join(target, 'storage-layout.json'), 'utf8'),
    ) as { layout: number };
    expect(marker.layout).toBe(STORAGE_LAYOUT_VERSION);
  });

  it('② 目标已有数据时不重复迁移（内容不被覆盖）', () => {
    const legacy = path.join(tmp, 'legacy');
    writeFakeDb(legacy, 'legacy-db');
    const target = path.join(tmp, 'target');
    writeFakeDb(target, 'current-db');

    const r = migrateStorageDir(target, [legacy], log);

    expect(r.migratedFrom).toBeUndefined();
    expect(fs.readFileSync(path.join(target, 'easyui.db'), 'utf8')).toBe('current-db');
  });

  it('按序选第一个含 easyui.db 的 legacy 目录', () => {
    const legacyA = path.join(tmp, 'a');
    const legacyB = path.join(tmp, 'b');
    fs.mkdirSync(legacyA, { recursive: true }); // A 无 db
    writeFakeDb(legacyB, 'b-db');
    const target = path.join(tmp, 'target');

    const r = migrateStorageDir(target, [legacyA, legacyB], log);
    expect(r.migratedFrom).toBe(legacyB);
    expect(fs.readFileSync(path.join(target, 'easyui.db'), 'utf8')).toBe('b-db');
  });

  it('③ 缺 marker 但有 db → 补写 marker；重复调用幂等', () => {
    const target = path.join(tmp, 'target');
    writeFakeDb(target);
    expect(fs.existsSync(path.join(target, 'storage-layout.json'))).toBe(false);

    const r1 = migrateStorageDir(target, [], log);
    expect(r1.migratedFrom).toBeUndefined();
    expect(
      (JSON.parse(fs.readFileSync(path.join(target, 'storage-layout.json'), 'utf8')) as {
        layout: number;
      }).layout,
    ).toBe(STORAGE_LAYOUT_VERSION);

    // 幂等：再跑一遍，db 与 marker 均不变
    const r2 = migrateStorageDir(target, [], log);
    expect(r2.migratedFrom).toBeUndefined();
    expect(fs.readFileSync(path.join(target, 'easyui.db'), 'utf8')).toBe('fake-sqlite');
  });

  it('全新目录（无 db 无迁移源）→ 仅写 marker', () => {
    const target = path.join(tmp, 'fresh');
    const r = migrateStorageDir(target, [path.join(tmp, 'nonexistent')], log);
    expect(r.migratedFrom).toBeUndefined();
    expect(fs.existsSync(path.join(target, 'easyui.db'))).toBe(false);
    expect(fs.existsSync(path.join(target, 'storage-layout.json'))).toBe(true);
  });
});

describe('resolveDataDir', () => {
  it('④a 指针文件存在且合法 → source custom', () => {
    const app = mkApp();
    const custom = path.join(tmp, 'my-data');
    const pointerPath = path.join(app.getPath('userData'), 'data-dir-pointer.json');
    fs.mkdirSync(path.dirname(pointerPath), { recursive: true });
    fs.writeFileSync(pointerPath, JSON.stringify({ dataDir: custom }));

    const r = resolveDataDir(app, {});
    expect(r.source).toBe('custom');
    expect(r.dir).toBe(custom);
    expect(r.isPortable).toBe(false);
    expect(fs.existsSync(custom)).toBe(true); // 可写探测已建目录
  });

  it('指针非法（相对路径/坏 JSON）→ 回退默认', () => {
    const app = mkApp();
    const pointerPath = path.join(app.getPath('userData'), 'data-dir-pointer.json');
    fs.mkdirSync(path.dirname(pointerPath), { recursive: true });
    fs.writeFileSync(pointerPath, JSON.stringify({ dataDir: 'relative/path' }));

    const r = resolveDataDir(app, {});
    expect(r.source).toBe('default');
    expect(r.dir).toBe(path.join(app.getPath('userData'), 'data'));

    fs.writeFileSync(pointerPath, '{not json');
    const r2 = resolveDataDir(app, {});
    expect(r2.source).toBe('default');
  });

  it('④b 便携 env（PORTABLE_EXECUTABLE_DIR）→ source portable，指针在便携根目录', () => {
    const portableRoot = path.join(tmp, 'EasyWebUI-Portable');
    fs.mkdirSync(portableRoot, { recursive: true });
    const app = mkApp();

    const r = resolveDataDir(app, { PORTABLE_EXECUTABLE_DIR: portableRoot });
    expect(r.isPortable).toBe(true);
    expect(r.source).toBe('portable');
    expect(r.dir).toBe(path.join(portableRoot, 'data'));
    expect(r.pointerPath).toBe(path.join(portableRoot, 'easywebui-data-dir.json'));
  });

  it('便携 + 指针 → 指针优先（custom），isPortable 仍为 true', () => {
    const portableRoot = path.join(tmp, 'EasyWebUI-Portable');
    fs.mkdirSync(portableRoot, { recursive: true });
    const custom = path.join(tmp, 'elsewhere');
    fs.writeFileSync(
      path.join(portableRoot, 'easywebui-data-dir.json'),
      JSON.stringify({ dataDir: custom }),
    );

    const r = resolveDataDir(mkApp(), { PORTABLE_EXECUTABLE_DIR: portableRoot });
    expect(r.source).toBe('custom');
    expect(r.dir).toBe(custom);
    expect(r.isPortable).toBe(true);
  });

  it('④c 安装版（packaged 无便携 env）→ userData/data，source default', () => {
    const app = mkApp();
    const r = resolveDataDir(app, {});
    expect(r.source).toBe('default');
    expect(r.isPortable).toBe(false);
    expect(r.dir).toBe(path.join(app.getPath('userData'), 'data'));
    expect(r.pointerPath).toBe(path.join(app.getPath('userData'), 'data-dir-pointer.json'));
    // legacyDirs 中的 exe 旁 data 不存在时被过滤
    for (const d of r.legacyDirs) expect(fs.existsSync(d)).toBe(true);
  });

  it('dev（未打包）→ appPath/data，legacyDirs 为空', () => {
    const app = mkApp({ isPackaged: false });
    const r = resolveDataDir(app, { PORTABLE_EXECUTABLE_DIR: tmp }); // dev 忽略便携 env
    expect(r.source).toBe('default');
    expect(r.isPortable).toBe(false);
    expect(r.dir).toBe(path.join(app.getAppPath(), 'data'));
    expect(r.legacyDirs).toEqual([]);
  });
});
