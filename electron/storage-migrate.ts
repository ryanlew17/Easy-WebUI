/**
 * 存储目录迁移与布局版本管理（v0.1.1）。
 *
 * 两个职责：
 * 1. 数据抢救迁移：目标目录无 easyui.db 时，按序找 legacyDirs 里第一个含
 *    easyui.db 的旧目录，整体递归复制过来。同时覆盖两种丢失场景：
 *    - 安装版升级重装清空安装目录 → 从旧 exe 旁 data/ 抢救；
 *    - 便携版旧版本数据落在 %TEMP% 解包目录 → 从临时目录抢救。
 *    复制前再次确认目标仍无 db，避免覆盖并发写入；任何情况下不删除旧目录。
 * 2. 布局版本 marker：dir/storage-layout.json，形如 {"layout":1}。
 *    - 缺 marker 但有 easyui.db → 视为布局 1（历史数据），补写 marker；
 *    - 缺 db 也无迁移源（全新安装）→ 直接写 marker；
 *    - 未来布局变更：在 LAYOUT_STEPS 数组追加 { to: N, up(dir) } 步骤，
 *      migrateStorageDir 会按序执行从当前版本到 STORAGE_LAYOUT_VERSION 的
 *      所有步骤并更新 marker（扩展点，当前为空）。
 *
 * 纯 node fs/path，不 import electron / better-sqlite3，vitest 纯 Node 可测。
 */
import fs from 'node:fs';
import path from 'node:path';

export const STORAGE_LAYOUT_VERSION = 1;

const DB_NAME = 'easyui.db';
const MARKER_NAME = 'storage-layout.json';

type LogFn = (msg: string, extra?: unknown) => void;

/**
 * 布局升级步骤（扩展点）。未来布局 N+1 时追加：
 *   { to: 2, up: (dir) => { ...原地改造 dir 内文件... } }
 * 步骤必须幂等或只在版本跨越时执行一次（本函数保证每个版本只执行一次）。
 */
const LAYOUT_STEPS: { to: number; up: (dir: string) => void }[] = [];

function hasDb(dir: string): boolean {
  try {
    return fs.existsSync(path.join(dir, DB_NAME));
  } catch {
    return false;
  }
}

function readLayout(dir: string): number | null {
  try {
    const p = path.join(dir, MARKER_NAME);
    if (!fs.existsSync(p)) return null;
    const parsed: unknown = JSON.parse(fs.readFileSync(p, 'utf8'));
    const layout = (parsed as { layout?: unknown } | null)?.layout;
    return typeof layout === 'number' && Number.isInteger(layout) && layout >= 1 ? layout : null;
  } catch {
    return null;
  }
}

function writeLayout(dir: string, layout: number): void {
  fs.writeFileSync(path.join(dir, MARKER_NAME), JSON.stringify({ layout }), 'utf8');
}

export function migrateStorageDir(
  dir: string,
  legacyDirs: string[],
  log: LogFn,
): { migratedFrom?: string } {
  fs.mkdirSync(dir, { recursive: true });

  let migratedFrom: string | undefined;

  // —— 1. 数据抢救迁移 ——
  if (!hasDb(dir)) {
    for (const legacy of legacyDirs) {
      if (path.resolve(legacy) === path.resolve(dir)) continue;
      if (!hasDb(legacy)) continue;
      if (hasDb(dir)) break; // 复制前再确认目标仍无 db，避免覆盖
      try {
        fs.cpSync(legacy, dir, { recursive: true });
        migratedFrom = legacy;
        log('storage migrated from legacy dir', { from: legacy, to: dir });
        break;
      } catch (e) {
        log('storage migration copy failed', {
          from: legacy,
          to: dir,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  // —— 2. 布局版本 marker ——
  let layout = readLayout(dir);
  if (layout === null) {
    // 缺 marker：有 db（含刚迁移来的）视为布局 1；全新目录也直接落成当前版本
    layout = STORAGE_LAYOUT_VERSION;
    writeLayout(dir, layout);
    log('storage layout marker written', { dir, layout });
  }
  // 未来布局升级：逐步执行 LAYOUT_STEPS
  for (const step of LAYOUT_STEPS) {
    if (step.to > layout && step.to <= STORAGE_LAYOUT_VERSION) {
      step.up(dir);
      writeLayout(dir, step.to);
      layout = step.to;
      log('storage layout upgraded', { dir, layout });
    }
  }

  return { migratedFrom };
}
