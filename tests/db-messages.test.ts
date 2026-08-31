/**
 * schema v3 迁移 + 树形消息 DAO 测试（真实 better-sqlite3 :memory:）。
 *
 * - v2→v3 迁移：手工构造 v2 库（v1 DDL + v2 变更），跑 migrate() 断言
 *   parent_id 链回填、新列默认值、幂等；
 * - 分支模型：同级分支元数据（index 1 起 / count / ids）、switchToSibling、
 *   setActiveLeaf、 deepestDescendant；
 * - 删除：子树连删、active_leaf 回退最近存活祖先、删到只剩一支后无 branch；
 * - stats：四列组装 MessageStats，全 NULL 缺省；update stats 合并语义。
 */
import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { backfillParentLinks, migrate, openDatabase, SCHEMA_VERSION, type DB } from '../electron/db';
import { createConversationsDao } from '../electron/db/conversations';
import { createMessagesDao, type MessagesDao } from '../electron/db/messages';

/* ---------- v2 库构造（与 electron/db/index.ts 的 v1/v2 迁移产物同形） ---------- */

const V1_DDL = `
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
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

const V2_DDL = `
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
  ALTER TABLE conversations DROP COLUMN params_json;
`;

/** 构造一个 v2 形态的库：含一个会话 + 三条线性消息 */
function buildV2Db(): DB {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(V1_DDL);
  db.exec(V2_DDL);
  db.exec(
    'CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)',
  );
  db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)').run(1000);
  db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (2, ?)').run(1001);
  db.prepare(
    `INSERT INTO conversations (id, title, provider_id, model, preset_id, overrides_json, pinned, created_at, updated_at)
     VALUES ('c1', '', NULL, NULL, NULL, '{}', 0, 100, 100)`,
  ).run();
  const ins = db.prepare(
    `INSERT INTO messages (id, conversation_id, role, content, reasoning, token_count, partial, error_json, created_at)
     VALUES (?, 'c1', ?, ?, NULL, NULL, 0, NULL, ?)`,
  );
  ins.run('m1', 'user', 'hello', 100);
  ins.run('m2', 'assistant', 'hi there', 101);
  ins.run('m3', 'user', 'how are you', 102);
  return db;
}

describe('schema v2→v3 迁移', () => {
  it('回填 parent_id 链（首条 NULL），新列默认值正确', () => {
    const db = buildV2Db();
    migrate(db);

    const v = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number };
    expect(v.v).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(3);

    const rows = db
      .prepare('SELECT id, parent_id, reasoning_ms, ttft_ms, total_ms, finish_reason FROM messages ORDER BY created_at')
      .all() as {
      id: string;
      parent_id: string | null;
      reasoning_ms: number | null;
      ttft_ms: number | null;
      total_ms: number | null;
      finish_reason: string | null;
    }[];
    expect(rows.map((r) => [r.id, r.parent_id])).toEqual([
      ['m1', null],
      ['m2', 'm1'],
      ['m3', 'm2'],
    ]);
    for (const r of rows) {
      expect(r.reasoning_ms).toBeNull();
      expect(r.ttft_ms).toBeNull();
      expect(r.total_ms).toBeNull();
      expect(r.finish_reason).toBeNull();
    }

    const conv = db
      .prepare('SELECT active_leaf_id, reasoning_enabled FROM conversations WHERE id = ?')
      .get('c1') as { active_leaf_id: string | null; reasoning_enabled: number };
    expect(conv.active_leaf_id).toBeNull();
    expect(conv.reasoning_enabled).toBe(1);

    // 幂等：重复 migrate 不再应用（schema_migrations 门控），数据不变
    migrate(db);
    const again = db
      .prepare('SELECT id, parent_id FROM messages ORDER BY created_at')
      .all() as { id: string; parent_id: string | null }[];
    expect(again.map((r) => [r.id, r.parent_id])).toEqual([
      ['m1', null],
      ['m2', 'm1'],
      ['m3', 'm2'],
    ]);
  });

  it('迁移后的库经 DAO list() 得到完整激活路径（active_leaf 空 → 最新一条）', () => {
    const db = buildV2Db();
    migrate(db);
    const messages = createMessagesDao(db);
    const path = messages.list('c1');
    expect(path.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
    expect(path[0].parent_id).toBeNull();
    expect(path.every((m) => m.branch === undefined)).toBe(true); // 无分支
  });

  it('backfillParentLinks 对健康 v3 树是 no-op（已有分支结构不被改坏）', () => {
    const db = openDatabase(':memory:');
    const conversations = createConversationsDao(db);
    const messages = createMessagesDao(db);
    const conv = conversations.create();
    const root = messages.insert({ conversation_id: conv.id, role: 'user', content: 'q' });
    const a1 = messages.insert({ conversation_id: conv.id, parent_id: root.id, role: 'assistant', content: 'a1' });
    const a2 = messages.insert({ conversation_id: conv.id, parent_id: root.id, role: 'assistant', content: 'a2' });

    backfillParentLinks(db, [conv.id]);
    expect(messages.get(root.id)!.parent_id).toBeNull();
    expect(messages.get(a1.id)!.parent_id).toBe(root.id);
    expect(messages.get(a2.id)!.parent_id).toBe(root.id);
  });
});

/* ---------- 树形 DAO ---------- */

describe('树形消息 DAO', () => {
  let db: DB;
  let messages: MessagesDao;
  let convId: string;

  beforeEach(() => {
    db = openDatabase(':memory:');
    const conversations = createConversationsDao(db);
    messages = createMessagesDao(db);
    convId = conversations.create().id;
  });

  const ins = (
    role: 'user' | 'assistant',
    content: string,
    parent_id: string | null = null,
    created_at?: number,
  ) => messages.insert({ conversation_id: convId, role, content, parent_id, created_at });

  it('list：active_leaf 空 → 最新一条为叶，沿 parent 上溯为正序路径', () => {
    const u1 = ins('user', 'q1', null, 1);
    const a1 = ins('assistant', 'a1', u1.id, 2);
    const u2 = ins('user', 'q2', a1.id, 3);
    const a2 = ins('assistant', 'a2', u2.id, 4);
    expect(messages.list(convId).map((m) => m.id)).toEqual([u1.id, a1.id, u2.id, a2.id]);
  });

  it('分支元数据：同级 >1 时 index（1 起）/count/ids，按 created_at,rowid 排序', () => {
    const u1 = ins('user', 'q1', null, 1);
    const a1 = ins('assistant', 'a1', u1.id, 2);
    const a2 = ins('assistant', 'a2', u1.id, 3); // 同级分支
    ins('user', 'follow', a2.id, 4);

    // active_leaf 空 → 最新一条（follow）为叶 → 路径走 a2 分支
    const path = messages.list(convId);
    expect(path.map((m) => m.id)).toEqual([u1.id, a2.id, path[2].id]);
    expect(path[0].branch).toBeUndefined(); // 根无 parent → 无 branch
    const br = path[1].branch;
    expect(br).toBeDefined();
    expect(br!.count).toBe(2);
    expect(br!.index).toBe(2); // a2 是第二个同级
    expect(br!.ids).toEqual([a1.id, a2.id]);

    // 切到 a1 分支：路径上 a1 的 index=1
    messages.switchToSibling(convId, a1.id);
    const path2 = messages.list(convId);
    expect(path2.map((m) => m.id)).toEqual([u1.id, a1.id]);
    expect(path2[1].branch!.index).toBe(1);
  });

  it('switchToSibling 下钻到目标分支的最深后代（分叉处取最新子）', () => {
    const u1 = ins('user', 'q1', null, 1);
    const a1 = ins('assistant', 'a1', u1.id, 2);
    const a2 = ins('assistant', 'a2', u1.id, 3);
    const u2 = ins('user', 'q2', a2.id, 4);
    const a2x = ins('assistant', 'a2x', u2.id, 5);

    messages.switchToSibling(convId, a2.id);
    const convRow = db
      .prepare('SELECT active_leaf_id FROM conversations WHERE id = ?')
      .get(convId) as { active_leaf_id: string };
    expect(convRow.active_leaf_id).toBe(a2x.id); // 最深后代
    expect(messages.list(convId).map((m) => m.id)).toEqual([u1.id, a2.id, u2.id, a2x.id]);
  });

  it('setActiveLeaf 精确设叶； deepestDescendant 沿最新子下钻', () => {
    const u1 = ins('user', 'q1', null, 1);
    const a1 = ins('assistant', 'a1', u1.id, 2);
    const u2 = ins('user', 'q2', a1.id, 3);
    messages.setActiveLeaf(convId, a1.id);
    expect(messages.list(convId).map((m) => m.id)).toEqual([u1.id, a1.id]);
    expect(messages.deepestDescendant(u1.id)).toBe(u2.id);
    expect(messages.deepestDescendant(u2.id)).toBe(u2.id); // 无子即自身
  });

  it('subtreeIds 递归收集含自身的全部后代', () => {
    const u1 = ins('user', 'q1', null, 1);
    const a1 = ins('assistant', 'a1', u1.id, 2);
    const a2 = ins('assistant', 'a2', u1.id, 3);
    const u2 = ins('user', 'q2', a1.id, 4);
    expect(new Set(messages.subtreeIds(u1.id))).toEqual(new Set([u1.id, a1.id, a2.id, u2.id]));
    expect(messages.subtreeIds(a2.id)).toEqual([a2.id]);
  });

  it('deleteWithDescendants：删中间节点连删子树，active_leaf 回退最近存活祖先', () => {
    const u1 = ins('user', 'q1', null, 1);
    const a1 = ins('assistant', 'a1', u1.id, 2);
    const u2 = ins('user', 'q2', a1.id, 3);
    const a2 = ins('assistant', 'a2', u2.id, 4);
    messages.setActiveLeaf(convId, a2.id);

    const n = messages.deleteWithDescendants(convId, [u2.id]); // 删 u2 + a2
    expect(n).toBe(2);
    expect(messages.get(u2.id)).toBeNull();
    expect(messages.get(a2.id)).toBeNull();
    // active_leaf 回退到 a1（被删路径上最近存活祖先）
    expect(messages.list(convId).map((m) => m.id)).toEqual([u1.id, a1.id]);
  });

  it('deleteWithDescendants：全删光 → active_leaf 置 NULL', () => {
    const u1 = ins('user', 'q1', null, 1);
    const a1 = ins('assistant', 'a1', u1.id, 2);
    messages.setActiveLeaf(convId, a1.id);
    const n = messages.deleteWithDescendants(convId, [u1.id]);
    expect(n).toBe(2);
    const convRow = db
      .prepare('SELECT active_leaf_id FROM conversations WHERE id = ?')
      .get(convId) as { active_leaf_id: string | null };
    expect(convRow.active_leaf_id).toBeNull();
    expect(messages.list(convId)).toEqual([]);
  });

  it('删到只剩一支后路径上不再有 branch 元数据', () => {
    const u1 = ins('user', 'q1', null, 1);
    const a1 = ins('assistant', 'a1', u1.id, 2);
    const a2 = ins('assistant', 'a2', u1.id, 3);
    expect(messages.list(convId)[1].branch).toBeDefined(); // 当前有分支

    messages.deleteWithDescendants(convId, [a2.id]);
    const path = messages.list(convId);
    expect(path.map((m) => m.id)).toEqual([u1.id, a1.id]);
    expect(path[1].branch).toBeUndefined(); // 只剩一支 → 无 branch
  });

  it('stats：四列组装 MessageStats，全 NULL 时缺省；update 合并语义', () => {
    const m = ins('assistant', 'x');
    expect(m.stats).toBeUndefined();

    messages.update(m.id, { stats: { ttft_ms: 120, total_ms: 900, finish_reason: 'stop' } });
    let got = messages.get(m.id)!;
    expect(got.stats).toEqual({ ttft_ms: 120, total_ms: 900, finish_reason: 'stop' });

    // 合并：只传 total_ms，其余键保留
    messages.update(m.id, { stats: { total_ms: 1500 } });
    got = messages.get(m.id)!;
    expect(got.stats).toEqual({ ttft_ms: 120, total_ms: 1500, finish_reason: 'stop' });

    // reasoning_ms 单独合并进来
    messages.update(m.id, { stats: { reasoning_ms: 300 } });
    got = messages.get(m.id)!;
    expect(got.stats).toEqual({ reasoning_ms: 300, ttft_ms: 120, total_ms: 1500, finish_reason: 'stop' });
  });

  it('insert 支持 parent_id 与 stats 直写', () => {
    const u = ins('user', 'q', null, 1);
    const a = messages.insert({
      conversation_id: convId,
      parent_id: u.id,
      role: 'assistant',
      content: 'a',
      stats: { reasoning_ms: 10, ttft_ms: 20, total_ms: 30, finish_reason: 'length' },
    });
    expect(a.parent_id).toBe(u.id);
    expect(a.stats).toEqual({ reasoning_ms: 10, ttft_ms: 20, total_ms: 30, finish_reason: 'length' });
  });
});
