/**
 * shared/params.ts 纯逻辑测试：三层覆盖解析、等值修剪、值比较修改判定、
 * 旧版（schema v1 SessionParams）迁移映射、DB/IPC 边界整形。
 */
import { describe, expect, it } from 'vitest';
import {
  applyOverridePatch,
  clearOverrideKeys,
  diffOverrides,
  FACTORY_DEFAULTS,
  isGroupModified,
  LEGACY_DEFAULT_PARAMS,
  migrateLegacyParams,
  migrateLegacyParamsJson,
  modifiedKeys,
  PARAM_GROUPS,
  paramValueEquals,
  resolveParams,
  sanitizeOverrides,
  sanitizeParams,
  type ParamPreset,
  type ParamValues,
} from '@shared/params';

const presetWith = (params: Partial<ParamValues>): ParamPreset => ({
  id: 'p1',
  name: 'P1',
  is_global: false,
  params: { ...FACTORY_DEFAULTS, ...params },
  created_at: 1,
  updated_at: 1,
});

/* ---------------- resolveParams：全局 ← 用户预设 ← 会话 overrides ---------------- */

describe('resolveParams 三层覆盖', () => {
  it('空 overrides + 无预设 → 等于全局预设参数', () => {
    const global = { ...FACTORY_DEFAULTS, temperature: 1.2 };
    expect(resolveParams(global, null, {})).toEqual(global);
  });

  it('用户预设盖全局，会话 overrides 盖预设', () => {
    const global = { ...FACTORY_DEFAULTS, temperature: 1.2, top_k: 5 };
    const preset = presetWith({ temperature: 0.3, top_k: 10 });
    const out = resolveParams(global, preset, { top_k: 99 });
    expect(out.temperature).toBe(0.3); // preset 覆盖 global
    expect(out.top_k).toBe(99); // overrides 覆盖 preset
    expect(out.max_tokens).toBe(FACTORY_DEFAULTS.max_tokens); // 未触碰的键回全局
  });

  it('overrides 中 undefined 键忽略（未触碰）', () => {
    const out = resolveParams(FACTORY_DEFAULTS, null, { temperature: undefined });
    expect(out.temperature).toBe(FACTORY_DEFAULTS.temperature);
  });
});

/* ---------------- applyOverridePatch：等值修剪 + null 删键 + 自愈 ---------------- */

describe('applyOverridePatch', () => {
  it('写入与基线不等的值', () => {
    const next = applyOverridePatch(FACTORY_DEFAULTS, {}, { temperature: 0.1 });
    expect(next).toEqual({ temperature: 0.1 });
  });

  it('写入与基线相等的值 → 不存（等值修剪）', () => {
    const next = applyOverridePatch(FACTORY_DEFAULTS, {}, { temperature: FACTORY_DEFAULTS.temperature });
    expect(next).toEqual({});
  });

  it('已有 override 被改回基线值 → 键被删除', () => {
    const next = applyOverridePatch(
      FACTORY_DEFAULTS,
      { temperature: 0.1 },
      { temperature: FACTORY_DEFAULTS.temperature },
    );
    expect(next).toEqual({});
  });

  it('patch 值传 null → 删除该 override 键（垃圾桶语义）', () => {
    const next = applyOverridePatch(FACTORY_DEFAULTS, { temperature: 0.1, top_k: 5 }, { temperature: null });
    expect(next).toEqual({ top_k: 5 });
  });

  it('undefined 键跳过（未触碰）', () => {
    const next = applyOverridePatch(FACTORY_DEFAULTS, { top_k: 5 }, { temperature: undefined });
    expect(next).toEqual({ top_k: 5 });
  });

  it('自愈：overrides 里历史遗留的等值键即使未被 patch 触碰也被清掉', () => {
    const legacy = { temperature: FACTORY_DEFAULTS.temperature, top_k: 5 };
    const next = applyOverridePatch(FACTORY_DEFAULTS, legacy, { max_tokens: 2000 });
    expect(next).toEqual({ top_k: 5, max_tokens: 2000 });
  });

  it('stop_strings 数组按值比较：与基线相同的数组不存', () => {
    const next = applyOverridePatch(FACTORY_DEFAULTS, {}, { stop_strings: [] });
    expect(next).toEqual({});
    const next2 = applyOverridePatch(FACTORY_DEFAULTS, {}, { stop_strings: ['###'] });
    expect(next2).toEqual({ stop_strings: ['###'] });
  });
});

describe('clearOverrideKeys', () => {
  it('按组删除多键，返回新对象', () => {
    const src = { limit_response_length: true, max_tokens: 500, top_k: 5 };
    const next = clearOverrideKeys(src, PARAM_GROUPS.limit);
    expect(next).toEqual({ top_k: 5 });
    expect(src.max_tokens).toBe(500); // 不改原对象
  });
});

/* ---------------- modifiedKeys / isGroupModified：值比较，非键存在性 ---------------- */

describe('modifiedKeys / isGroupModified', () => {
  it('override 等值不算修改（历史等值残留不高亮）', () => {
    const set = modifiedKeys(FACTORY_DEFAULTS, { temperature: FACTORY_DEFAULTS.temperature });
    expect(set.size).toBe(0);
  });

  it('值不等才算修改；stop_strings 数组逐元素比较', () => {
    const set = modifiedKeys(FACTORY_DEFAULTS, { top_k: 5, stop_strings: ['###'] });
    expect(set.has('top_k')).toBe(true);
    expect(set.has('stop_strings')).toBe(true);
    expect(set.has('temperature')).toBe(false);
  });

  it('isGroupModified：组内任一键修改即 true', () => {
    expect(isGroupModified(FACTORY_DEFAULTS, { max_tokens: 2000 }, PARAM_GROUPS.limit)).toBe(true);
    expect(isGroupModified(FACTORY_DEFAULTS, { top_k: 5 }, PARAM_GROUPS.limit)).toBe(false);
  });
});

describe('diffOverrides', () => {
  it('只收与基线不等的键；数组按值比较', () => {
    const effective: ParamValues = { ...FACTORY_DEFAULTS, temperature: 0.1, stop_strings: ['A'] };
    expect(diffOverrides(FACTORY_DEFAULTS, effective)).toEqual({
      temperature: 0.1,
      stop_strings: ['A'],
    });
  });
});

describe('paramValueEquals', () => {
  it('数组逐元素比较，引用不同也相等', () => {
    expect(paramValueEquals(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(paramValueEquals(['a'], ['a', 'b'])).toBe(false);
    expect(paramValueEquals(0.8, 0.8)).toBe(true);
  });
});

/* ---------------- migrateLegacyParams：旧版扁平 SessionParams → overrides ---------------- */

describe('migrateLegacyParams', () => {
  it('全默认旧 params：只钉 temperature/top_k，其余键不产生 override', () => {
    const r = migrateLegacyParams({}, 'col-p', 'col-m');
    expect(r.provider_id).toBe('col-p'); // 列值回落
    expect(r.model).toBe('col-m');
    expect(r.preset_id).toBeNull();
    expect(r.overrides).toEqual({
      temperature: LEGACY_DEFAULT_PARAMS.temperature, // 1
      top_k: LEGACY_DEFAULT_PARAMS.top_k, // 0（保留"不发送"语义）
    });
  });

  it('temperature/top_k 即使恰等于出厂默认也总是钉进 overrides', () => {
    const r = migrateLegacyParams({ temperature: 0.8, top_k: 64 }, null, null);
    expect(r.overrides.temperature).toBe(0.8);
    expect(r.overrides.top_k).toBe(64);
  });

  it('旧 max_tokens ≠ 4096 → limit_response_length=true + 旧值', () => {
    const r = migrateLegacyParams({ max_tokens: 8192 }, null, null);
    expect(r.overrides.limit_response_length).toBe(true);
    expect(r.overrides.max_tokens).toBe(8192);
  });

  it('旧 max_tokens = 4096（旧默认）→ limit 关闭且不产生 override', () => {
    const r = migrateLegacyParams({ max_tokens: 4096 }, null, null);
    expect(r.overrides.limit_response_length).toBeUndefined();
    expect(r.overrides.max_tokens).toBeUndefined();
  });

  it('旧 top_p ≠ 1 → top_p_enabled=true + 旧值；=1 无 override', () => {
    const on = migrateLegacyParams({ top_p: 0.5 }, null, null);
    expect(on.overrides.top_p_enabled).toBe(true);
    expect(on.overrides.top_p).toBe(0.5);
    const off = migrateLegacyParams({ top_p: 1 }, null, null);
    expect(off.overrides.top_p_enabled).toBeUndefined();
    expect(off.overrides.top_p).toBeUndefined();
  });

  it('旧 repeat_penalty > 0 → enabled + 旧值；=0 无 override', () => {
    const on = migrateLegacyParams({ repeat_penalty: 1.5 }, null, null);
    expect(on.overrides.repeat_penalty_enabled).toBe(true);
    expect(on.overrides.repeat_penalty).toBe(1.5);
    const off = migrateLegacyParams({ repeat_penalty: 0 }, null, null);
    expect(off.overrides.repeat_penalty_enabled).toBeUndefined();
  });

  it('system_prompt / context_window / stream 非默认才进 overrides', () => {
    const r = migrateLegacyParams(
      { system_prompt: '你是助手', context_window: 8192, stream: false },
      null,
      null,
    );
    expect(r.overrides.system_prompt).toBe('你是助手');
    expect(r.overrides.context_window).toBe(8192);
    expect(r.overrides.stream).toBe(false);
    const d = migrateLegacyParams({}, null, null);
    expect(d.overrides.system_prompt).toBeUndefined();
    expect(d.overrides.context_window).toBeUndefined();
    expect(d.overrides.stream).toBeUndefined();
  });

  it('params 内的 provider_id/model 优先于旧列值', () => {
    const r = migrateLegacyParams({ provider_id: 'in-params', model: 'in-params-m' }, 'col-p', 'col-m');
    expect(r.provider_id).toBe('in-params');
    expect(r.model).toBe('in-params-m');
  });

  it('损坏 JSON → 按全默认迁移（不抛错）', () => {
    const r = migrateLegacyParamsJson('not-json{{', 'col-p', null);
    expect(r.provider_id).toBe('col-p');
    expect(r.overrides).toEqual({ temperature: 1, top_k: 0 });
  });
});

/* ---------------- sanitizeParams / sanitizeOverrides：边界自愈 ---------------- */

describe('sanitizeParams', () => {
  it('腐蚀 JSON 逐键回落/钳制，未知键丢弃', () => {
    const out = sanitizeParams({
      temperature: 'hot',
      max_tokens: -5,
      top_k: 9999,
      context_overflow: 'bogus',
      stop_strings: 'nope',
      context_window: 10,
      unknown_key: 1,
    });
    expect(out.temperature).toBe(FACTORY_DEFAULTS.temperature);
    expect(out.max_tokens).toBe(1); // clamp 1..128000
    expect(out.top_k).toBe(500); // clamp 0..500
    expect(out.context_overflow).toBe('truncate_middle');
    expect(out.stop_strings).toEqual([]);
    expect(out.context_window).toBe(256); // clamp 256..2_000_000
    expect('unknown_key' in out).toBe(false);
  });

  it('stop_strings 非字符串元素被过滤', () => {
    const out = sanitizeParams({ stop_strings: ['a', 1, 'b', null] });
    expect(out.stop_strings).toEqual(['a', 'b']);
  });
});

describe('sanitizeOverrides', () => {
  it('只保留传入的键，逐键校验', () => {
    const out = sanitizeOverrides({ temperature: 5, top_k: 'x', junk: 1 });
    expect(out.temperature).toBe(2); // clamp 0..2
    expect(out.top_k).toBe(FACTORY_DEFAULTS.top_k); // 非数字回默认
    expect('junk' in out).toBe(false);
    expect('max_tokens' in out).toBe(false); // 未传入的键不补
  });
});
