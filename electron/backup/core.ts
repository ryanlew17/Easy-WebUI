/**
 * 备份数据编排（纯函数层，docs/contracts/backup-format.md）——不依赖 better-sqlite3 / adm-zip / electron。
 *
 * 刻意拆出本模块的原因：better-sqlite3 是原生模块，部分环境（如缺编译工具的
 * Windows CI）无法构建；把"导出数据整形、密钥加解密、merge/overwrite 计划"
 * 全部做成纯函数，单元测试无需 sqlite 即可覆盖两种 roundtrip 与恢复语义。
 * zip 读写与 DB 事务在 electron/backup/index.ts 中只做薄封装。
 *
 * 关键安全决策（docs/contracts/backup-format.md，密钥处理）：
 * - 导出文件中 providers.api_key_cipher **永远置 null**——safeStorage 密文绑定
 *   本机，导出无意义；含密钥备份把"解密后的明文列表"用备份密码
 *   scrypt(N=2^15, r=8, p=1) → AES-256-GCM 加密后放入 keys_cipher，
 *   salt 存 manifest.kdf.salt_b64，nonce/tag 随密文 blob（见 crypto/lowlevel）。
 * - 恢复时把明文用本机 CryptoService 重新加密（encryptKey 注入）再落库。
 */
import path from 'node:path';
import type { BackupManifest, GeneralSettings } from '../../shared/types';
import { migrateLegacyParamsJson } from '../../shared/params';
import { MAX_BACKUP_PASSWORD_CHARS } from '../../shared/ipc';
import { aesGcmDecrypt, aesGcmEncrypt, BACKUP_KDF, randomSalt, scryptDerive } from '../crypto/lowlevel';

/* ---------- 导出/导入的行形状（与 DB 列一一对应，cipher 用 utf8 字符串） ---------- */

export interface ProviderExportRow {
  id: string;
  name: string;
  base_url: string;
  api_format: string;
  api_key_cipher: string | null;
  models_json: string;
  created_at: number;
  updated_at: number;
}

/** schema v3 会话行；旧版（v1 params_json / v2 无 active_leaf_id 等）备份在 parseBackup 中迁移为本形状 */
export interface ConversationExportRow {
  id: string;
  title: string;
  provider_id: string | null;
  model: string | null;
  preset_id: string | null;
  overrides_json: string;
  pinned: number;
  /** schema v3 起存在；旧备份缺省 → null（激活叶回退最新一条消息） */
  active_leaf_id: string | null;
  /** schema v3 起存在；旧备份缺省 → 1（思考开） */
  reasoning_enabled: number;
  created_at: number;
  updated_at: number;
}

/** schema v1 旧会话行（仅识别迁移用） */
interface LegacyConversationExportRow {
  id: string;
  title: string;
  provider_id: string | null;
  model: string | null;
  params_json: string;
  pinned: number;
  created_at: number;
  updated_at: number;
}

export interface PresetExportRow {
  id: string;
  name: string;
  is_global: number;
  params_json: string;
  created_at: number;
  updated_at: number;
}

/** schema v3 消息行；旧版备份缺少 parent_id / 统计列，parseBackup 中补默认值 */
export interface MessageExportRow {
  id: string;
  conversation_id: string;
  parent_id: string | null;
  role: string;
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

export interface ExportRows {
  providers: ProviderExportRow[];
  conversations: ConversationExportRow[];
  messages: MessageExportRow[];
  presets: PresetExportRow[];
  settings: GeneralSettings;
}

export interface BackupDataJson {
  providers: ProviderExportRow[];
  conversations: Array<ConversationExportRow | LegacyConversationExportRow>;
  messages: MessageExportRow[];
  /** v2 起存在；旧版备份无此字段，恢复时跳过并在全局预设缺失时补建 */
  presets?: PresetExportRow[];
  settings: GeneralSettings;
  keys_cipher?: { cipher_b64: string } | null;
}

/** 旧版（v1/v2）会话行 → v3：params_json 走 shared/params.ts 迁移；v3 新列缺省补默认 */
function normalizeConversationRow(
  raw: ConversationExportRow | LegacyConversationExportRow,
): ConversationExportRow {
  if (typeof (raw as ConversationExportRow).overrides_json === 'string') {
    const r = raw as ConversationExportRow;
    return {
      ...r,
      preset_id: r.preset_id ?? null,
      active_leaf_id: r.active_leaf_id ?? null,
      reasoning_enabled: r.reasoning_enabled ?? 1,
    };
  }
  const legacy = raw as LegacyConversationExportRow;
  const m = migrateLegacyParamsJson(
    typeof legacy.params_json === 'string' ? legacy.params_json : '{}',
    legacy.provider_id ?? null,
    legacy.model ?? null,
  );
  return {
    id: legacy.id,
    title: legacy.title ?? '',
    provider_id: m.provider_id,
    model: m.model,
    preset_id: null,
    overrides_json: JSON.stringify(m.overrides),
    pinned: legacy.pinned ?? 0,
    active_leaf_id: null,
    reasoning_enabled: 1,
    created_at: legacy.created_at ?? 0,
    updated_at: legacy.updated_at ?? 0,
  };
}

/** 旧版（v1/v2）消息行 → v3：parent_id / 统计列缺省补 NULL（parent 链由恢复方回填） */
function normalizeMessageRow(raw: Partial<MessageExportRow> & { id: string; conversation_id: string }): MessageExportRow {
  return {
    id: raw.id,
    conversation_id: raw.conversation_id,
    parent_id: raw.parent_id ?? null,
    role: raw.role ?? 'user',
    content: raw.content ?? '',
    reasoning: raw.reasoning ?? null,
    token_count: raw.token_count ?? null,
    partial: raw.partial ?? 0,
    error_json: raw.error_json ?? null,
    reasoning_ms: raw.reasoning_ms ?? null,
    ttft_ms: raw.ttft_ms ?? null,
    total_ms: raw.total_ms ?? null,
    finish_reason: raw.finish_reason ?? null,
    created_at: raw.created_at ?? 0,
  };
}

export class BackupError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'BackupError';
    this.code = code;
  }
}

/* ---------- 文件名 / 路径防御（@req REQ-2026-001） ---------- */

/** 备份文件名模式（listBackups 过滤与 deleteBackup 校验共用） */
export const BACKUP_NAME_RE = /^easyui-backup-.*\.zip$/;

/**
 * deleteBackup 入参整形：取 basename（防穿越）且必须匹配备份文件名模式，
 * 非法返回 null——否则被入侵的渲染进程可借 IPC 删除 backups 目录内任意文件。
 */
export function sanitizeBackupFilename(filename: string): string | null {
  const base = path.basename(filename);
  return BACKUP_NAME_RE.test(base) ? base : null;
}

/** 路径归一（win32 大小写不敏感），恢复路径白名单判定与登记共用 */
export function normalizeFsPath(p: string): string {
  const r = path.resolve(p);
  return process.platform === 'win32' ? r.toLowerCase() : r;
}

/**
 * 恢复路径放行判定：仅接受 backups 目录内的文件，或本会话 pickBackupFile
 * 对话框返回过的路径——渲染进程不得让主进程解析磁盘上任意 zip。
 */
export function isAllowedRestorePath(
  target: string,
  backupsDir: string,
  pickedPaths: ReadonlySet<string>,
): boolean {
  const t = normalizeFsPath(target);
  if (t.startsWith(normalizeFsPath(backupsDir) + path.sep)) return true;
  for (const p of pickedPaths) {
    if (normalizeFsPath(p) === t) return true;
  }
  return false;
}

/* ---------- 导出 ---------- */

export function buildBackup(
  rows: ExportRows,
  opts: {
    includeKeys: boolean;
    password?: string;
    /** 注入：本机密文 → 明文（生产为 CryptoService.decryptString） */
    decryptKey: (cipher: string) => string;
    appVersion: string;
    schemaVersion: number;
    now?: number;
  },
): { data: BackupDataJson; manifest: BackupManifest } {
  const now = opts.now ?? Date.now();

  // providers 中的机器密文一律置 null（绝不允许导出 safeStorage 密文，docs/contracts/backup-format.md）
  const providers: ProviderExportRow[] = rows.providers.map((p) => ({
    ...p,
    api_key_cipher: null,
  }));

  const manifest: BackupManifest = {
    app_version: opts.appVersion,
    schema_version: opts.schemaVersion,
    includes_keys: opts.includeKeys,
    created_at: now,
  };

  const data: BackupDataJson = {
    providers,
    conversations: rows.conversations,
    messages: rows.messages,
    presets: rows.presets, // 预设无密钥，两种模式都含
    settings: rows.settings,
    keys_cipher: null,
  };

  if (opts.includeKeys) {
    const password = opts.password ?? '';
    if (password.length < 8) {
      throw new BackupError('backup_password_too_short', 'backup password must be >= 8 chars');
    }
    // @req REQ-2026-001：上限 32（schema 之外的纯函数层兜底，防超长串进 scrypt 派生）
    if (password.length > MAX_BACKUP_PASSWORD_CHARS) {
      throw new BackupError(
        'backup_password_too_long',
        `backup password must be <= ${MAX_BACKUP_PASSWORD_CHARS} chars`,
      );
    }
    const entries = rows.providers
      .filter((p) => p.api_key_cipher)
      .map((p) => ({ provider_id: p.id, api_key: opts.decryptKey(p.api_key_cipher as string) }));
    const salt = randomSalt(16);
    const key = scryptDerive(password, salt, 32, BACKUP_KDF);
    const blob = aesGcmEncrypt(key, JSON.stringify(entries));
    data.keys_cipher = { cipher_b64: blob.toString('base64') };
    manifest.kdf = { algo: 'scrypt', N: BACKUP_KDF.N, r: BACKUP_KDF.r, p: BACKUP_KDF.p, salt_b64: salt.toString('base64') };
  }

  return { data, manifest };
}

/* ---------- 恢复 ---------- */

export function parseBackup(
  data: BackupDataJson,
  manifest: BackupManifest,
  opts: {
    password?: string;
    /** 注入：明文 → 本机密文（生产为 CryptoService.encryptString） */
    encryptKey: (plain: string) => string;
    currentSchemaVersion: number;
  },
): ExportRows {
  if (typeof manifest.schema_version !== 'number' || manifest.schema_version > opts.currentSchemaVersion) {
    throw new BackupError(
      'backup_schema_too_new',
      `backup schema_version ${manifest.schema_version} > current ${opts.currentSchemaVersion}`,
    );
  }

  let plainKeys = new Map<string, string>();
  if (manifest.includes_keys) {
    if (!opts.password) {
      throw new BackupError('backup_password_required', 'backup includes keys, password required');
    }
    if (!manifest.kdf || !data.keys_cipher?.cipher_b64) {
      throw new BackupError('backup_keys_missing', 'manifest includes_keys but no keys payload');
    }
    // @req REQ-2026-001 I5：KDF 参数来自不可信 manifest——大 N/r/p 一次推导即占
    // 上百 MB 内存与大量 CPU（DoS），必须与导出侧恒等；salt 长度同样钳制
    const { algo, N, r, p, salt_b64 } = manifest.kdf;
    if (
      algo !== 'scrypt' ||
      N !== BACKUP_KDF.N ||
      r !== BACKUP_KDF.r ||
      p !== BACKUP_KDF.p ||
      typeof salt_b64 !== 'string'
    ) {
      throw new BackupError('invalid_backup', 'kdf parameters mismatch');
    }
    const salt = Buffer.from(salt_b64, 'base64');
    if (salt.length < 16 || salt.length > 64) {
      throw new BackupError('invalid_backup', 'invalid kdf salt');
    }
    const key = scryptDerive(opts.password, salt, 32, { N, r, p });
    let entries: Array<{ provider_id: string; api_key: string }>;
    try {
      const plain = aesGcmDecrypt(key, Buffer.from(data.keys_cipher.cipher_b64, 'base64'));
      entries = JSON.parse(plain.toString('utf8')) as Array<{ provider_id: string; api_key: string }>;
    } catch {
      // GCM 认证失败 ≈ 密码错误或文件损坏，统一报密码错误（不泄露细节）
      throw new BackupError('backup_wrong_password', 'cannot decrypt keys: wrong password or corrupted file');
    }
    plainKeys = new Map(entries.map((e) => [e.provider_id, e.api_key]));
  }

  const providers: ProviderExportRow[] = (data.providers ?? []).map((p) => {
    const plain = plainKeys.get(p.id);
    return {
      ...p,
      api_key_cipher: plain ? opts.encryptKey(plain) : null, // 用本机加密服务重新加密
    };
  });

  return {
    providers,
    conversations: (data.conversations ?? []).map(normalizeConversationRow),
    messages: (data.messages ?? []).map(normalizeMessageRow),
    presets: data.presets ?? [], // 旧版备份无 presets：跳过（全局预设缺失由恢复方补建）
    settings: data.settings,
  };
}

/* ---------- merge / overwrite 计划 ---------- */

export function planImport<T extends { id: string }>(
  existingIds: ReadonlySet<string>,
  incoming: readonly T[],
  mode: 'merge' | 'overwrite',
): { rows: T[]; skipped: number } {
  if (mode === 'overwrite') {
    // 覆盖：调用方先清空对应表（本函数不触碰存储），全量插入
    return { rows: [...incoming], skipped: 0 };
  }
  const rows = incoming.filter((r) => !existingIds.has(r.id));
  return { rows, skipped: incoming.length - rows.length };
}

/* ---------- 消息树防御（@req REQ-2026-001 I6） ---------- */

/**
 * 断开 parent_id 环：恶意备份可在同会话内构造 A.parent=B、B.parent=A 一类环，
 * 导入后虽不会立即出错，但删除/遍历子树时有死循环风险（db/messages 的遍历
 * 已带 seen 守卫，这里在导入侧再断一层——纵深）。成环节点降级为挂根
 * （parent_id=null），不拒绝整个备份。仅检查本批导入行之间的环：
 * 既有库内消息是树（无环），且导入只插不改，跨新旧不可能成环。
 */
export function breakParentCycles<T extends { id: string; conversation_id: string; parent_id: string | null }>(
  rows: T[],
): T[] {
  const parentOf = new Map(rows.map((r) => [r.id, r.parent_id]));
  for (const r of rows) {
    if (r.parent_id === null) continue;
    const seen = new Set<string>([r.id]);
    let cur: string | null = r.parent_id;
    while (cur !== null && parentOf.has(cur)) {
      if (seen.has(cur)) {
        r.parent_id = null; // 断边降级挂根
        break;
      }
      seen.add(cur);
      cur = parentOf.get(cur) ?? null;
    }
  }
  return rows;
}
