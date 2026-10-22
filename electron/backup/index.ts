/**
 * 备份 zip 读写与 DB 事务封装（薄层——业务决策全部在 backup/core.ts）。
 * 文件：easyui-backup-YYYYMMDD-HHmm.zip，内含 data.json + manifest.json。
 * 默认输出位置 data/backups/（docs/design/storage.md）。
 */
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import type { DB } from '../db';
import { backfillParentLinks, SCHEMA_VERSION } from '../db';
import type { CryptoService } from '../crypto';
import type { BackupFileInfo, GeneralSettings, ImportResult } from '../../shared/types';
import { FACTORY_DEFAULTS } from '../../shared/params';
import type { ProviderRow } from '../db/providers';
import type { MessageRow } from '../db/messages';
import {
  breakParentCycles,
  buildBackup,
  parseBackup,
  planImport,
  type BackupDataJson,
  type ConversationExportRow,
  type ExportRows,
  type MessageExportRow,
  type PresetExportRow,
  type ProviderExportRow,
} from './core';
import type { BackupManifest } from '../../shared/types';

/** 压缩炸弹防御（@req REQ-2026-001 M4）：zip 单条目声明尺寸上限 */
const MAX_ZIP_ENTRY_BYTES = 256 * 1024 * 1024;

export interface BackupDeps {
  db: DB;
  crypto: CryptoService;
  dataDir: string;
  appVersion: string;
}

function backupsDir(dataDir: string): string {
  const dir = path.join(dataDir, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function timestampName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}`
  );
}

/** 从 DB 读出全量行（cipher 转 utf8 字符串供 core 层处理） */
function collectRows(db: DB, settings: GeneralSettings): ExportRows {
  const providers = (db.prepare('SELECT * FROM providers').all() as ProviderRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    base_url: r.base_url,
    api_format: r.api_format,
    api_key_cipher: r.api_key_cipher ? r.api_key_cipher.toString('utf8') : null,
    models_json: r.models_json,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
  const conversations = db
    .prepare('SELECT * FROM conversations')
    .all() as unknown as ConversationExportRow[];
  const messages = (db.prepare('SELECT * FROM messages').all() as MessageRow[]).map((r) => ({
    ...r,
  })) as MessageExportRow[];
  const presets = db.prepare('SELECT * FROM presets').all() as unknown as PresetExportRow[];
  return { providers, conversations, messages, presets, settings };
}

export function createBackupService(deps: BackupDeps) {
  const { db, crypto } = deps;
  const dir = () => backupsDir(deps.dataDir);

  function writeZip(
    data: BackupDataJson,
    manifest: BackupManifest,
    filename: string,
  ): BackupFileInfo {
    const zip = new AdmZip();
    zip.addFile('data.json', Buffer.from(JSON.stringify(data, null, 2), 'utf8'));
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));
    const full = path.join(dir(), filename);
    zip.writeZip(full);
    const stat = fs.statSync(full);
    return {
      filename,
      path: full,
      size: stat.size,
      created_at: manifest.created_at,
      includes_keys: manifest.includes_keys,
    };
  }

  function readZip(file: string): { data: BackupDataJson; manifest: BackupManifest } {
    const zip = new AdmZip(file);
    const dataEntry = zip.getEntry('data.json');
    const manifestEntry = zip.getEntry('manifest.json');
    if (!dataEntry || !manifestEntry) {
      throw new Error('invalid_backup: missing data.json or manifest.json');
    }
    // M4：声明尺寸超限直接拒（getData 会按声明尺寸分配内存）
    for (const e of [dataEntry, manifestEntry]) {
      if (e.header.size > MAX_ZIP_ENTRY_BYTES) {
        throw new Error('invalid_backup: zip entry too large');
      }
    }
    return {
      data: JSON.parse(dataEntry.getData().toString('utf8')) as BackupDataJson,
      manifest: JSON.parse(manifestEntry.getData().toString('utf8')) as BackupManifest,
    };
  }

  return {
    dir,

    createBackup(input: { includeKeys: boolean; password?: string }): BackupFileInfo {
      const settingsRow = db.prepare("SELECT value FROM settings WHERE key = 'general'").get() as
        | { value: string }
        | undefined;
      let settings: GeneralSettings;
      try {
        settings = settingsRow
          ? (JSON.parse(settingsRow.value) as GeneralSettings)
          : ({} as GeneralSettings);
      } catch {
        settings = {} as GeneralSettings;
      }
      const rows = collectRows(db, settings);
      const { data, manifest } = buildBackup(rows, {
        includeKeys: input.includeKeys,
        password: input.password,
        decryptKey: (cipher) => crypto.decryptString(cipher),
        appVersion: deps.appVersion,
        schemaVersion: SCHEMA_VERSION,
      });
      return writeZip(data, manifest, `easyui-backup-${timestampName()}.zip`);
    },

    restoreBackup(input: {
      path: string;
      password?: string;
      mode: 'merge' | 'overwrite';
    }): ImportResult {
      const { data, manifest } = readZip(input.path);
      const rows = parseBackup(data, manifest, {
        password: input.password,
        encryptKey: (plain) => crypto.encryptString(plain),
        currentSchemaVersion: SCHEMA_VERSION,
      });

      // 覆盖模式：先自动做一份临时备份（不含密钥；docs/contracts/backup-format.md 恢复规则）
      if (input.mode === 'overwrite') {
        this.createBackup({ includeKeys: false });
      }

      const result: ImportResult = { providers: 0, conversations: 0, messages: 0, presets: 0, skipped: 0 };

      const tx = db.transaction(() => {
        if (input.mode === 'overwrite') {
          db.exec(
            'DELETE FROM messages; DELETE FROM conversations; DELETE FROM providers; DELETE FROM presets;',
          );
        }

        const insertProvider = db.prepare(
          `INSERT INTO providers (id, name, base_url, api_format, api_key_cipher, models_json, created_at, updated_at)
           VALUES (@id, @name, @base_url, @api_format, @api_key_cipher, @models_json, @created_at, @updated_at)`,
        );
        const insertConversation = db.prepare(
          `INSERT INTO conversations (id, title, provider_id, model, preset_id, overrides_json, pinned, active_leaf_id, reasoning_enabled, created_at, updated_at)
           VALUES (@id, @title, @provider_id, @model, @preset_id, @overrides_json, @pinned, @active_leaf_id, @reasoning_enabled, @created_at, @updated_at)`,
        );
        const insertMessage = db.prepare(
          `INSERT INTO messages (id, conversation_id, parent_id, role, content, reasoning, token_count, partial, error_json, reasoning_ms, ttft_ms, total_ms, finish_reason, created_at)
           VALUES (@id, @conversation_id, @parent_id, @role, @content, @reasoning, @token_count, @partial, @error_json, @reasoning_ms, @ttft_ms, @total_ms, @finish_reason, @created_at)`,
        );
        const insertPreset = db.prepare(
          `INSERT INTO presets (id, name, is_global, params_json, created_at, updated_at)
           VALUES (@id, @name, @is_global, @params_json, @created_at, @updated_at)`,
        );

        const existingProviders = new Set(
          (db.prepare('SELECT id FROM providers').all() as { id: string }[]).map((r) => r.id),
        );
        const existingConvs = new Set(
          (db.prepare('SELECT id FROM conversations').all() as { id: string }[]).map((r) => r.id),
        );
        const existingMsgs = new Set(
          (db.prepare('SELECT id FROM messages').all() as { id: string }[]).map((r) => r.id),
        );
        const existingPresets = new Set(
          (db.prepare('SELECT id FROM presets').all() as { id: string }[]).map((r) => r.id),
        );

        const p = planImport(existingProviders, rows.providers, input.mode);
        for (const r of p.rows) {
          insertProvider.run({
            ...r,
            api_key_cipher: r.api_key_cipher ? Buffer.from(r.api_key_cipher, 'utf8') : null,
          });
        }
        result.providers = p.rows.length;
        result.skipped += p.skipped;

        const c = planImport(existingConvs, rows.conversations, input.mode);
        for (const r of c.rows) insertConversation.run(r);
        result.conversations = c.rows.length;
        result.skipped += c.skipped;

        const m = planImport(existingMsgs, rows.messages, input.mode);
        // @req REQ-2026-001 I6：导入侧断开 parent_id 环（成环节点降级挂根，不拒绝整个备份）
        for (const r of breakParentCycles(m.rows)) insertMessage.run(r);
        result.messages = m.rows.length;
        result.skipped += m.skipped;

        // 预设：与会话同样的 merge/overwrite 语义；merge 时已存在 id（含 global）跳过，
        // 保留本机当前预设（与设置"merge 保留现有"的取舍一致）
        const pr = planImport(existingPresets, rows.presets, input.mode);
        for (const r of pr.rows) insertPreset.run(r);
        result.presets = pr.rows.length;
        result.skipped += pr.skipped;

        // 全局预设兜底：旧版备份无 presets 或 overwrite 后无 global 行 → 补建工厂默认
        const hasGlobal = db
          .prepare('SELECT 1 AS x FROM presets WHERE is_global = 1 LIMIT 1')
          .get();
        if (!hasGlobal) {
          const now = Date.now();
          insertPreset.run({
            id: 'global',
            name: 'Global',
            is_global: 1,
            params_json: JSON.stringify(FACTORY_DEFAULTS),
            created_at: now,
            updated_at: now,
          });
        }

        // 设置：overwrite 整体替换；merge 保留现有（避免覆盖用户当前偏好）
        if (input.mode === 'overwrite' && rows.settings) {
          db.prepare(
            "INSERT INTO settings (key, value) VALUES ('general', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
          ).run(JSON.stringify(rows.settings));
        }

        // 旧版（schema < 3）备份：消息无 parent_id 链，按 (created_at, rowid) 顺序回填
        // （只补 parent_id 为 NULL 的非首条消息，健康 v3 数据不受影响）
        if (manifest.schema_version < 3 && rows.messages.length > 0) {
          const touched = [...new Set(rows.messages.map((m) => m.conversation_id))];
          backfillParentLinks(db, touched);
        }
      });
      tx();

      return result;
    },

    listBackups(): BackupFileInfo[] {
      const files = fs
        .readdirSync(dir())
        .filter((f) => /^easyui-backup-.*\.zip$/.test(f))
        .sort()
        .reverse();
      return files.map((filename) => {
        const full = path.join(dir(), filename);
        const stat = fs.statSync(full);
        let includesKeys = false;
        let createdAt = stat.mtimeMs;
        try {
          const manifestEntry = new AdmZip(full).getEntry('manifest.json');
          if (manifestEntry) {
            const manifest = JSON.parse(manifestEntry.getData().toString('utf8')) as BackupManifest;
            includesKeys = manifest.includes_keys === true;
            if (typeof manifest.created_at === 'number') createdAt = manifest.created_at;
          }
        } catch {
          /* manifest 损坏时按不含密钥展示 */
        }
        return { filename, path: full, size: stat.size, created_at: createdAt, includes_keys: includesKeys };
      });
    },

    deleteBackup(filename: string): void {
      // 防路径穿越：只取 basename，且必须落在 backups 目录
      const safe = path.basename(filename);
      const full = path.join(dir(), safe);
      if (!full.startsWith(dir())) throw new Error('invalid_backup_path');
      fs.rmSync(full, { force: true });
    },
  };
}

export type BackupService = ReturnType<typeof createBackupService>;
