/**
 * 参数预设状态：list + CRUD + 恢复出厂默认。
 * - 全局预设（is_global, id='global'）恒在首位；
 * - updateParams 本地即时生效 + 300ms 防抖写库（滑块连续拖动不刷屏）；
 * - 删除用户预设后需刷新会话列表（引用会话的 preset_id 已被主进程置 null）。
 */
import { create } from 'zustand';
import type { ParamPreset, ParamValues } from '@shared/types';
import { getApi } from '../bridge';

interface PresetsState {
  presets: ParamPreset[];
  loaded: boolean;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  create: (name: string, params: ParamValues) => Promise<ParamPreset>;
  /** 改名（仅用户预设；全局预设改名会被主进程拒绝） */
  rename: (id: string, name: string) => Promise<void>;
  /** 编辑预设参数（本地即时 + 防抖写库；全局预设走同一入口） */
  updateParams: (id: string, params: ParamValues) => void;
  remove: (id: string) => Promise<void>;
  resetGlobal: () => Promise<void>;
}

const paramTimers = new Map<string, number>();

export const usePresetsStore = create<PresetsState>()((set, get) => ({
  presets: [],
  loaded: false,

  load: async () => {
    const presets = await getApi().listParamPresets();
    set({ presets, loaded: true });
  },

  refresh: async () => {
    const presets = await getApi().listParamPresets();
    set({ presets });
  },

  create: async (name, params) => {
    const preset = await getApi().createParamPreset({ name, params });
    set({ presets: [...get().presets, preset] });
    return preset;
  },

  rename: async (id, name) => {
    const updated = await getApi().updateParamPreset(id, { name });
    set({ presets: get().presets.map((p) => (p.id === id ? updated : p)) });
  },

  updateParams: (id, params) => {
    // 本地即时生效
    set({
      presets: get().presets.map((p) =>
        p.id === id ? { ...p, params, updated_at: Date.now() } : p,
      ),
    });
    // 防抖写库（每预设单计时器）
    const prev = paramTimers.get(id);
    if (prev !== undefined) window.clearTimeout(prev);
    paramTimers.set(
      id,
      window.setTimeout(() => {
        paramTimers.delete(id);
        void getApi()
          .updateParamPreset(id, { params })
          .catch(() => {
            /* 写库失败：本地值保留，下次变更会重试 */
          });
      }, 300),
    );
  },

  remove: async (id) => {
    await getApi().deleteParamPreset(id);
    set({ presets: get().presets.filter((p) => p.id !== id) });
  },

  resetGlobal: async () => {
    const updated = await getApi().resetGlobalPreset();
    set({ presets: get().presets.map((p) => (p.id === updated.id ? updated : p)) });
  },
}));

export function useGlobalPreset(): ParamPreset | null {
  return usePresetsStore((s) => s.presets.find((p) => p.is_global) ?? null);
}

/** preset_id → 预设对象（null/未找到 → null，回落全局预设语义由调用方处理） */
export function usePresetById(id: string | null): ParamPreset | null {
  return usePresetsStore((s) => (id ? (s.presets.find((p) => p.id === id) ?? null) : null));
}
