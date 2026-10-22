/**
 * 树形消息 DAO（schema v3）：messages 以 parent_id 构成树，list() 返回
 * "激活路径"（active_leaf → 根，反转后正序），路径上有同级分支的消息填充
 * branch 元数据（index 1 起 / count / ids，同级按 created_at,rowid 排序）。
 *
 * - active_leaf_id 存于 conversations 表；为空时叶 = 最新一条消息；
 * - stats（MessageStats）由 reasoning_ms / ttft_ms / total_ms / finish_reason
 *   四列组装，全 NULL 时 stats 缺省；
 * - switchToSibling = setActiveLeaf(deepestDescendant(siblingId))：切到目标
 *   同级分支后沿"最新子"下钻到最深后代；
 * - deleteWithDescendants 删各节点子树；active_leaf 落在被删集合时回退到
 *   最近存活祖先并沿最新存活子下钻（全删光则 NULL）。
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

/** 由全量行建索引：id→row、parent→子行数组（按 created_at,rowid 升序） */
function indexRows(rows: MessageRow[]): {
  byId: Map<string, MessageRow>;
  childrenOf: Map<string | null, MessageRow[]>;
} {
  const byId = new Map<string, MessageRow>();
  const childrenOf = new Map<string | null, MessageRow[]>();
  for (const r of rows) {
    byId.set(r.id, r);
    const key = r.parent_id;
    const arr = childrenOf.get(key);
    if (arr) arr.push(r);
    else childrenOf.set(key, [r]);
  }
  return { byId, childrenOf };
}

/** 从叶沿 parent_id 上溯到根，返回正序（根在前）；父缺失/成环时截断防御 */
function pathFromLeaf(byId: Map<string, MessageRow>, leafId: string): MessageRow[] {
  const path: MessageRow[] = [];
  const seen = new Set<string>();
  let cur: MessageRow | undefined = byId.get(leafId);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    path.unshift(cur);
    cur = cur.parent_id != null ? byId.get(cur.parent_id) : undefined;
  }
  return path;
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

  const getRow = (id: string): MessageRow | undefined => getStmt.get(id) as MessageRow | undefined;

  /** 激活叶：active_leaf_id 有效则用之，否则最新一条（created_at,rowid 最大）；空会话 → undefined */
  function resolveLeafRow(convId: string, rows: MessageRow[]): MessageRow | undefined {
    const conv = activeLeafStmt.get(convId) as { active_leaf_id: string | null } | undefined;
    if (conv?.active_leaf_id) {
      const hit = rows.find((r) => r.id === conv.active_leaf_id);
      if (hit) return hit; // 指针失效（外部删库等）→ 回退最新一条
    }
    return rows[rows.length - 1];
  }

  /** 沿"最新子"（created_at,rowid 最大）下钻到最深后代 */
  function deepestDescendantId(convId: string, messageId: string): string {
    let cur = messageId;
    const seen = new Set<string>([cur]);
    for (;;) {
      const children = childrenStmt.all(convId, cur) as MessageRow[];
      const next = children[children.length - 1];
      if (!next || seen.has(next.id)) return cur;
      seen.add(next.id);
      cur = next.id;
    }
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

    /**
     * 激活路径解析：active_leaf（空=最新一条）→ 沿 parent_id 上溯 → 反转为正序；
     * 路径上每条消息若其 parent 的子消息数 > 1，填充 branch={index(1 起), count, ids}。
     */
    list(conversationId: string): Message[] {
      const rows = allOfConvStmt.all(conversationId) as MessageRow[];
      if (rows.length === 0) return [];
      const { byId, childrenOf } = indexRows(rows);
      const leaf = resolveLeafRow(conversationId, rows);
      if (!leaf) return [];
      const path = pathFromLeaf(byId, leaf.id);
      return path.map((row) => {
        const msg = rowToMessage(row);
        if (row.parent_id != null) {
          const siblings = childrenOf.get(row.parent_id) ?? [];
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

    /** 根到指定消息的路径（正序；生成编排组装请求历史用，不含 branch 元数据） */
    pathTo(messageId: string): Message[] {
      const anchor = getRow(messageId);
      if (!anchor) return [];
      const rows = allOfConvStmt.all(anchor.conversation_id) as MessageRow[];
      const { byId } = indexRows(rows);
      return pathFromLeaf(byId, messageId).map(rowToMessage);
    },

    /** 指定消息的直接子消息（按 created_at,rowid 升序） */
    childrenOfList(convId: string, parentId: string): Message[] {
      return (childrenStmt.all(convId, parentId) as MessageRow[]).map(rowToMessage);
    },

    /** 子树全部 id（含自身；先序），删除子树用 */
    subtreeIds(messageId: string): string[] {
      const anchor = getRow(messageId);
      if (!anchor) return [];
      const out: string[] = [];
      // @req REQ-2026-001 I6：环守卫——恶意备份可注入 parent_id 环（A↔B），
      // 无 seen 集合时本遍历死循环且 out 无限增长
      const seen = new Set<string>([messageId]);
      const stack = [messageId];
      while (stack.length > 0) {
        const id = stack.pop() as string;
        out.push(id);
        const children = childrenStmt.all(anchor.conversation_id, id) as MessageRow[];
        for (const c of children) {
          if (!seen.has(c.id)) {
            seen.add(c.id);
            stack.push(c.id);
          }
        }
      }
      return out;
    },

    /** 沿"最新子"下钻到的最深后代 id（无子即自身） */
    deepestDescendant(messageId: string): string {
      const anchor = getRow(messageId);
      if (!anchor) return messageId;
      return deepestDescendantId(anchor.conversation_id, messageId);
    },

    /** 会话当前激活叶（指针失效/空会话回退最新一条；空会话 → null） */
    activeLeaf(convId: string): Message | null {
      const rows = allOfConvStmt.all(convId) as MessageRow[];
      const leaf = resolveLeafRow(convId, rows);
      return leaf ? rowToMessage(leaf) : null;
    },

    setActiveLeaf(convId: string, leafId: string | null): void {
      db.prepare('UPDATE conversations SET active_leaf_id = ? WHERE id = ?').run(leafId, convId);
    },

    /** 切换分支：激活叶 = 目标同级分支沿"最新子"下钻的最深后代 */
    switchToSibling(convId: string, siblingId: string): void {
      this.setActiveLeaf(convId, deepestDescendantId(convId, siblingId));
    },

    /**
     * 删除各节点及其整个子树；active_leaf 落在被删集合时，回退到被删路径上
     * 最近的存活祖先、并沿"最新存活子"下钻到该位置的最新分支（仅指回祖先本身
     * 会让路径停在半截、其余分支全部"消失"，且后续新消息会挂成新同级分支）。
     * 祖先也全被删则 NULL。返回删除行数。
     */
    deleteWithDescendants(convId: string, ids: readonly string[]): number {
      const toDelete = new Set<string>();
      for (const id of ids) {
        for (const sub of this.subtreeIds(id)) toDelete.add(sub);
      }
      if (toDelete.size === 0) return 0;

      // active_leaf 回退：从激活叶沿 parent 上溯找第一个不在删除集合里的祖先
      const conv = activeLeafStmt.get(convId) as { active_leaf_id: string | null } | undefined;
      const leafHit = !!conv?.active_leaf_id && toDelete.has(conv.active_leaf_id);
      let survivor: string | null = null;
      if (leafHit) {
        let cur = getRow(conv.active_leaf_id as string);
        const seen = new Set<string>();
        while (cur && !seen.has(cur.id)) {
          seen.add(cur.id);
          const parentId: string | null = cur.parent_id;
          if (parentId == null) break;
          if (!toDelete.has(parentId)) {
            survivor = parentId;
            break;
          }
          cur = getRow(parentId);
        }
      }

      const del = db.prepare('DELETE FROM messages WHERE id = ?');
      let count = 0;
      const tx = db.transaction(() => {
        for (const id of toDelete) count += del.run(id).changes;
      });
      tx();

      // 删完再下钻：此时"最新子"查询天然只含存活分支
      if (leafHit) this.setActiveLeaf(convId, survivor === null ? null : deepestDescendantId(convId, survivor));
      return count;
    },

    /**
     * stats 合并语义：patch.stats 中出现的键覆盖对应列，缺省键保持原值
     * （continue 场景的累加值由 chat.ts 算好后整体传入）。
     */
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
