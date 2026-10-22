/**
 * 备份导入/导出测试。
 *
 * 说明（任务约定）：better-sqlite3 为原生模块，部分环境（如缺少编译工具的
 * Windows 机器 / CI）无法构建，因此备份的"数据编排逻辑"（导出整形、密钥
 * 密码学、merge/overwrite 计划、schema_version 校验）已抽成不依赖 sqlite
 * 的纯函数（electron/backup/core.ts），本文件直接测纯函数层；
 * zip/事务薄壳（electron/backup/index.ts）不含业务决策，由集成阶段人工验收。
 */
import { describe, expect, it } from 'vitest';
import {
  breakParentCycles,
  buildBackup,
  isAllowedRestorePath,
  normalizeFsPath,
  parseBackup,
  planImport,
  sanitizeBackupFilename,
  type BackupDataJson,
  type ExportRows,
} from '../electron/backup/core';
import { MAX_BACKUP_PASSWORD_CHARS } from '@shared/ipc';
import { DEFAULT_SETTINGS } from '@shared/types';

/* ---------- 固定数据 ---------- */

const rows: ExportRows = {
  providers: [
    {
      id: 'p1',
      name: 'OpenAI',
      base_url: 'https://api.openai.com',
      api_format: 'openai-chat',
      api_key_cipher: 'cipher-of-key-A', // 模拟本机密文
      models_json: '[]',
      created_at: 1,
      updated_at: 2,
    },
    {
      id: 'p2',
      name: 'NoKey',
      base_url: 'https://example.com',
      api_format: 'anthropic',
      api_key_cipher: null,
      models_json: '[]',
      created_at: 3,
      updated_at: 4,
    },
  ],
  conversations: [
    {
      id: 'c1',
      title: 't',
      provider_id: 'p1',
      model: 'gpt-4o',
      preset_id: 'preset-creative',
      overrides_json: '{"temperature":0.4}',
      pinned: 0,
      active_leaf_id: 'm2',
      reasoning_enabled: 0,
      created_at: 1,
      updated_at: 2,
    },
  ],
  presets: [
    {
      id: 'global',
      name: '全局预设',
      is_global: 1,
      params_json: '{}',
      created_at: 1,
      updated_at: 1,
    },
    {
      id: 'preset-creative',
      name: '创意写作',
      is_global: 0,
      params_json: '{"temperature":1.2}',
      created_at: 2,
      updated_at: 2,
    },
  ],
  messages: [
    {
      id: 'm1',
      conversation_id: 'c1',
      parent_id: null,
      role: 'user',
      content: 'hi',
      reasoning: null,
      token_count: 1,
      partial: 0,
      error_json: null,
      reasoning_ms: null,
      ttft_ms: null,
      total_ms: null,
      finish_reason: null,
      created_at: 1,
    },
    {
      id: 'm2',
      conversation_id: 'c1',
      parent_id: 'm1',
      role: 'assistant',
      content: 'hello',
      reasoning: 'think',
      token_count: 2,
      partial: 0,
      error_json: null,
      reasoning_ms: 50,
      ttft_ms: 120,
      total_ms: 800,
      finish_reason: 'stop',
      created_at: 2,
    },
  ],
  settings: { ...DEFAULT_SETTINGS, theme: 'dark' },
};

// 假加解密：模拟 CryptoService（cipher-of-X ↔ plain-X）
const decryptKey = (cipher: string): string => cipher.replace('cipher-of-', 'plain-');
const encryptKey = (plain: string): string => `cipher-of-${plain.replace('plain-', '')}`;

const SCHEMA = 1;

/** 捕获抛出的 BackupError.code；未抛错则返回 null 让断言失败 */
function backupErrorCode(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    return typeof (e as { code?: unknown })?.code === 'string'
      ? (e as { code: string }).code
      : null;
  }
}

/* ---------- 不含密钥（默认） ---------- */

describe('备份导出（不含密钥）', () => {
  it('api_key_cipher 一律置 null，manifest 无 kdf', () => {
    const { data, manifest } = buildBackup(rows, {
      includeKeys: false,
      decryptKey,
      appVersion: '0.1.0',
      schemaVersion: SCHEMA,
    });
    expect(manifest.includes_keys).toBe(false);
    expect(manifest.kdf).toBeUndefined();
    expect(data.keys_cipher).toBeNull();
    for (const p of data.providers) expect(p.api_key_cipher).toBeNull();
    // 其它数据全量保留
    expect(data.conversations).toHaveLength(1);
    expect(data.messages).toHaveLength(2);
    expect(data.presets).toHaveLength(2); // 预设无密钥，两种模式都含
    expect(data.settings.theme).toBe('dark');
  });

  it('roundtrip：恢复后平台仅缺密钥，其余配置可用', () => {
    const { data, manifest } = buildBackup(rows, {
      includeKeys: false,
      decryptKey,
      appVersion: '0.1.0',
      schemaVersion: SCHEMA,
    });
    const restored = parseBackup(data, manifest, {
      encryptKey,
      currentSchemaVersion: SCHEMA,
    });
    expect(restored.providers[0].api_key_cipher).toBeNull();
    expect(restored.providers[0].base_url).toBe('https://api.openai.com');
    expect(restored.messages).toHaveLength(2);
    // v2 形状原样往返：preset_id / overrides_json / presets
    expect(restored.conversations[0].preset_id).toBe('preset-creative');
    expect(restored.conversations[0].overrides_json).toBe('{"temperature":0.4}');
    expect(restored.presets).toHaveLength(2);
    expect(restored.presets[0].is_global).toBe(1);
    // v3 形状原样往返：active_leaf_id / reasoning_enabled / parent_id / 统计列
    expect(restored.conversations[0].active_leaf_id).toBe('m2');
    expect(restored.conversations[0].reasoning_enabled).toBe(0);
    expect(restored.messages[1].parent_id).toBe('m1');
    expect(restored.messages[1].reasoning_ms).toBe(50);
    expect(restored.messages[1].ttft_ms).toBe(120);
    expect(restored.messages[1].total_ms).toBe(800);
    expect(restored.messages[1].finish_reason).toBe('stop');
  });

  it('旧版（v2）备份：缺 v3 新列 → 补默认值（parent/统计 NULL，reasoning_enabled=1）', () => {
    // 手工构造 v2 备份数据：会话/消息均无 v3 新增列
    const v2Data = {
      providers: [],
      conversations: [
        {
          id: 'c2',
          title: 'v2',
          provider_id: null,
          model: null,
          preset_id: null,
          overrides_json: '{}',
          pinned: 0,
          created_at: 5,
          updated_at: 6,
        },
      ],
      messages: [
        { id: 'mm1', conversation_id: 'c2', role: 'user', content: 'a', reasoning: null, token_count: null, partial: 0, error_json: null, created_at: 5 },
        { id: 'mm2', conversation_id: 'c2', role: 'assistant', content: 'b', reasoning: null, token_count: null, partial: 0, error_json: null, created_at: 6 },
      ],
      presets: [],
      settings: { ...DEFAULT_SETTINGS },
      keys_cipher: null,
    };
    const restored = parseBackup(v2Data as unknown as BackupDataJson /* 故意缺 v3 新列，模拟旧备份 */, { app_version: '1.0.0', schema_version: 2, includes_keys: false, created_at: 1 }, {
      encryptKey,
      currentSchemaVersion: 3,
    });
    const c = restored.conversations[0];
    expect(c.active_leaf_id).toBeNull();
    expect(c.reasoning_enabled).toBe(1);
    for (const m of restored.messages) {
      expect(m.parent_id).toBeNull();
      expect(m.reasoning_ms).toBeNull();
      expect(m.ttft_ms).toBeNull();
      expect(m.total_ms).toBeNull();
      expect(m.finish_reason).toBeNull();
    }
    // 注：parent_id 链的实际回填在恢复方（electron/backup/index.ts，
    // manifest.schema_version<3 时调 backfillParentLinks）完成，见 db-messages.test.ts 的迁移用例
  });

  it('旧版（v1）备份：params_json 会话行被迁移，presets 缺省为空数组', () => {
    // 手工构造 v1 备份数据（conversations 用旧 params_json 形状、无 presets 字段）
    const legacyData = {
      providers: [],
      conversations: [
        {
          id: 'c9',
          title: 'legacy',
          provider_id: 'p1',
          model: 'gpt-4o',
          params_json: '{"max_tokens":8192,"top_p":0.5,"temperature":0.4,"top_k":40,"repeat_penalty":1.2}',
          pinned: 1,
          created_at: 9,
          updated_at: 10,
        },
      ],
      messages: [],
      settings: { ...DEFAULT_SETTINGS },
      keys_cipher: null,
    };
    const restored = parseBackup(legacyData, { app_version: '0.0.9', schema_version: 1, includes_keys: false, created_at: 1 }, {
      encryptKey,
      currentSchemaVersion: SCHEMA,
    });
    expect(restored.presets).toEqual([]); // 旧版备份无 presets（全局预设由恢复方补建）
    const c = restored.conversations[0];
    expect(c.id).toBe('c9');
    expect(c.preset_id).toBeNull(); // 旧会话回落到全局预设
    expect(c.provider_id).toBe('p1');
    expect(c.model).toBe('gpt-4o');
    const overrides = JSON.parse(c.overrides_json) as Record<string, unknown>;
    expect(overrides.temperature).toBe(0.4); // 钉旧值
    expect(overrides.top_k).toBe(40);
    expect(overrides.limit_response_length).toBe(true); // 8192 ≠ 旧默认 4096
    expect(overrides.max_tokens).toBe(8192);
    expect(overrides.top_p_enabled).toBe(true);
    expect(overrides.top_p).toBe(0.5);
    expect(overrides.repeat_penalty_enabled).toBe(true);
    expect(overrides.repeat_penalty).toBe(1.2);
  });
});

/* ---------- 含密钥（密码加密） ---------- */

describe('备份导出（含密钥，密码加密）', () => {
  const password = 'backup-password-123';

  it('密钥明文经 scrypt+AES-GCM 入包，机器密文绝不导出', () => {
    const { data, manifest } = buildBackup(rows, {
      includeKeys: true,
      password,
      decryptKey,
      appVersion: '0.1.0',
      schemaVersion: SCHEMA,
    });
    expect(manifest.includes_keys).toBe(true);
    expect(manifest.kdf?.algo).toBe('scrypt');
    expect(manifest.kdf?.N).toBe(2 ** 15);
    expect(manifest.kdf?.r).toBe(8);
    expect(manifest.kdf?.p).toBe(1);
    expect(typeof manifest.kdf?.salt_b64).toBe('string');
    expect(typeof data.keys_cipher?.cipher_b64).toBe('string');
    // providers 里仍是 null（safeStorage 密文绑定本机，不入包）
    for (const p of data.providers) expect(p.api_key_cipher).toBeNull();
    // 序列化后的整包不含任何明文密钥
    const whole = JSON.stringify(data) + JSON.stringify(manifest);
    expect(whole).not.toContain('plain-key-A');
    expect(whole).not.toContain('cipher-of-key-A');
  });

  it('roundtrip：正确密码恢复并用本机加密服务重新加密', () => {
    const { data, manifest } = buildBackup(rows, {
      includeKeys: true,
      password,
      decryptKey,
      appVersion: '0.1.0',
      schemaVersion: SCHEMA,
    });
    const restored = parseBackup(data, manifest, {
      password,
      encryptKey,
      currentSchemaVersion: SCHEMA,
    });
    // plain-key-A 经假 encryptKey → cipher-of-key-A（与导出前一致，证明 roundtrip）
    expect(restored.providers[0].api_key_cipher).toBe('cipher-of-key-A');
    expect(restored.providers[1].api_key_cipher).toBeNull(); // 原本无密钥
  });

  it('错误密码 → backup_wrong_password', () => {
    const { data, manifest } = buildBackup(rows, {
      includeKeys: true,
      password,
      decryptKey,
      appVersion: '0.1.0',
      schemaVersion: SCHEMA,
    });
    expect(backupErrorCode(() =>
      parseBackup(data, manifest, {
        password: 'wrong-password',
        encryptKey,
        currentSchemaVersion: SCHEMA,
      }),
    )).toBe('backup_wrong_password');
  });

  it('缺密码 → backup_password_required', () => {
    const { data, manifest } = buildBackup(rows, {
      includeKeys: true,
      password,
      decryptKey,
      appVersion: '0.1.0',
      schemaVersion: SCHEMA,
    });
    expect(backupErrorCode(() =>
      parseBackup(data, manifest, { encryptKey, currentSchemaVersion: SCHEMA }),
    )).toBe('backup_password_required');
  });

  it('密码过短（<8）→ backup_password_too_short', () => {
    expect(backupErrorCode(() =>
      buildBackup(rows, {
        includeKeys: true,
        password: 'short',
        decryptKey,
        appVersion: '0.1.0',
        schemaVersion: SCHEMA,
      }),
    )).toBe('backup_password_too_short');
  });

  it('schema_version 高于当前 → 拒绝恢复', () => {
    const { data, manifest } = buildBackup(rows, {
      includeKeys: false,
      decryptKey,
      appVersion: '0.1.0',
      schemaVersion: 999,
    });
    expect(backupErrorCode(() =>
      parseBackup(data, manifest, { encryptKey, currentSchemaVersion: SCHEMA }),
    )).toBe('backup_schema_too_new');
  });
});

/* ---------- merge / overwrite ---------- */

describe('planImport（merge/overwrite 语义）', () => {
  const incoming = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const existing = new Set(['b']);

  it('merge：已存在的 id 跳过', () => {
    const plan = planImport(existing, incoming, 'merge');
    expect(plan.rows.map((r) => r.id)).toEqual(['a', 'c']);
    expect(plan.skipped).toBe(1);
  });

  it('overwrite：全量插入（清表由调用方负责）', () => {
    const plan = planImport(existing, incoming, 'overwrite');
    expect(plan.rows).toHaveLength(3);
    expect(plan.skipped).toBe(0);
  });

  it('merge：全部已存在 → 全跳过', () => {
    const plan = planImport(new Set(['a', 'b', 'c']), incoming, 'merge');
    expect(plan.rows).toHaveLength(0);
    expect(plan.skipped).toBe(3);
  });
});

/* ---------- @req REQ-2026-001 I5/I6：KDF 参数校验 + parent 环断边 ---------- */

describe('恢复路径 KDF 参数校验（I5：参数来自不可信 manifest）', () => {
  const password = 'backup-password-123';
  const buildWithKeys = () =>
    buildBackup(rows, {
      includeKeys: true,
      password,
      decryptKey,
      appVersion: '0.1.0',
      schemaVersion: SCHEMA,
    });

  it('篡改 kdf.N（2^17，一次推导上百 MB）→ invalid_backup', () => {
    const { data, manifest } = buildWithKeys();
    manifest.kdf = { ...manifest.kdf!, N: 2 ** 17 };
    expect(
      backupErrorCode(() =>
        parseBackup(data, manifest, { password, encryptKey, currentSchemaVersion: SCHEMA }),
      ),
    ).toBe('invalid_backup');
  });

  it('kdf.algo 非 scrypt → invalid_backup', () => {
    const { data, manifest } = buildWithKeys();
    (manifest.kdf as { algo: string }).algo = 'pbkdf2';
    expect(
      backupErrorCode(() =>
        parseBackup(data, manifest, { password, encryptKey, currentSchemaVersion: SCHEMA }),
      ),
    ).toBe('invalid_backup');
  });

  it('salt 超长（>64B）→ invalid_backup', () => {
    const { data, manifest } = buildWithKeys();
    manifest.kdf = { ...manifest.kdf!, salt_b64: Buffer.from('s'.repeat(100)).toString('base64') };
    expect(
      backupErrorCode(() =>
        parseBackup(data, manifest, { password, encryptKey, currentSchemaVersion: SCHEMA }),
      ),
    ).toBe('invalid_backup');
  });
});

describe('breakParentCycles（I6：恶意备份 parent_id 环断边）', () => {
  const msg = (id: string, parent_id: string | null) => ({
    id,
    conversation_id: 'c1',
    parent_id,
  });

  it('A↔B 环 → 断边挂根，行数不变且任意节点可有限步到根', () => {
    const ms = [msg('a', null), msg('b', 'c'), msg('c', 'b')]; // b↔c 成环
    const out = breakParentCycles(ms);
    expect(out).toHaveLength(3);
    const parentOf = new Map(out.map((r) => [r.id, r.parent_id]));
    for (const m of out) {
      const seen = new Set<string>();
      let cur: string | null = m.id;
      while (cur !== null) {
        expect(seen.has(cur)).toBe(false); // 不得成环
        seen.add(cur);
        cur = parentOf.get(cur) ?? null;
      }
    }
  });

  it('自环（A.parent=A）→ 断边挂根', () => {
    const out = breakParentCycles([msg('a', 'a')]);
    expect(out[0].parent_id).toBeNull();
  });

  it('正常树不受影响', () => {
    const out = breakParentCycles([msg('a', null), msg('b', 'a'), msg('c', 'b')]);
    expect(out.map((r) => r.parent_id)).toEqual([null, 'a', 'b']);
  });
});

/* ---------- @req REQ-2026-001：文件名/路径防御 + 密码上限 ---------- */

describe('sanitizeBackupFilename（F1：删除入参模式校验）', () => {
  it('合法备份文件名原样通过（basename 提取）', () => {
    expect(sanitizeBackupFilename('easyui-backup-20260101-1200.zip')).toBe(
      'easyui-backup-20260101-1200.zip',
    );
  });

  it('路径穿越被 basename 化解，剩余 basename 仍须匹配模式', () => {
    // ..\..\evil.zip → basename=evil.zip，不匹配备份模式 → 拒绝
    expect(sanitizeBackupFilename('..\\..\\evil.zip')).toBeNull();
    expect(sanitizeBackupFilename('../../easyui-backup-x.zip')).toBe('easyui-backup-x.zip');
  });

  it('非备份模式文件名（可执行/库文件等）→ 拒绝', () => {
    expect(sanitizeBackupFilename('easyui.db')).toBeNull();
    expect(sanitizeBackupFilename('keyring.bin')).toBeNull();
    expect(sanitizeBackupFilename('evil.zip')).toBeNull();
  });
});

describe('isAllowedRestorePath（F3：恢复路径白名单）', () => {
  const dir = normalizeFsPath(process.cwd() + '/data/backups');
  const picked = new Set([normalizeFsPath(process.cwd() + '/downloads/chosen.zip')]);

  it('backups 目录内文件 → 放行（含分隔符防前缀碰撞）', () => {
    expect(isAllowedRestorePath(process.cwd() + '/data/backups/easyui-backup-1.zip', dir, picked)).toBe(true);
    // 相邻目录 backups-evil 不能靠字符串前缀混过
    expect(isAllowedRestorePath(process.cwd() + '/data/backups-evil/x.zip', dir, picked)).toBe(false);
  });

  it('本会话对话框选择过的路径 → 放行；未选择过的外部路径 → 拒绝', () => {
    expect(isAllowedRestorePath(process.cwd() + '/downloads/chosen.zip', dir, picked)).toBe(true);
    expect(isAllowedRestorePath(process.cwd() + '/downloads/other.zip', dir, picked)).toBe(false);
    expect(isAllowedRestorePath('C:\\Windows\\system32\\evil.zip', dir, new Set())).toBe(false);
  });
});

describe('备份密码上限（F4：8–32 位）', () => {
  it('密码 >32 位 → backup_password_too_long', () => {
    expect(backupErrorCode(() =>
      buildBackup(rows, {
        includeKeys: true,
        password: 'a'.repeat(MAX_BACKUP_PASSWORD_CHARS + 1),
        decryptKey,
        appVersion: '0.1.0',
        schemaVersion: SCHEMA,
      }),
    )).toBe('backup_password_too_long');
  });

  it('密码恰 32 位仍可正常创建与恢复（roundtrip）', () => {
    const password = 'a'.repeat(MAX_BACKUP_PASSWORD_CHARS);
    const { data, manifest } = buildBackup(rows, {
      includeKeys: true,
      password,
      decryptKey,
      appVersion: '0.1.0',
      schemaVersion: SCHEMA,
    });
    const restored = parseBackup(data, manifest, { password, encryptKey, currentSchemaVersion: SCHEMA });
    expect(restored.providers[0].api_key_cipher).toBe('cipher-of-key-A');
  });
});
