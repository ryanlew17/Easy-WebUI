/**
 * UI 壳状态：当前页、设置标签、右栏折叠与宽度（cookie 持久化）、全局 toast。
 */
import { create } from 'zustand';
import { readPrefs, writePrefs } from '../lib/prefs';

export type Page = 'chat' | 'settings';
export type SettingsTab = 'providers' | 'presets' | 'general' | 'backup' | 'about';

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'warning' | 'error';
  text: string;
}

export const RIGHT_WIDTH_MIN = 240;
export const RIGHT_WIDTH_MAX = 480;
export const RIGHT_WIDTH_DEFAULT = 288;

interface UiState {
  page: Page;
  settingsTab: SettingsTab;
  rightCollapsed: boolean;
  /** px 数值（来自拖拽/cookie），应用时折算 rem，不写死 px 尺寸 */
  rightWidth: number;
  /** 打开中的模态数，用于 Esc 键分派（模态优先于停止生成） */
  modalDepth: number;
  toasts: Toast[];

  setPage: (p: Page) => void;
  openSettings: (tab?: SettingsTab) => void;
  setSettingsTab: (t: SettingsTab) => void;
  toggleRight: () => void;
  setRightWidth: (px: number) => void;
  incModal: () => void;
  decModal: () => void;
  toast: (kind: Toast['kind'], text: string) => void;
  dismissToast: (id: number) => void;
}

let toastSeq = 0;
const prefs = typeof document !== 'undefined' ? readPrefs() : {};

export const useUiStore = create<UiState>()((set, get) => ({
  page: 'chat',
  settingsTab: 'providers',
  rightCollapsed: prefs.sidebar_collapsed ?? false,
  rightWidth:
    typeof prefs.right_width === 'number'
      ? Math.min(RIGHT_WIDTH_MAX, Math.max(RIGHT_WIDTH_MIN, prefs.right_width))
      : RIGHT_WIDTH_DEFAULT,
  modalDepth: 0,
  toasts: [],

  setPage: (page) => set({ page }),
  openSettings: (tab) =>
    set((s) => ({ page: 'settings', settingsTab: tab ?? s.settingsTab })),
  setSettingsTab: (settingsTab) => set({ settingsTab }),
  toggleRight: () => {
    const next = !get().rightCollapsed;
    set({ rightCollapsed: next });
    writePrefs({ sidebar_collapsed: next });
  },
  setRightWidth: (px) => {
    const clamped = Math.min(RIGHT_WIDTH_MAX, Math.max(RIGHT_WIDTH_MIN, Math.round(px)));
    set({ rightWidth: clamped });
    writePrefs({ right_width: clamped });
  },
  incModal: () => set((s) => ({ modalDepth: s.modalDepth + 1 })),
  decModal: () => set((s) => ({ modalDepth: Math.max(0, s.modalDepth - 1) })),
  toast: (kind, text) => {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts.slice(-4), { id, kind, text }] }));
    window.setTimeout(() => get().dismissToast(id), 4500);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
