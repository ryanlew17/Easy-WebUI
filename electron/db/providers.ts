/**
 * providers DAO。红线（契约 §2）：任何离开本模块的 Provider 对象都不含
 * api_key_cipher——查询即剥离，渲染进程只见 has_key 布尔。
 * 需要密文的内部调用方（gateway 编排 / 备份导出）显式用 getRow()。
 */
import { randomUUID } from 'node:crypto';
import type { DB } from './index';
import type { ApiFormat, Provider, ProviderModel } from '../../shared/types';

export interface ProviderRow {
  id: string;
  name: string;
  base_url: string;
  api_format: ApiFormat;
  api_key_cipher: Buffer | null;
  models_json: string;
  created_at: number;
  updated_at: number;
}

/** base_url 归一化：去末尾斜杠（契约 §1：存储时去掉末尾 '/'） */
export function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

export function rowToProvider(row: ProviderRow): Provider {
  let models: ProviderModel[] = [];
  try {
    const parsed = JSON.parse(row.models_json) as ProviderModel[];
    if (Array.isArray(parsed)) models = parsed;
  } catch {
    /* 损坏 JSON 视为空列表 */
  }
  return {
    id: row.id,
    name: row.name,
    base_url: row.base_url,
    api_format: row.api_format,
    has_key: row.api_key_cipher != null && row.api_key_cipher.length > 0,
    models,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function createProvidersDao(db: DB) {
  const listStmt = db.prepare('SELECT * FROM providers ORDER BY created_at ASC');
  const getStmt = db.prepare('SELECT * FROM providers WHERE id = ?');
  const insertStmt = db.prepare(
    `INSERT INTO providers (id, name, base_url, api_format, api_key_cipher, models_json, created_at, updated_at)
     VALUES (@id, @name, @base_url, @api_format, @api_key_cipher, @models_json, @created_at, @updated_at)`,
  );
  const deleteStmt = db.prepare('DELETE FROM providers WHERE id = ?');
  const countConvsStmt = db.prepare(
    'SELECT COUNT(*) AS n FROM conversations WHERE provider_id = ?',
  );

  return {
    list(): Provider[] {
      return (listStmt.all() as ProviderRow[]).map(rowToProvider);
    },

    /** 内部用：含密文的原始行（编排层解密密钥、备份导出用） */
    getRow(id: string): ProviderRow | null {
      return (getStmt.get(id) as ProviderRow | undefined) ?? null;
    },

    get(id: string): Provider | null {
      const row = this.getRow(id);
      return row ? rowToProvider(row) : null;
    },

    insert(input: {
      name: string;
      base_url: string;
      api_format: ApiFormat;
      api_key_cipher: Buffer | null;
      models?: ProviderModel[];
    }): Provider {
      const now = Date.now();
      const row: ProviderRow = {
        id: randomUUID(),
        name: input.name,
        base_url: normalizeBaseUrl(input.base_url),
        api_format: input.api_format,
        api_key_cipher: input.api_key_cipher,
        models_json: JSON.stringify(input.models ?? []),
        created_at: now,
        updated_at: now,
      };
      insertStmt.run(row);
      return rowToProvider(row);
    },

    update(
      id: string,
      patch: {
        name?: string;
        base_url?: string;
        api_format?: ApiFormat;
        /** undefined=保持不变；null=清除密钥；Buffer=新密文 */
        api_key_cipher?: Buffer | null;
        models?: ProviderModel[];
      },
    ): Provider | null {
      const row = this.getRow(id);
      if (!row) return null;
      const next: ProviderRow = {
        ...row,
        name: patch.name ?? row.name,
        base_url: patch.base_url != null ? normalizeBaseUrl(patch.base_url) : row.base_url,
        api_format: patch.api_format ?? row.api_format,
        api_key_cipher:
          patch.api_key_cipher === undefined ? row.api_key_cipher : patch.api_key_cipher,
        models_json: patch.models ? JSON.stringify(patch.models) : row.models_json,
        updated_at: Date.now(),
      };
      db.prepare(
        `UPDATE providers SET name=@name, base_url=@base_url, api_format=@api_format,
         api_key_cipher=@api_key_cipher, models_json=@models_json, updated_at=@updated_at
         WHERE id=@id`,
      ).run(next);
      return rowToProvider(next);
    },

    /** 更新某个模型的 last_check（连接检测结果持久化，kimi.md §3.2） */
    updateModelCheck(id: string, modelId: string, check: ProviderModel['last_check']): void {
      const row = this.getRow(id);
      if (!row) return;
      const provider = rowToProvider(row);
      const models = provider.models.map((m) =>
        m.id === modelId ? { ...m, last_check: check } : m,
      );
      this.update(id, { models });
    },

    delete(id: string): { affectedConversations: number } {
      const { n } = countConvsStmt.get(id) as { n: number };
      deleteStmt.run(id); // FK ON DELETE SET NULL 置空会话的 provider_id
      return { affectedConversations: n };
    },
  };
}

export type ProvidersDao = ReturnType<typeof createProvidersDao>;
