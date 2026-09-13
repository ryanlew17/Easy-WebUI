/**
 * SQLite 数据层入口（docs/contracts/db-schema.md）：WAL + foreign_keys + schema_migrations 迁移。
 *
 * schema 版本史：
 * - v1：providers / conversations(params_json 旧 SessionParams) / messages(+reasoning) / settings；
 * - v2（参数预设重构）：新增 presets 表；conversations 增 preset_id + overrides_json，
 *   旧 params_json（SessionParams 扁平结构）逐行走 shared/params.ts 的 migrateLegacyParamsJson
 *   迁移后 DROP；provider_id/model 提升到顶层列；插入全局预设（id='global'，工厂默认）。
 * - v3（树形分支模型）：messages 增 parent_id + 生成统计列（reasoning_ms/ttft_ms/
 *   total_ms/finish_reason）；conversations 增 active_leaf_id + reasoning_enabled(默认 1)；
 *   旧线性历史按 (created_at, rowid) 顺序回填 parent_id 链（首条为 NULL）。
 */
import Database from 'better-sqlite3';
import { FACTORY_DEFAULTS, GLOBAL_PRESET_ID, migrateLegacyParamsJson } from '../../shared/params';

export type DB = Database.Database;

export const SCHEMA_VERSION = 3;

interface Migration {
  version: number;
  up: (db: DB) => void;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up(db) {
      db.exec(`
        CREATE TABLE providers (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          base_url TEXT NOT NULL,
          api_format TEXT NOT NULL CHECK(api_format IN ('openai-chat','openai-responses','anthropic')),
          api_key_cipher BLOB,
          models_json TEXT NOT NULL DEFAULT '[]',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE conversations (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL DEFAULT '',
          provider_id TEXT REFERENCES providers(id) ON DELETE SET NULL,
          model TEXT,
          params_json TEXT NOT NULL DEFAULT '{}',
          pinned INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX idx_conv_updated ON conversations(updated_at DESC);

        CREATE TABLE messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          role TEXT NOT NULL CHECK(role IN ('system','user','assistant')),
          content TEXT NOT NULL,
          reasoning TEXT,
          token_count INTEGER,
          partial INTEGER NOT NULL DEFAULT 0,
          error_json TEXT,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX idx_msg_conv ON messages(conversation_id, created_at);

        CREATE TABLE settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
    },
  },
  {
    version: 2,
    up(db) {
      db.exec(`
        CREATE TABLE presets (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          is_global INTEGER NOT NULL DEFAULT 0,
          params_json TEXT NOT NULL DEFAULT '{}',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        ALTER TABLE conversations ADD COLUMN preset_id TEXT REFERENCES presets(id) ON DELETE SET NULL;
        ALTER TABLE conversations ADD COLUMN overrides_json TEXT NOT NULL DEFAULT '{}';
      `);

      // 旧 params_json（SessionParams）→ overrides（纯函数迁移，规则见 shared/params.ts）
      const rows = db
        .prepare('SELECT id, provider_id, model, params_json FROM conversations')
        .all() as { id: string; provider_id: string | null; model: string | null; params_json: string }[];
      const upd = db.prepare(
        'UPDATE conversations SET provider_id = ?, model = ?, overrides_json = ? WHERE id = ?',
      );
      for (const r of rows) {
        const m = migrateLegacyParamsJson(r.params_json, r.provider_id, r.model);
        upd.run(m.provider_id, m.model, JSON.stringify(m.overrides), r.id);
      }

      // 全局预设：工厂默认（不存在才插入，幂等）
      const now = Date.now();
      db.prepare(
        `INSERT INTO presets (id, name, is_global, params_json, created_at, updated_at)
         VALUES (?, ?, 1, ?, ?, ?)
         ON CONFLICT(id) DO NOTHING`,
      ).run(GLOBAL_PRESET_ID, 'Global', JSON.stringify(FACTORY_DEFAULTS), now, now);

      db.exec('ALTER TABLE conversations DROP COLUMN params_json');
    },
  },
  {
    version: 3,
    up(db) {
      db.exec(`
        ALTER TABLE messages ADD COLUMN parent_id TEXT;
        ALTER TABLE messages ADD COLUMN reasoning_ms INTEGER;
        ALTER TABLE messages ADD COLUMN ttft_ms INTEGER;
        ALTER TABLE messages ADD COLUMN total_ms INTEGER;
        ALTER TABLE messages ADD COLUMN finish_reason TEXT;
        CREATE INDEX idx_msg_parent ON messages(parent_id);

        ALTER TABLE conversations ADD COLUMN active_leaf_id TEXT;
        ALTER TABLE conversations ADD COLUMN reasoning_enabled INTEGER NOT NULL DEFAULT 1;
      `);

      // 旧线性历史 → 树：按 (created_at, rowid) 顺序把 parent_id 填成前一条消息
      // （首条为 NULL）。backfillParentLinks 只补 parent_id 为 NULL 的非首条，
      // 健康 v3 库上重跑为空操作（幂等；本迁移本身在事务内由 schema_migrations 保证只跑一次）。
      const convIds = (db.prepare('SELECT id FROM conversations').all() as { id: string }[]).map(
        (r) => r.id,
      );
      backfillParentLinks(db, convIds);
    },
  },
];

/**
 * parent_id 链回填（v3 迁移与旧版备份恢复共用）：
 * 对每个会话按 (created_at, rowid) 升序扫描，parent_id 为 NULL 且不是序列首条的
 * 消息把 parent 指向前一条；已含非 NULL parent_id 的消息一律不动。
 * 健康 v3 会话（仅根消息 parent_id 为 NULL 且为最老一条）上运行是无害的 no-op。
 */
export function backfillParentLinks(db: DB, conversationIds: readonly string[]): void {
  const listStmt = db.prepare(
    'SELECT id, parent_id FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, rowid ASC',
  );
  const upd = db.prepare('UPDATE messages SET parent_id = ? WHERE id = ?');
  for (const cid of conversationIds) {
    const rows = listStmt.all(cid) as { id: string; parent_id: string | null }[];
    let prev: string | null = null;
    for (const r of rows) {
      if (r.parent_id === null && prev !== null) upd.run(prev, r.id);
      prev = r.id;
    }
  }
}

export function migrate(db: DB): void {
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)',
  );
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as
    | { v: number | null }
    | undefined;
  const current = row?.v ?? 0;
  for (const m of MIGRATIONS) {
    if (m.version > current) {
      const apply = db.transaction(() => {
        m.up(db);
        db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
          m.version,
          Date.now(),
        );
      });
      apply();
    }
  }
}

export function openDatabase(file: string): DB {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}
