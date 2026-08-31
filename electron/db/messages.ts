import { randomUUID } from 'node:crypto';
import type { DB } from './index';
import type { Message } from '../../shared/types';

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  reasoning: string | null;
  token_count: number | null;
  partial: number;
  error_json: string | null;
  created_at: number;
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
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    role: row.role,
    content: row.content,
    reasoning: row.reasoning ?? undefined,
    token_count: row.token_count,
    partial: row.partial === 1,
    error,
    created_at: row.created_at,
  };
}

export function createMessagesDao(db: DB) {
  const getStmt = db.prepare('SELECT * FROM messages WHERE id = ?');
  const listStmt = db.prepare(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, rowid ASC',
  );
  const insertStmt = db.prepare(
    `INSERT INTO messages (id, conversation_id, role, content, reasoning, token_count, partial, error_json, created_at)
     VALUES (@id, @conversation_id, @role, @content, @reasoning, @token_count, @partial, @error_json, @created_at)`,
  );

  return {
    insert(input: {
      id?: string;
      conversation_id: string;
      role: Message['role'];
      content: string;
      reasoning?: string;
      token_count?: number | null;
      partial?: boolean;
      error?: { code: string; message: string } | null;
      created_at?: number;
    }): Message {
      const row: MessageRow = {
        id: input.id ?? randomUUID(),
        conversation_id: input.conversation_id,
        role: input.role,
        content: input.content,
        reasoning: input.reasoning ?? null,
        token_count: input.token_count ?? null,
        partial: input.partial ? 1 : 0,
        error_json: input.error ? JSON.stringify(input.error) : null,
        created_at: input.created_at ?? Date.now(),
      };
      insertStmt.run(row);
      return rowToMessage(row);
    },

    get(id: string): Message | null {
      const row = getStmt.get(id) as MessageRow | undefined;
      return row ? rowToMessage(row) : null;
    },

    list(conversationId: string): Message[] {
      return (listStmt.all(conversationId) as MessageRow[]).map(rowToMessage);
    },

    update(
      id: string,
      patch: {
        content?: string;
        reasoning?: string;
        token_count?: number | null;
        partial?: boolean;
        error?: { code: string; message: string } | null;
      },
    ): Message | null {
      const row = getStmt.get(id) as MessageRow | undefined;
      if (!row) return null;
      const next: MessageRow = {
        ...row,
        content: patch.content ?? row.content,
        reasoning: patch.reasoning === undefined ? row.reasoning : patch.reasoning || null,
        token_count: patch.token_count === undefined ? row.token_count : patch.token_count,
        partial: patch.partial === undefined ? row.partial : patch.partial ? 1 : 0,
        error_json:
          patch.error === undefined ? row.error_json : patch.error ? JSON.stringify(patch.error) : null,
      };
      db.prepare(
        `UPDATE messages SET content=@content, reasoning=@reasoning, token_count=@token_count,
         partial=@partial, error_json=@error_json WHERE id=@id`,
      ).run(next);
      return rowToMessage(next);
    },

    /** 删除指定消息之后的所有消息（regenerate/编辑分叉用，不含该消息本身） */
    deleteAfter(conversationId: string, messageId: string): number {
      const anchor = getStmt.get(messageId) as MessageRow | undefined;
      if (!anchor) return 0;
      const r = db
        .prepare('DELETE FROM messages WHERE conversation_id = ? AND created_at > ?')
        .run(conversationId, anchor.created_at);
      return r.changes;
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
