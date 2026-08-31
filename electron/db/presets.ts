/**
 * presets DAO（schema v2）：参数预设的 CRUD。
 * - 全局预设（id='global', is_global=1）恒存在：启动 ensureGlobal() 兜底
 *   （迁移 v2 已插入；overwrite 恢复清空 presets 后由备份层再补）；
 * - list() 全局预设恒在首位；
 * - 全局预设只允许改 params（重命名/删除在 IPC 层拦截，DAO 层同样防御）；
 * - 删除用户预设时显式把引用它的会话 preset_id 置 null
 *   （conversations.preset_id 另有 FK ON DELETE SET NULL 双保险）。
 */
import { randomUUID } from 'node:crypto';
import type { DB } from './index';
import type { ParamPreset, ParamValues } from '../../shared/params';
import { FACTORY_DEFAULTS, GLOBAL_PRESET_ID, sanitizeParams } from '../../shared/params';

export interface PresetRow {
  id: string;
  name: string;
  is_global: number;
  params_json: string;
  created_at: number;
  updated_at: number;
}

export function rowToPreset(row: PresetRow): ParamPreset {
  let params: ParamValues = { ...FACTORY_DEFAULTS };
  try {
    params = sanitizeParams(JSON.parse(row.params_json));
  } catch {
    /* 损坏 JSON 用工厂默认 */
  }
  return {
    id: row.id,
    name: row.name,
    is_global: row.is_global === 1,
    params,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function createPresetsDao(db: DB) {
  const getStmt = db.prepare('SELECT * FROM presets WHERE id = ?');
  const listStmt = db.prepare('SELECT * FROM presets ORDER BY is_global DESC, created_at ASC');
  const insertStmt = db.prepare(
    `INSERT INTO presets (id, name, is_global, params_json, created_at, updated_at)
     VALUES (@id, @name, @is_global, @params_json, @created_at, @updated_at)`,
  );

  return {
    /** 启动/恢复后兜底：无全局预设则插入工厂默认 */
    ensureGlobal(): void {
      const now = Date.now();
      insertStmt.run({
        id: GLOBAL_PRESET_ID,
        name: 'Global',
        is_global: 1,
        params_json: JSON.stringify(FACTORY_DEFAULTS),
        created_at: now,
        updated_at: now,
      });
    },

    hasGlobal(): boolean {
      return getStmt.get(GLOBAL_PRESET_ID) !== undefined;
    },

    /** 全局预设恒在首位 */
    list(): ParamPreset[] {
      return (listStmt.all() as PresetRow[]).map(rowToPreset);
    },

    get(id: string): ParamPreset | null {
      const row = getStmt.get(id) as PresetRow | undefined;
      return row ? rowToPreset(row) : null;
    },

    create(input: { name: string; params: ParamValues }): ParamPreset {
      const now = Date.now();
      const row: PresetRow = {
        id: randomUUID(),
        name: input.name,
        is_global: 0,
        params_json: JSON.stringify(sanitizeParams(input.params)),
        created_at: now,
        updated_at: now,
      };
      insertStmt.run(row);
      return rowToPreset(row);
    },

    /** 全局预设忽略 name（只允许改 params）；返回 null 表示不存在 */
    update(id: string, patch: { name?: string; params?: ParamValues }): ParamPreset | null {
      const row = getStmt.get(id) as PresetRow | undefined;
      if (!row) return null;
      const isGlobal = row.is_global === 1;
      const next: PresetRow = {
        ...row,
        name: isGlobal ? row.name : (patch.name ?? row.name),
        params_json: patch.params ? JSON.stringify(sanitizeParams(patch.params)) : row.params_json,
        updated_at: Date.now(),
      };
      db.prepare(
        'UPDATE presets SET name = @name, params_json = @params_json, updated_at = @updated_at WHERE id = @id',
      ).run(next);
      return rowToPreset(next);
    },

    /** 全局预设不可删；删除前把引用会话的 preset_id 置 null */
    delete(id: string): void {
      const row = getStmt.get(id) as PresetRow | undefined;
      if (!row || row.is_global === 1) return;
      db.prepare('UPDATE conversations SET preset_id = NULL WHERE preset_id = ?').run(id);
      db.prepare('DELETE FROM presets WHERE id = ?').run(id);
    },

    /** 全局预设参数重置为工厂默认 */
    resetGlobal(): ParamPreset {
      const row = getStmt.get(GLOBAL_PRESET_ID) as PresetRow | undefined;
      if (!row) {
        this.ensureGlobal();
        return this.get(GLOBAL_PRESET_ID) as ParamPreset;
      }
      return this.update(GLOBAL_PRESET_ID, { params: { ...FACTORY_DEFAULTS } }) as ParamPreset;
    },
  };
}

export type PresetsDao = ReturnType<typeof createPresetsDao>;
