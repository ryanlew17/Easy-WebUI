/**
 * 通用设置 DAO：settings 键值表（kimi.md §7.2 之外另加，契约 §1 GeneralSettings）。
 * 单条记录 key='general'，value 为 JSON；读取时与 DEFAULT_SETTINGS 合并，
 * 保证新增字段向后兼容。
 */
import type { DB } from './index';
import type { GeneralSettings } from '../../shared/types';
import { DEFAULT_SETTINGS } from '../../shared/types';

const KEY = 'general';

export function createSettingsDao(db: DB) {
  const getStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  const upsertStmt = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  );

  return {
    get(): GeneralSettings {
      const row = getStmt.get(KEY) as { value: string } | undefined;
      if (!row) return { ...DEFAULT_SETTINGS };
      try {
        return { ...DEFAULT_SETTINGS, ...(JSON.parse(row.value) as Partial<GeneralSettings>) };
      } catch {
        return { ...DEFAULT_SETTINGS };
      }
    },

    set(patch: Partial<GeneralSettings>): GeneralSettings {
      const next = { ...this.get(), ...patch };
      upsertStmt.run(KEY, JSON.stringify(next));
      return next;
    },

    /** 备份恢复用：整体写入 */
    replaceAll(value: GeneralSettings): void {
      upsertStmt.run(KEY, JSON.stringify({ ...DEFAULT_SETTINGS, ...value }));
    },
  };
}

export type SettingsDao = ReturnType<typeof createSettingsDao>;
