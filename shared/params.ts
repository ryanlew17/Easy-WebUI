/**
 * 模型参数与预设（LM Studio 式）—— 纯逻辑模块，两端（electron/ 与 src/）共用，
 * 不依赖 node / electron / better-sqlite3，可直接被 vitest 单测。
 *
 * 覆盖语义（核心）：
 *   会话生效参数 = 全局预设参数 ←(覆盖) 选中用户预设参数 ←(覆盖) 会话 overrides。
 *   会话只存 overrides（Partial，只含被显式改过且与基线不等的键）。
 *   - applyOverridePatch：写入时若新值与基线相等 → 自动删除该 override（等值修剪）；
 *     patch 中值传 null 表示删除该 override 键（垃圾桶按钮 / 重置语义）。
 *   - modifiedKeys：修改判定一律用值比较，不用键存在性（历史等值 override 不显示高亮）。
 *
 * 参数组（一个垃圾桶管多个键，UI 与 docs/contracts/impl-contract.md ParamValues 保持一致）：
 *   limit=[limit_response_length,max_tokens]；repeat=[repeat_penalty_enabled,repeat_penalty]；
 *   presence=[presence_penalty_enabled,presence_penalty]；top_p=[top_p_enabled,top_p]；
 *   min_p=[min_p_enabled,min_p]；structured=[structured_output_enabled,structured_output_schema]；
 *   其余均为单键组。
 */

export type ContextOverflow = 'rolling' | 'truncate_middle' | 'stop';

export interface ParamValues {
  system_prompt: string;
  temperature: number; // 0..2
  limit_response_length: boolean; // 开 → 发送 max_tokens
  max_tokens: number; // 1..128000
  context_overflow: ContextOverflow;
  stop_strings: string[]; // 逗号分隔输入 → 数组；空数组不发
  top_k: number; // 0..500，0 = 不发送
  repeat_penalty_enabled: boolean;
  repeat_penalty: number; // 0..2
  presence_penalty_enabled: boolean;
  presence_penalty: number; // -2..2
  top_p_enabled: boolean;
  top_p: number; // 0..1
  min_p_enabled: boolean;
  min_p: number; // 0..1
  structured_output_enabled: boolean;
  structured_output_schema: string; // JSON Schema 文本
  context_window: number; // token 数
  stream: boolean;
}

export const FACTORY_DEFAULTS: ParamValues = {
  system_prompt: '',
  temperature: 0.8,
  limit_response_length: false,
  max_tokens: 1000,
  context_overflow: 'truncate_middle',
  stop_strings: [],
  top_k: 64,
  repeat_penalty_enabled: false,
  repeat_penalty: 1.0,
  presence_penalty_enabled: false,
  presence_penalty: 0,
  top_p_enabled: false,
  top_p: 1.0,
  min_p_enabled: false,
  min_p: 0,
  structured_output_enabled: false,
  structured_output_schema: '',
  context_window: 128000,
  stream: true,
};

export interface ParamPreset {
  id: string;
  name: string;
  is_global: boolean;
  params: ParamValues;
  created_at: number;
  updated_at: number;
}

export const GLOBAL_PRESET_ID = 'global';

export type ParamOverrides = Partial<ParamValues>;

/** updateConversation 的 params patch：值传 null 表示删除该 override 键 */
export type ParamOverridesPatch = { [K in keyof ParamValues]?: ParamValues[K] | null };

export const PARAM_KEYS = [
  'system_prompt',
  'temperature',
  'limit_response_length',
  'max_tokens',
  'context_overflow',
  'stop_strings',
  'top_k',
  'repeat_penalty_enabled',
  'repeat_penalty',
  'presence_penalty_enabled',
  'presence_penalty',
  'top_p_enabled',
  'top_p',
  'min_p_enabled',
  'min_p',
  'structured_output_enabled',
  'structured_output_schema',
  'context_window',
  'stream',
] as const satisfies readonly (keyof ParamValues)[];

/** 参数组（一个垃圾桶管多个键）；未列出的键即单键组 */
export const PARAM_GROUPS = {
  limit: ['limit_response_length', 'max_tokens'],
  repeat: ['repeat_penalty_enabled', 'repeat_penalty'],
  presence: ['presence_penalty_enabled', 'presence_penalty'],
  top_p: ['top_p_enabled', 'top_p'],
  min_p: ['min_p_enabled', 'min_p'],
  structured: ['structured_output_enabled', 'structured_output_schema'],
} as const satisfies Record<string, readonly (keyof ParamValues)[]>;

export type ParamGroupKey = keyof typeof PARAM_GROUPS;

/* ---------------- 值比较（stop_strings 数组需逐元素比较） ---------------- */

export function paramValueEquals(
  a: ParamValues[keyof ParamValues] | undefined,
  b: ParamValues[keyof ParamValues] | undefined,
): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => x === b[i]);
  }
  return Object.is(a, b);
}

/* ---------------- 覆盖解析 ---------------- */

/**
 * 生效参数 = 全局预设 ← 选中用户预设 ← 会话 overrides。
 * preset 为 null 表示未选用户预设（直接用全局预设）。overrides 中 undefined 键忽略。
 */
export function resolveParams(
  globalParams: ParamValues,
  preset: ParamPreset | null,
  overrides: ParamOverrides,
): ParamValues {
  const out: ParamValues = { ...globalParams, ...(preset ? preset.params : {}) };
  for (const k of PARAM_KEYS) {
    const v = overrides[k];
    if (v !== undefined) {
      (out as Record<keyof ParamValues, ParamValues[keyof ParamValues]>)[k] = v;
    }
  }
  return out;
}

/** 迁移用：effective 与 base 不等的键收进 overrides（值比较；等值不产生 override） */
export function diffOverrides(base: ParamValues, effective: ParamValues): ParamOverrides {
  const out: ParamOverrides = {};
  for (const k of PARAM_KEYS) {
    if (!paramValueEquals(base[k], effective[k])) {
      (out as Record<keyof ParamValues, ParamValues[keyof ParamValues]>)[k] = effective[k];
    }
  }
  return out;
}

/**
 * 应用一条 overrides patch（等值修剪语义）：
 * - 值为 undefined → 跳过（未触碰）；
 * - 值为 null → 删除该 override 键（垃圾桶/重置）；
 * - 其余 → 与基线值比较：相等则删除（不存等值 override），不等则写入。
 * 返回新对象；顺带清理 overrides 里历史遗留的等值键（自愈）。
 */
export function applyOverridePatch(
  base: ParamValues,
  overrides: ParamOverrides,
  patch: ParamOverridesPatch,
): ParamOverrides {
  const next: ParamOverrides = { ...overrides };
  for (const k of PARAM_KEYS) {
    const v = patch[k];
    if (v === undefined) continue;
    if (v === null) {
      delete next[k];
      continue;
    }
    if (paramValueEquals(v, base[k])) {
      delete next[k];
    } else {
      (next as Record<keyof ParamValues, ParamValues[keyof ParamValues]>)[k] = v;
    }
  }
  for (const k of PARAM_KEYS) {
    if (k in next && paramValueEquals(next[k], base[k])) delete next[k];
  }
  return next;
}

/** 删除一组键（垃圾桶按组清除），返回新对象 */
export function clearOverrideKeys(
  overrides: ParamOverrides,
  keys: readonly (keyof ParamValues)[],
): ParamOverrides {
  const next = { ...overrides };
  for (const k of keys) delete next[k];
  return next;
}

/**
 * 被修改的键集合（值比较，非键存在性）：
 * override 存在且值 ≠ 基线值 → 视为被修改。
 */
export function modifiedKeys(
  base: ParamValues,
  overrides: ParamOverrides,
): ReadonlySet<keyof ParamValues> {
  const set = new Set<keyof ParamValues>();
  for (const k of PARAM_KEYS) {
    if (k in overrides && !paramValueEquals(overrides[k], base[k])) set.add(k);
  }
  return set;
}

/** 参数组（或单键）是否被修改 */
export function isGroupModified(
  base: ParamValues,
  overrides: ParamOverrides,
  keys: readonly (keyof ParamValues)[],
): boolean {
  return keys.some((k) => k in overrides && !paramValueEquals(overrides[k], base[k]));
}

/* ---------------- 旧版（schema v1 SessionParams）迁移 ---------------- */

/** 旧 SessionParams 扁平结构（仅迁移用；所有键可选，缺省回落到旧默认） */
export interface LegacySessionParams {
  provider_id?: string | null;
  model?: string | null;
  system_prompt?: string;
  max_tokens?: number;
  context_window?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  repeat_penalty?: number;
  stream?: boolean;
}

/** 旧版默认值（schema v1 的 DEFAULT_PARAMS，迁移基准） */
export const LEGACY_DEFAULT_PARAMS: Required<LegacySessionParams> = {
  provider_id: null,
  model: null,
  system_prompt: '',
  max_tokens: 4096,
  context_window: 128000,
  temperature: 1,
  top_p: 1,
  top_k: 0,
  repeat_penalty: 0,
  stream: true,
};

export interface LegacyMigrationResult {
  provider_id: string | null;
  model: string | null;
  preset_id: null;
  overrides: ParamOverrides;
}

const LEGACY_NUMBER_KEYS = [
  'max_tokens',
  'context_window',
  'temperature',
  'top_p',
  'top_k',
  'repeat_penalty',
] as const;

/**
 * 旧 conversations.params JSON（SessionParams 扁平结构）→ 新模型：
 * - provider_id/model 提升到顶层（params 里的值优先于旧列值）；
 * - preset_id = null（回落到全局预设；迁移时全局预设即工厂默认）；
 * - overrides = diffOverrides(FACTORY_DEFAULTS, mapped)，映射规则：
 *   旧 max_tokens ≠ 4096 → limit_response_length=true + 旧值，否则关闭（回工厂默认 1000）；
 *   旧 top_p ≠ 1 → top_p_enabled=true + 旧值；
 *   旧 repeat_penalty > 0 → repeat_penalty_enabled=true + 旧值；
 *   temperature / top_k 总是保留旧值（即便等于出厂默认也钉进 overrides，
 *   保证旧会话行为不随全局预设日后变动而改变；旧 top_k=0 保留"不发送"语义）。
 */
export function migrateLegacyParams(
  raw: unknown,
  colProviderId: string | null,
  colModel: string | null,
): LegacyMigrationResult {
  const src = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const legacy: Required<LegacySessionParams> = { ...LEGACY_DEFAULT_PARAMS };
  if (typeof src.system_prompt === 'string') legacy.system_prompt = src.system_prompt;
  if (typeof src.stream === 'boolean') legacy.stream = src.stream;
  if (typeof src.provider_id === 'string' || src.provider_id === null) {
    legacy.provider_id = src.provider_id ?? null;
  }
  if (typeof src.model === 'string' || src.model === null) legacy.model = src.model ?? null;
  for (const k of LEGACY_NUMBER_KEYS) {
    const v = src[k];
    if (typeof v === 'number' && Number.isFinite(v)) {
      (legacy as Record<string, unknown>)[k] = v;
    }
  }

  const limitOn = legacy.max_tokens !== LEGACY_DEFAULT_PARAMS.max_tokens;
  const mapped: ParamValues = {
    ...FACTORY_DEFAULTS,
    system_prompt: legacy.system_prompt,
    temperature: legacy.temperature,
    limit_response_length: limitOn,
    max_tokens: limitOn ? legacy.max_tokens : FACTORY_DEFAULTS.max_tokens,
    top_k: legacy.top_k,
    top_p_enabled: legacy.top_p !== 1,
    top_p: legacy.top_p,
    repeat_penalty_enabled: legacy.repeat_penalty > 0,
    repeat_penalty:
      legacy.repeat_penalty > 0 ? legacy.repeat_penalty : FACTORY_DEFAULTS.repeat_penalty,
    context_window: legacy.context_window,
    stream: legacy.stream,
  };

  const overrides = diffOverrides(FACTORY_DEFAULTS, mapped);
  overrides.temperature = mapped.temperature; // 总是钉住旧值（不变行为）
  overrides.top_k = mapped.top_k;

  return {
    provider_id: legacy.provider_id ?? colProviderId,
    model: legacy.model ?? colModel,
    preset_id: null,
    overrides,
  };
}

/** 迁移入口（DB/备份恢复用）：params_json 字符串防御式解析后走 migrateLegacyParams */
export function migrateLegacyParamsJson(
  paramsJson: string,
  colProviderId: string | null,
  colModel: string | null,
): LegacyMigrationResult {
  let raw: unknown = {};
  try {
    raw = JSON.parse(paramsJson);
  } catch {
    /* 损坏 JSON 按全默认迁移 */
  }
  return migrateLegacyParams(raw, colProviderId, colModel);
}

/* ---------------- DB/IPC 边界的防御式整形（腐蚀 JSON 自愈） ---------------- */

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(max, Math.max(min, n));
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  return Math.round(clampNum(v, min, max, fallback));
}

function toBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function toStr(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

function toOverflow(v: unknown, fallback: ContextOverflow): ContextOverflow {
  return v === 'rolling' || v === 'truncate_middle' || v === 'stop' ? v : fallback;
}

function toStopStrings(v: unknown, fallback: string[]): string[] {
  if (!Array.isArray(v)) return fallback;
  return v.filter((x): x is string => typeof x === 'string').slice(0, 32);
}

/** 任意 JSON → 合法 ParamValues（逐键类型校验 + 范围钳制，未知键丢弃） */
export function sanitizeParams(raw: unknown): ParamValues {
  const src = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const d = FACTORY_DEFAULTS;
  return {
    system_prompt: toStr(src.system_prompt, d.system_prompt),
    temperature: clampNum(src.temperature, 0, 2, d.temperature),
    limit_response_length: toBool(src.limit_response_length, d.limit_response_length),
    max_tokens: clampInt(src.max_tokens, 1, 128000, d.max_tokens),
    context_overflow: toOverflow(src.context_overflow, d.context_overflow),
    stop_strings: toStopStrings(src.stop_strings, d.stop_strings),
    top_k: clampInt(src.top_k, 0, 500, d.top_k),
    repeat_penalty_enabled: toBool(src.repeat_penalty_enabled, d.repeat_penalty_enabled),
    repeat_penalty: clampNum(src.repeat_penalty, 0, 2, d.repeat_penalty),
    presence_penalty_enabled: toBool(src.presence_penalty_enabled, d.presence_penalty_enabled),
    presence_penalty: clampNum(src.presence_penalty, -2, 2, d.presence_penalty),
    top_p_enabled: toBool(src.top_p_enabled, d.top_p_enabled),
    top_p: clampNum(src.top_p, 0, 1, d.top_p),
    min_p_enabled: toBool(src.min_p_enabled, d.min_p_enabled),
    min_p: clampNum(src.min_p, 0, 1, d.min_p),
    structured_output_enabled: toBool(
      src.structured_output_enabled,
      d.structured_output_enabled,
    ),
    structured_output_schema: toStr(src.structured_output_schema, d.structured_output_schema),
    context_window: clampInt(src.context_window, 256, 2_000_000, d.context_window),
    stream: toBool(src.stream, d.stream),
  };
}

/** 任意 JSON → 合法 ParamOverrides（逐键校验，非法键丢弃） */
export function sanitizeOverrides(raw: unknown): ParamOverrides {
  const src = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const full = sanitizeParams(
    Object.fromEntries(PARAM_KEYS.filter((k) => k in src).map((k) => [k, src[k]])),
  );
  const out: ParamOverrides = {};
  for (const k of PARAM_KEYS) {
    if (k in src) {
      (out as Record<keyof ParamValues, ParamValues[keyof ParamValues]>)[k] = full[k];
    }
  }
  return out;
}
