/**
 * 消息状态 + 流式编排：
 * - 事件（onChatDelta/Done/Error）在 App 层统一挂载后路由到这里；
 * - delta 进入增量缓冲，50ms 节流 flush 进 React 状态（docs/design/ux-guidelines.md，性能预算）；
 * - 单会话单生成锁：generating 映射驱动输入禁用/停止按钮/Esc。
 */
import { create } from 'zustand';
import type { ApiError, Message } from '@shared/types';
import { getApi } from '../bridge';
import { parseIpcError } from '../lib/errors';

interface DeltaPayload {
  conversationId: string;
  messageId: string;
  delta: string;
  reasoning_delta?: string;
}
interface DonePayload {
  conversationId: string;
  messageId: string;
  message: Message;
}
interface ErrorPayload {
  conversationId: string;
  messageId: string;
  error: ApiError;
}

export interface SendOptions {
  /** user 消息编辑后重发：以该消息同级分支身份插入（parent = 其 parent_id） */
  siblingOf?: string;
}

type Result = { ok: boolean; error?: ApiError };

interface MessagesState {
  byConv: Record<string, Message[]>;
  loadedConvs: Record<string, boolean>;
  generating: Record<string, boolean>;

  loadFor: (convId: string) => Promise<void>;
  send: (
    convId: string,
    content: string,
    opts?: SendOptions,
  ) => Promise<Result>;
  stop: (convId: string) => Promise<void>;
  /** 重新生成指定 assistant 消息（新同级分支，激活叶切过去；流式事件同 send） */
  regenerate: (convId: string, messageId: string) => Promise<Result>;
  /** 续写指定 assistant 消息（delta 追加同一气泡，不新建分支） */
  continueGeneration: (convId: string, messageId: string) => Promise<Result>;
  /** 激活叶为 user 消息时直接生成回复（Generate Response 按钮 / Ctrl+R） */
  generate: (convId: string) => Promise<Result>;
  /** 切换到相邻分支（messageId 取自 branch.ids）；返回路径整体替换 */
  switchBranch: (convId: string, messageId: string) => Promise<Result>;
  /** 把激活叶精确设为指定消息（branch 按钮："在此消息之后分叉聊天"） */
  setActiveLeaf: (convId: string, messageId: string) => Promise<Result>;
  /** assistant 原地编辑（不重发） */
  updateContent: (convId: string, messageId: string, content: string) => Promise<Result>;
  /** 批量删除（含子树连删）；返回路径整体替换 */
  deleteMessages: (convId: string, ids: string[]) => Promise<Result>;

  handleDelta: (p: DeltaPayload) => void;
  handleDone: (p: DonePayload) => void;
  handleError: (p: ErrorPayload) => void;
}

/* ---------- 流式增量缓冲（不直接 set，50ms 节流 flush） ---------- */

interface PendingBuf {
  content: string;
  reasoning: string;
}
const pending = new Map<string, PendingBuf>();
let flushTimer: number | null = null;
let flushFn: (() => void) | null = null;

function clearPendingFor(messageId: string): PendingBuf | null {
  const buf = pending.get(messageId) ?? null;
  pending.delete(messageId);
  return buf;
}

export const useMessagesStore = create<MessagesState>()((set, get) => {
  const flush = (): void => {
    flushTimer = null;
    if (pending.size === 0) return;
    const batch = new Map(pending);
    pending.clear();
    set((state) => {
      const byConv = { ...state.byConv };
      for (const [convId, msgs] of Object.entries(byConv)) {
        if (!msgs.some((m) => batch.has(m.id))) continue;
        byConv[convId] = msgs.map((m) => {
          const buf = batch.get(m.id);
          if (!buf) return m;
          return {
            ...m,
            content: m.content + buf.content,
            reasoning: (m.reasoning ?? '') + buf.reasoning,
          };
        });
      }
      return { byConv };
    });
  };

  flushFn = flush;

  const scheduleFlush = (): void => {
    if (flushTimer !== null) return;
    flushTimer = window.setTimeout(() => {
      flush();
    }, 50);
  };

  const setGenerating = (convId: string, v: boolean): void => {
    set((state) => ({ generating: { ...state.generating, [convId]: v } }));
  };

  return {
    byConv: {},
    loadedConvs: {},
    generating: {},

    loadFor: async (convId) => {
      const messages = await getApi().listMessages(convId);
      set((state) => ({
        byConv: { ...state.byConv, [convId]: messages },
        loadedConvs: { ...state.loadedConvs, [convId]: true },
      }));
    },

    send: async (convId, content, opts) => {
      if (get().generating[convId]) {
        return { ok: false, error: { code: 'generation_in_progress', message: '' } };
      }
      setGenerating(convId, true);
      try {
        await getApi().sendMessage({
          conversationId: convId,
          content,
          siblingOf: opts?.siblingOf,
        });
        // 重载以拿到落库的 user/assistant 占位消息（siblingOf 分叉会反映新路径）
        await get().loadFor(convId);
        return { ok: true };
      } catch (e) {
        setGenerating(convId, false);
        // IPC 错误码经 EASYUI_ERR: 编码跨进程传输（shared/errors.ts），统一解码
        return { ok: false, error: parseIpcError(e) };
      }
    },

    stop: async (convId) => {
      await getApi().stopGeneration(convId);
      // 主进程/mock 会以 done(partial:true) 收尾，generating 在 handleDone 清除
    },

    /** 生成类操作的公共骨架：锁 + 调用 + 重载路径（done/error 事件负责解锁） */
    regenerate: async (convId, messageId) => {
      if (get().generating[convId]) {
        return { ok: false, error: { code: 'generation_in_progress', message: '' } };
      }
      setGenerating(convId, true);
      try {
        await getApi().regenerateMessage({ conversationId: convId, messageId });
        await get().loadFor(convId);
        return { ok: true };
      } catch (e) {
        setGenerating(convId, false);
        return { ok: false, error: parseIpcError(e) };
      }
    },

    continueGeneration: async (convId, messageId) => {
      if (get().generating[convId]) {
        return { ok: false, error: { code: 'generation_in_progress', message: '' } };
      }
      setGenerating(convId, true);
      try {
        // 续写不新建消息：delta 事件直接拼同一 messageId（handleDelta 已支持），无需重载
        await getApi().continueMessage({ conversationId: convId, messageId });
        return { ok: true };
      } catch (e) {
        setGenerating(convId, false);
        return { ok: false, error: parseIpcError(e) };
      }
    },

    generate: async (convId) => {
      if (get().generating[convId]) {
        return { ok: false, error: { code: 'generation_in_progress', message: '' } };
      }
      setGenerating(convId, true);
      try {
        await getApi().generateResponse({ conversationId: convId });
        await get().loadFor(convId);
        return { ok: true };
      } catch (e) {
        setGenerating(convId, false);
        return { ok: false, error: parseIpcError(e) };
      }
    },

    switchBranch: async (convId, messageId) => {
      try {
        const path = await getApi().switchBranch({ conversationId: convId, messageId });
        set((state) => ({ byConv: { ...state.byConv, [convId]: path } }));
        return { ok: true };
      } catch (e) {
        return { ok: false, error: parseIpcError(e) };
      }
    },

    setActiveLeaf: async (convId, messageId) => {
      try {
        const path = await getApi().setActiveLeaf({ conversationId: convId, messageId });
        set((state) => ({ byConv: { ...state.byConv, [convId]: path } }));
        return { ok: true };
      } catch (e) {
        return { ok: false, error: parseIpcError(e) };
      }
    },

    updateContent: async (convId, messageId, content) => {
      try {
        const updated = await getApi().updateMessageContent({
          conversationId: convId,
          messageId,
          content,
        });
        set((state) => ({
          byConv: {
            ...state.byConv,
            [convId]: (state.byConv[convId] ?? []).map((m) => (m.id === messageId ? updated : m)),
          },
        }));
        return { ok: true };
      } catch (e) {
        return { ok: false, error: parseIpcError(e) };
      }
    },

    deleteMessages: async (convId, ids) => {
      try {
        const path = await getApi().deleteMessages({ conversationId: convId, ids });
        set((state) => ({ byConv: { ...state.byConv, [convId]: path } }));
        return { ok: true };
      } catch (e) {
        return { ok: false, error: parseIpcError(e) };
      }
    },

    handleDelta: (p) => {
      const buf = pending.get(p.messageId) ?? { content: '', reasoning: '' };
      buf.content += p.delta ?? '';
      buf.reasoning += p.reasoning_delta ?? '';
      pending.set(p.messageId, buf);
      scheduleFlush();
    },

    handleDone: (p) => {
      // 先落残余缓冲，避免结尾丢字
      const buf = clearPendingFor(p.messageId);
      set((state) => {
        const msgs = state.byConv[p.conversationId] ?? [];
        const existing = msgs.find((m) => m.id === p.messageId);
        // done 事件携带的是落库裸消息（无 branch 元数据）；保留 loadFor 路径解析出的
        // branch，否则分支导航在生成完成瞬间消失
        const merged: Message = {
          ...(buf
            ? {
                ...p.message,
                content: p.message.content || buf.content,
                reasoning: p.message.reasoning ?? buf.reasoning,
              }
            : p.message),
          branch: existing?.branch ?? p.message.branch,
        };
        return {
          byConv: {
            ...state.byConv,
            [p.conversationId]: existing
              ? msgs.map((m) => (m.id === p.messageId ? merged : m))
              : [...msgs, merged],
          },
        };
      });
      setGenerating(p.conversationId, false);
    },

    handleError: (p) => {
      clearPendingFor(p.messageId);
      set((state) => {
        const msgs = state.byConv[p.conversationId] ?? [];
        return {
          byConv: {
            ...state.byConv,
            [p.conversationId]: msgs.map((m) =>
              m.id === p.messageId ? { ...m, error: p.error, partial: false } : m,
            ),
          },
        };
      });
      setGenerating(p.conversationId, false);
    },
  };
});

/** 暴露给事件路由的 flush（done/error 前保证缓冲落库态一致） */
export function flushPendingDeltas(): void {
  if (flushTimer !== null) {
    window.clearTimeout(flushTimer);
    flushTimer = null;
  }
  flushFn?.();
}
