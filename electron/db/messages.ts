/**
 * 树形消息 DAO（schema v3）：messages 以 parent_id 构成树，list() 返回
 * "激活路径"（active_leaf → 根，反转后正序），路径上有同级分支的消息填充
 * branch 元数据（index 1 起 / count / ids，同级按 created_at,rowid 排序）。
 *
 * @req REQ-2026-003 每个公开树操作单次读取会话并共享 id/children 索引；
 * visited 防环保留，消除子树、下钻和删除的 N+1 SQL。
 */
import { randomUUID } from 'node:crypto';
import type { DB } from './index';
import type { Message, MessageStats } from '../../shared/types';

export interface MessageRow {
  id: string;
  conversation_id: string;
  parent_id: string | null;
  role: 'system' | 'user' | 'assistant';
  content: string;
  reasoning: string | null;
  token_count: number | null;
  partial: number;
  error_json: string | null;
  reasoning_ms: number | null;
  ttft_ms: number | null;
  total_ms: number | null;
  finish_reason: string | null;
  created_at: number;
}

/** 行 → Message：四列统计全 NULL 时 stats 缺省，否则组装 MessageStats */
function statsOf(row: MessageRow): MessageStats | undefined {
  if (
    row.reasoning_ms == null &&
    row.ttft_ms == null &&
    row.total_ms == null &&
    row.finish_reason == null
  ) {
    return undefined;
  }
  const stats: MessageStats = {};
  if (row.reasoning_ms != null) stats.reasoning_ms = row.reasoning_ms;
  if (row.ttft_ms != null) stats.ttft_ms = row.ttft_ms;
  if (row.total_ms != null) stats.total_ms = row.total_ms;
  if (row.finish_reason != null) stats.finish_reason = row.finish_reason;
  return stats;
}

export function rowToMessage(row: MessageRow): Message {
  let error: Message['error'] = null;
  if (row.error_json) {
    try {
      error = JSON.parse(row.error_json) as Message['error'];
    } catch {
      error = null;
    }
  }
  const stats = statsOf(row);
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    parent_id: row.parent_id,
    role: row.role,
    content: row.content,
    reasoning: row.reasoning ?? undefined,
    token_count: row.token_count,
    partial: row.partial === 1,
    error,
    ...(stats ? { stats } : {}),
    created_at: row.created_at,
  };
}

interface MessageTreeIndex {
  rows: MessageRow[];
  byId: Map<string, MessageRow>;
  childrenOf: Map<string | null, MessageRow[]>;
}

/** 由全量行建索引：id→row、parent→子行数组（输入已按 created_at,rowid 升序） */
function indexRows(rows: MessageRow[]): MessageTreeIndex {
  const byId = new Map<string, MessageRow>();
  const childrenOf = new Map<string | null, MessageRow[]>();
  for (const r of rows) {
    byId.set(r.id, r);
    const key = r.parent_id;
    const arr = childrenOf.get(key);
    if (arr) arr.push(r);
    else childrenOf.set(key, [r]);
  }
  return { rows, byId, childrenOf };
}

/** 从叶沿 parent_id 上溯到根，返回正序（根在前）；父缺失/成环时截断防御 */
function pathFromLeaf(byId: Map<string, MessageRow>, leafId: string): MessageRow[] {
  const path: MessageRow[] = [];
  const seen = new Set<string>();
  let cur: MessageRow | undefined = byId.get(leafId);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    path.push(cur);
    cur = cur.parent_id != null ? byId.get(cur.parent_id) : undefined;
  }
  path.reverse();
  return path;
}

/** 沿最新子下钻；visited 同时防止恶意 parent 环导致死循环。 */
function deepestDescendantFromIndex(
  childrenOf: Map<string | null, MessageRow[]>,
  messageId: string,
): string {
  let cur = messageId;
  const seen = new Set<string>([cur]);
  for (;;) {
    const children = childrenOf.get(cur) ?? [];
    const next = children[children.length - 1];
    if (!next || seen.has(next.id)) return cur;
    seen.add(next.id);
    cur = next.id;
  }
}

/** 子树全部 id（含自身；先序），共享 children 索引并保留环守卫。 */
function subtreeIdsFromIndex(
  childrenOf: Map<string | null, MessageRow[]>,
  messageId: string,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>([messageId]);
  const stack = [messageId];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    out.push(id);
    for (const child of childrenOf.get(id) ?? []) {
      if (!seen.has(child.id)) {
        seen.add(child.id);
        stack.push(child.id);
      }
    }
  }
  return out;
}

export function createMessagesDao(db: DB) {
  const getStmt = db.prepare('SELECT * FROM messages WHERE id = ?');
  const allOfConvStmt = db.prepare(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, rowid ASC',
  );
  const childrenStmt = db.prepare(
    'SELECT * FROM messages WHERE conversation_id = ? AND parent_id = ? ORDER BY created_at ASC, rowid ASC',
  );
  const insertStmt = db.prepare(
    `INSERT INTO messages (id, conversation_id, parent_id, role, content, reasoning, token_count,
       partial, error_json, reasoning_ms, ttft_ms, total_ms, finish_reason, created_at)
     VALUES (@id, @conversation_id, @parent_id, @role, @content, @reasoning, @token_count,
       @partial, @error_json, @reasoning_ms, @ttft_ms, @total_ms, @finish_reason, @created_at)`,
  );
  const activeLeafStmt = db.prepare('SELECT active_leaf_id FROM conversations WHERE id = ?');
  const setActiveLeafStmt = db.prepare('UPDATE conversations SET active_leaf_id = ? WHERE id = ?');

  const getRow = (id: string): MessageRow | undefined => getStmt.get(id) as MessageRow | undefined;
  const loadConversationIndex = (conversationId: string): MessageTreeIndex =>
    indexRows(allOfConvStmt.all(conversationId) as MessageRow[]);

  /** 激活叶：active_leaf_id 有效则用之，否则最新一条（created_at,rowid 最大）；空会话 → undefined */
  function resolveLeafRow(
    convId: string,
    index: MessageTreeIndex,
  ): MessageRow | undefined {
    const conv = activeLeafStmt.get(convId) as { active_leaf_id: string | null } | undefined;
    if (conv?.active_leaf_id) {
      const hit = index.byId.get(conv.active_leaf_id);
      if (hit) return hit;
    }
    return index.rows[index.rows.length - 1];
  }

  function deepestDescendantId(convId: string, messageId: string): string {
    const index = loadConversationIndex(convId);
    return deepestDescendantFromIndex(index.childrenOf, messageId);
  }

  return {
    insert(input: {
      id?: string;
      conversation_id: string;
      parent_id?: string | null;
      role: Message['role'];
      content: string;
      reasoning?: string;
      token_count?: number | null;
      partial?: boolean;
      error?: { code: string; message: string } | null;
      stats?: MessageStats;
      created_at?: number;
    }): Message {
      const row: MessageRow = {
        id: input.id ?? randomUUID(),
        conversation_id: input.conversation_id,
        parent_id: input.parent_id ?? null,
        role: input.role,
        content: input.content,
        reasoning: input.reasoning ?? null,
        token_count: input.token_count ?? null,
        partial: input.partial ? 1 : 0,
        error_json: input.error ? JSON.stringify(input.error) : null,
        reasoning_ms: input.stats?.reasoning_ms ?? null,
        ttft_ms: input.stats?.ttft_ms ?? null,
        total_ms: input.stats?.total_ms ?? null,
        finish_reason: input.stats?.finish_reason ?? null,
        created_at: input.created_at ?? Date.now(),
      };
      insertStmt.run(row);
      return rowToMessage(row);
    },

    get(id: string): Message | null {
      const row = getRow(id);
      return row ? rowToMessage(row) : null;
    },

    /** 激活路径解析，并为路径上的分叉填充 branch 元数据。 */
    list(conversationId: string): Message[] {
      const index = loadConversationIndex(conversationId);
      if (index.rows.length === 0) return [];
      const leaf = resolveLeafRow(conversationId, index);
      if (!leaf) return [];
      const path = pathFromLeaf(index.byId, leaf.id);
      return path.map((row) => {
        const msg = rowToMessage(row);
        if (row.parent_id != null) {
          const siblings = index.childrenOf.get(row.parent_id) ?? [];
          if (siblings.length > 1) {
            msg.branch = {
              index: siblings.findIndex((s) => s.id === row.id) + 1,
              count: siblings.length,
              ids: siblings.map((s) => s.id),
            };
          }
        }
        return msg;
      });
    },

    /** 根到指定消息的路径（生成编排组装请求历史用，不含 branch 元数据） */
    pathTo(messageId: string): Message[] {
      const anchor = getRow(messageId);
      if (!anchor) return [];
      const index = loadConversationIndex(anchor.conversation_id);
      return pathFromLeaf(index.byId, messageId).map(rowToMessage);
    },

    /** 指定消息的直接子消息（按 created_at,rowid 升序） */
    childrenOfList(convId: string, parentId: string): Message[] {
      return (childrenStmt.all(convId, parentId) as MessageRow[]).map(rowToMessage);
    },

    /** 子树全部 id（含自身；先序），删除子树用 */
    subtreeIds(messageId: string): string[] {
      const anchor = getRow(messageId);
      if (!anchor) return [];
      const index = loadConversationIndex(anchor.conversation_id);
      return subtreeIdsFromIndex(index.childrenOf, messageId);
    },

    /** 沿"最新子"下钻到的最深后代 id（无子即自身） */
    deepestDescendant(messageId: string): string {
      const anchor = getRow(messageId);
      if (!anchor) return messageId;
      return deepestDescendantId(anchor.conversation_id, messageId);
    },

    /** 会话当前激活叶（指针失效/空会话回退最新一条；空会话 → null） */
    activeLeaf(convId: string): Message | null {
      const index = loadConversationIndex(convId);
      const leaf = resolveLeafRow(convId, index);
      return leaf ? rowToMessage(leaf) : null;
    },

    setActiveLeaf(convId: string, leafId: string | null): void {
      setActiveLeafStmt.run(leafId, convId);
    },

    /** 切换分支：激活叶 = 目标同级分支沿"最新子"下钻的最深后代 */
    switchToSibling(convId: string, siblingId: string): void {
      this.setActiveLeaf(convId, deepestDescendantId(convId, siblingId));
    },

    /** 删除各目标子树；激活叶在被删集合时回退最近存活祖先并下钻最新存活后代。 */
    deleteWithDescendants(convId: string, ids: readonly string[]): number {
      const index = loadConversationIndex(convId);
      const toDelete = new Set<string>();
      for (const id of ids) {
        if (!index.byId.has(id)) continue;
        for (const sub of subtreeIdsFromIndex(index.childrenOf, id)) toDelete.add(sub);
      }
      if (toDelete.size === 0) return 0;

      const conv = activeLeafStmt.get(convId) as { active_leaf_id: string | null } | undefined;
      const leafHit = !!conv?.active_leaf_id && toDelete.has(conv.active_leaf_id);
      let survivor: string | null = null;
      if (leafHit) {
        let cur = index.byId.get(conv.active_leaf_id as string);
        const seen = new Set<string>();
        while (cur && !seen.has(cur.id)) {
          seen.add(cur.id);
          const parentId = cur.parent_id;
          if (parentId == null) break;
          if (!toDelete.has(parentId) && index.byId.has(parentId)) {
            survivor = parentId;
            break;
          }
          cur = parentId ? index.byId.get(parentId) : undefined;
        }
      }

      let count = 0;
      const tx = db.transaction(() => {
        const doomed = [...toDelete];
        for (let offset = 0; offset < doomed.length; offset += 500) {
          const chunk = doomed.slice(offset, offset + 500);
          const placeholders = chunk.map(() => '?').join(',');
          count += db.prepare(`DELETE FROM messages WHERE id IN (${placeholders})`).run(...chunk).changes;
        }
        if (leafHit) {
          let nextLeaf: string | null = null;
          if (survivor !== null) {
            const remaining = indexRows(index.rows.filter((row) => !toDelete.has(row.id)));
            nextLeaf = deepestDescendantFromIndex(remaining.childrenOf, survivor);
          }
          setActiveLeafStmt.run(nextLeaf, convId);
        }
      });
      tx();
      return count;
    },

    /** stats 合并语义：patch.stats 中出现的键覆盖对应列，缺省键保持原值。 */
    update(
      id: string,
      patch: {
        content?: string;
        reasoning?: string;
        token_count?: number | null;
        partial?: boolean;
        error?: { code: string; message: string } | null;
        stats?: MessageStats;
      },
    ): Message | null {
      const row = getRow(id);
      if (!row) return null;
      const next: MessageRow = {
        ...row,
        content: patch.content ?? row.content,
        reasoning: patch.reasoning === undefined ? row.reasoning : patch.reasoning || null,
        token_count: patch.token_count === undefined ? row.token_count : patch.token_count,
        partial: patch.partial === undefined ? row.partial : patch.partial ? 1 : 0,
        error_json:
          patch.error === undefined ? row.error_json : patch.error ? JSON.stringify(patch.error) : null,
        reasoning_ms:
          patch.stats?.reasoning_ms === undefined ? row.reasoning_ms : patch.stats.reasoning_ms,
        ttft_ms: patch.stats?.ttft_ms === undefined ? row.ttft_ms : patch.stats.ttft_ms,
        total_ms: patch.stats?.total_ms === undefined ? row.total_ms : patch.stats.total_ms,
        finish_reason:
          patch.stats?.finish_reason === undefined ? row.finish_reason : patch.stats.finish_reason,
      };
      db.prepare(
        `UPDATE messages SET content=@content, reasoning=@reasoning, token_count=@token_count,
         partial=@partial, error_json=@error_json, reasoning_ms=@reasoning_ms, ttft_ms=@ttft_ms,
         total_ms=@total_ms, finish_reason=@finish_reason WHERE id=@id`,
      ).run(next);
      return rowToMessage(next);
    },

    lastUserMessage(conversationId: string): Message | null {
      const row = db
        .prepare(
          `SELECT * FROM messages WHERE conversation_id = ? AND role = 'user'
           ORDER BY created_at DESC, rowid DESC LIMIT 1`,
        )
        .get(conversationId) as MessageRow | undefined;
      return row ? rowToMessage(row) : null;
    },

    countByConversation(conversationId: string): number {
      const r = db
        .prepare('SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ?')
        .get(conversationId) as { n: number };
      return r.n;
    },
  };
}

export type MessagesDao = ReturnType<typeof createMessagesDao>;
