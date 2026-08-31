/**
 * 消息状态 + 流式编排：
 * - 事件（onChatDelta/Done/Error）在 App 层统一挂载后路由到这里；
 * - delta 进入增量缓冲，50ms 节流 flush 进 React 状态（kimi.md §9 性能预算）；
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
  regenerate?: boolean;
  fromMessageId?: string;
}

interface MessagesState {
  byConv: Record<string, Message[]>;
  loadedConvs: Record<string, boolean>;
  generating: Record<string, boolean>;

  loadFor: (convId: string) => Promise<void>;
  send: (
    convId: string,
    content: string,
    opts?: SendOptions,
  ) => Promise<{ ok: boolean; error?: ApiError }>;
  stop: (convId: string) => Promise<void>;

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
          regenerate: opts?.regenerate,
          fromMessageId: opts?.fromMessageId,
        });
        // 重载以拿到落库的 user/assistant 占位消息（regenerate 时也会反映分叉删除）
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
        const exists = msgs.some((m) => m.id === p.messageId);
        const merged: Message = buf
          ? {
              ...p.message,
              content: p.message.content || buf.content,
              reasoning: p.message.reasoning ?? buf.reasoning,
            }
          : p.message;
        return {
          byConv: {
            ...state.byConv,
            [p.conversationId]: exists
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
