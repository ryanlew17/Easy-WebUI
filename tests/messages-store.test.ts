import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '@shared/types';
import { flushPendingDeltas, useMessagesStore } from '../src/store/messages';

function message(id: string, conversationId: string): Message {
  return {
    id,
    conversation_id: conversationId,
    parent_id: null,
    role: 'assistant',
    content: '',
    reasoning: '',
    token_count: null,
    partial: true,
    error: null,
    created_at: 1,
  };
}

beforeEach(() => {
  vi.stubGlobal('window', {
    setTimeout: () => 1,
    clearTimeout: () => undefined,
  });
  useMessagesStore.setState({
    byConv: {
      c1: [message('m1', 'c1')],
      c2: [message('m2', 'c2')],
    },
    loadedConvs: { c1: true, c2: true },
    generating: {},
  });
});

afterEach(() => {
  flushPendingDeltas();
  vi.unstubAllGlobals();
});

describe('流式增量定向更新（@req REQ-2026-003）', () => {
  it('flush 不扫描或替换无关会话的消息数组', () => {
    let unrelatedScans = 0;
    const unrelated = new Proxy([message('m2', 'c2')], {
      get(target, property, receiver) {
        if (property === 'some') unrelatedScans += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    useMessagesStore.setState((state) => ({
      byConv: { ...state.byConv, c2: unrelated },
    }));
    useMessagesStore.getState().handleDelta({
      conversationId: 'c1',
      messageId: 'm1',
      delta: 'new',
    });
    flushPendingDeltas();

    expect(useMessagesStore.getState().byConv.c1[0].content).toBe('new');
    expect(useMessagesStore.getState().byConv.c2).toBe(unrelated);
    expect(unrelatedScans).toBe(0);
  });

  it('同一消息多次 delta 保持正文与 reasoning 顺序', () => {
    const store = useMessagesStore.getState();
    store.handleDelta({ conversationId: 'c1', messageId: 'm1', delta: 'A', reasoning_delta: 'R1' });
    store.handleDelta({ conversationId: 'c1', messageId: 'm1', delta: 'B', reasoning_delta: 'R2' });
    flushPendingDeltas();

    const updated = useMessagesStore.getState().byConv.c1[0];
    expect(updated.content).toBe('AB');
    expect(updated.reasoning).toBe('R1R2');
  });
});


describe('流式 error 尾部一致性（@req REQ-2026-003）', () => {
  it('error 前未 flush 的正文和 reasoning 不丢失', () => {
    const store = useMessagesStore.getState();
    store.handleDelta({ conversationId: 'c1', messageId: 'm1', delta: 'A', reasoning_delta: 'R1' });
    flushPendingDeltas();
    store.handleDelta({ conversationId: 'c1', messageId: 'm1', delta: 'B', reasoning_delta: 'R2' });
    store.handleError({
      conversationId: 'c1',
      messageId: 'm1',
      error: { code: 'request_failed', message: 'failed' },
    });

    const updated = useMessagesStore.getState().byConv.c1[0];
    expect(updated.content).toBe('AB');
    expect(updated.reasoning).toBe('R1R2');
    expect(updated.error?.code).toBe('request_failed');
  });
});
