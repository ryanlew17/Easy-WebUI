/**
 * conversations DAO（schema v2）。
 * 会话不再存完整参数：preset_id（null=全局预设）+ overrides_json（只含与预设
 * 基线不等的键）。params patch 的合并/等值修剪在 IPC 层与 mock 层用
 * shared/params.ts 的 applyOverridePatch 完成（需要预设基线，DAO 保持薄）。
 */
import { randomUUID } from 'node:crypto';
import type { DB } from './index';
import type { Conversation } from '../../shared/types';
import type { ParamOverrides } from '../../shared/params';
import { sanitizeOverrides } from '../../shared/params';

interface ConversationRow {
  id: string;
  title: string;
  provider_id: string | null;
  model: string | null;
  preset_id: string | null;
  overrides_json: string;
  pinned: number;
  active_leaf_id: string | null;
  reasoning_enabled: number;
  created_at: number;
  updated_at: number;
}

export function rowToConversation(row: ConversationRow): Conversation {
  let overrides: ParamOverrides = {};
  try {
    overrides = sanitizeOverrides(JSON.parse(row.overrides_json));
  } catch {
    /* 损坏 JSON 用空 overrides */
  }
  return {
    id: row.id,
    title: row.title,
    provider_id: row.provider_id,
    model: row.model,
    preset_id: row.preset_id,
    overrides,
    pinned: row.pinned === 1,
    reasoning_enabled: row.reasoning_enabled !== 0, // 缺省/1 = 开（DB 默认 1）
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function createConversationsDao(db: DB) {
  const getStmt = db.prepare('SELECT * FROM conversations WHERE id = ?');
  const listStmt = db.prepare(
    'SELECT * FROM conversations ORDER BY pinned DESC, updated_at DESC',
  );
  const insertStmt = db.prepare(
    `INSERT INTO conversations (id, title, provider_id, model, preset_id, overrides_json, pinned, created_at, updated_at)
     VALUES (@id, @title, @provider_id, @model, @preset_id, @overrides_json, @pinned, @created_at, @updated_at)`,
  );
  const deleteStmt = db.prepare('DELETE FROM conversations WHERE id = ?');

  return {
    create(): Conversation {
      const now = Date.now();
      const row: ConversationRow = {
        id: randomUUID(),
        title: '',
        provider_id: null,
        model: null,
        preset_id: null,
        overrides_json: '{}',
        pinned: 0,
        active_leaf_id: null,
        reasoning_enabled: 1,
        created_at: now,
        updated_at: now,
      };
      insertStmt.run(row);
      return rowToConversation(row);
    },

    get(id: string): Conversation | null {
      const row = getStmt.get(id) as ConversationRow | undefined;
      return row ? rowToConversation(row) : null;
    },

    list(): Conversation[] {
      return (listStmt.all() as ConversationRow[]).map(rowToConversation);
    },

    /**
     * preset_id / overrides 语义：字段缺省（undefined）= 保持不变；
     * preset_id 传 null = 回落到全局预设；overrides 为全量替换
     * （合并与等值修剪已在调用方完成）。
     */
    update(
      id: string,
      patch: {
        title?: string;
        pinned?: boolean;
        provider_id?: string | null;
        model?: string | null;
        preset_id?: string | null;
        overrides?: ParamOverrides;
        reasoning_enabled?: boolean;
      },
    ): Conversation | null {
      const current = this.get(id);
      if (!current) return null;
      const next: Conversation = {
        ...current,
        title: patch.title ?? current.title,
        pinned: patch.pinned ?? current.pinned,
        provider_id:
          patch.provider_id === undefined ? current.provider_id : patch.provider_id,
        model: patch.model === undefined ? current.model : patch.model,
        preset_id: patch.preset_id === undefined ? current.preset_id : patch.preset_id,
        overrides: patch.overrides ?? current.overrides,
        reasoning_enabled: patch.reasoning_enabled ?? current.reasoning_enabled,
        updated_at: Date.now(),
      };
      db.prepare(
        `UPDATE conversations SET title=@title, pinned=@pinned, provider_id=@provider_id,
         model=@model, preset_id=@preset_id, overrides_json=@overrides_json,
         reasoning_enabled=@reasoning_enabled, updated_at=@updated_at
         WHERE id=@id`,
      ).run({
        id: next.id,
        title: next.title,
        pinned: next.pinned ? 1 : 0,
        provider_id: next.provider_id,
        model: next.model,
        preset_id: next.preset_id,
        overrides_json: JSON.stringify(sanitizeOverrides(next.overrides)),
        reasoning_enabled: next.reasoning_enabled ? 1 : 0,
        updated_at: next.updated_at,
      });
      return next;
    },

    /** 仅刷新 updated_at（新消息落库时调用） */
    touch(id: string): void {
      db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(Date.now(), id);
    },

    delete(id: string): void {
      deleteStmt.run(id); // messages 由 FK ON DELETE CASCADE 清理
    },
  };
}

export type ConversationsDao = ReturnType<typeof createConversationsDao>;
