/**
 * 会话状态：列表（pinned + updated_at 排序）、当前会话、即写库的参数变更（防抖）。
 *
 * schema v2：会话只存 preset_id + overrides。patchParams 的语义：
 * - 本地立即生效：用 shared 的 applyOverridePatch 以"当前预设基线"做等值修剪后
 *   更新本地 overrides（值与基线相等 → 键被删除，高亮即时消失）；
 * - 防抖写库：累积 300ms 窗口内的全部 patch 键（旧实现只发最后一次 patch，
 *   快速连改两个键会丢前者，这里顺带修复），主进程按同一函数再修剪一次。
 * - patch.params 里值传 null = 删除该 override 键（垃圾桶/重置）。
 */
import { create } from 'zustand';
import type { Conversation, ParamOverridesPatch } from '@shared/types';
import { FACTORY_DEFAULTS, resolveParams, applyOverridePatch } from '@shared/params';
import { getApi } from '../bridge';
import { usePresetsStore } from './presets';

type ConvPatch = Partial<
  Pick<Conversation, 'title' | 'pinned' | 'provider_id' | 'model' | 'preset_id' | 'reasoning_enabled'>
> & {
  params?: ParamOverridesPatch;
};

function sortConversations(list: Conversation[]): Conversation[] {
  return list
    .slice()
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at - a.updated_at);
}

/** 当前会话的覆盖基线：全局预设 ← 选中用户预设（不含 overrides） */
function currentBase(conv: Conversation) {
  const { presets } = usePresetsStore.getState();
  const globalParams = presets.find((p) => p.is_global)?.params ?? FACTORY_DEFAULTS;
  const preset = conv.preset_id ? (presets.find((p) => p.id === conv.preset_id) ?? null) : null;
  return resolveParams(globalParams, preset, {});
}

interface ConversationsState {
  conversations: Conversation[];
  currentId: string | null;
  loaded: boolean;
  load: () => Promise<void>;
  /** 生成完成等事件后刷新列表（标题/updated_at 可能已变） */
  refresh: () => Promise<void>;
  select: (id: string | null) => void;
  create: () => Promise<Conversation>;
  patch: (id: string, patch: ConvPatch) => Promise<void>;
  /** 参数面板专用：本地立即生效（等值修剪）+ 300ms 防抖写库（滑块连续拖动不刷屏） */
  patchParams: (id: string, params: ParamOverridesPatch) => void;
  /** 标题生成事件/手动结果落本地（后端已写库，这里只同步视图） */
  applyTitle: (id: string, title: string) => void;
  /** 生成完成：本地 bump updated_at 并重排序（等价于主进程 conversations.touch）。
   *  刻意不整表 refetch：旧实现 onChatDone → refresh() 的 listConversations 快照若先于
   *  标题落库生成、却晚于 applyTitle 落 set，会用旧快照把刚生成的标题盖回空串
   *  （"标题已落库但侧栏仍显示占位"的竞态根因）。 */
  touchLocal: (id: string) => void;
  remove: (id: string) => Promise<void>;
}

const paramTimers = new Map<string, number>();
const pendingPatches = new Map<string, ParamOverridesPatch>();

export const useConversationsStore = create<ConversationsState>()((set, get) => ({
  conversations: [],
  currentId: null,
  loaded: false,

  load: async () => {
    const conversations = sortConversations(await getApi().listConversations());
    set({ conversations, loaded: true });
    const { currentId } = get();
    if (!currentId && conversations.length > 0) {
      set({ currentId: conversations[0].id });
    } else if (currentId && !conversations.some((c) => c.id === currentId)) {
      set({ currentId: conversations[0]?.id ?? null });
    }
  },

  refresh: async () => {
    const conversations = sortConversations(await getApi().listConversations());
    set({ conversations });
  },

  select: (id) => set({ currentId: id }),

  create: async () => {
    const conv = await getApi().createConversation();
    set({
      conversations: sortConversations([...get().conversations, conv]),
      currentId: conv.id,
    });
    return conv;
  },

  patch: async (id, patch) => {
    const updated = await getApi().updateConversation(id, patch);
    set({
      conversations: sortConversations(
        get().conversations.map((c) => (c.id === id ? updated : c)),
      ),
    });
  },

  patchParams: (id, params) => {
    // 本地即时生效（与主进程同一套等值修剪逻辑）
    set({
      conversations: get().conversations.map((c) =>
        c.id === id ? { ...c, overrides: applyOverridePatch(currentBase(c), c.overrides, params) } : c,
      ),
    });
    // 累积待写 patch（同键后写覆盖先写），防抖写库（每会话单计时器）
    pendingPatches.set(id, { ...pendingPatches.get(id), ...params });
    const prev = paramTimers.get(id);
    if (prev !== undefined) window.clearTimeout(prev);
    paramTimers.set(
      id,
      window.setTimeout(() => {
        paramTimers.delete(id);
        const accumulated = pendingPatches.get(id);
        pendingPatches.delete(id);
        if (!accumulated) return;
        void get()
          .patch(id, { params: accumulated })
          .catch(() => {
            /* 写库失败：本地值保留，下次变更会重试 */
          });
      }, 300),
    );
  },

  applyTitle: (id, title) => {
    // 与主进程 conversations.update 对齐：标题变更同时 bump updated_at，
    // 保持本地排序与 DB 排序一致（否则重启前后列表顺序可能不同）
    set({
      conversations: sortConversations(
        get().conversations.map((c) =>
          c.id === id ? { ...c, title, updated_at: Date.now() } : c,
        ),
      ),
    });
  },

  touchLocal: (id) => {
    set({
      conversations: sortConversations(
        get().conversations.map((c) => (c.id === id ? { ...c, updated_at: Date.now() } : c)),
      ),
    });
  },

  remove: async (id) => {    await getApi().deleteConversation(id);
    const remaining = get().conversations.filter((c) => c.id !== id);
    set({
      conversations: remaining,
      currentId: get().currentId === id ? remaining[0]?.id ?? null : get().currentId,
    });
  },
}));

export function useCurrentConversation(): Conversation | null {
  return useConversationsStore(
    (s) => s.conversations.find((c) => c.id === s.currentId) ?? null,
  );
}
