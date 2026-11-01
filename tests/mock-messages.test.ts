import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '@shared/types';
import { mockApi } from '../src/bridge/mock';

function storageStub() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  };
}

function message(
  id: string,
  parentId: string | null,
  role: 'user' | 'assistant',
  createdAt: number,
): Message {
  return {
    id,
    conversation_id: 'c1',
    parent_id: parentId,
    role,
    content: id,
    reasoning: '',
    token_count: null,
    partial: false,
    error: null,
    created_at: createdAt,
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', storageStub());
  localStorage.setItem('easyui_mock_conversations', JSON.stringify([]));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Mock 消息树共享索引（@req REQ-2026-003）', () => {
  it('分支元数据、下钻切换与重叠删除保持主进程语义', async () => {
    const rows = [
      message('root', null, 'user', 1),
      message('a1', 'root', 'assistant', 2),
      message('a1-child', 'a1', 'user', 3),
      message('a1-leaf', 'a1-child', 'assistant', 4),
      message('a2', 'root', 'assistant', 5),
      message('a2-child', 'a2', 'user', 6),
      message('a2-leaf', 'a2-child', 'assistant', 7),
    ];
    localStorage.setItem('easyui_mock_messages', JSON.stringify(rows));
    localStorage.setItem('easyui_mock_active_leaves', JSON.stringify({ c1: 'a1-leaf' }));

    const initial = await mockApi.listMessages('c1');
    expect(initial.map((m) => m.id)).toEqual(['root', 'a1', 'a1-child', 'a1-leaf']);
    expect(initial[1].branch).toEqual({ index: 1, count: 2, ids: ['a1', 'a2'] });

    const switched = await mockApi.switchBranch({ conversationId: 'c1', messageId: 'a2' });
    expect(switched.map((m) => m.id)).toEqual(['root', 'a2', 'a2-child', 'a2-leaf']);

    await mockApi.setActiveLeaf({ conversationId: 'c1', messageId: 'a1-leaf' });
    const remaining = await mockApi.deleteMessages({ conversationId: 'c1', ids: ['a1', 'a1-child'] });
    expect(remaining.map((m) => m.id)).toEqual(['root', 'a2', 'a2-child', 'a2-leaf']);
    expect(remaining.every((m) => m.branch === undefined)).toBe(true);
  });

  it('1 千条线性消息只排序一次并完整返回激活路径', async () => {
    const rows = Array.from({ length: 1000 }, (_, i) =>
      message(`m${i}`, i === 0 ? null : `m${i - 1}`, i % 2 ? 'assistant' : 'user', i + 1),
    );
    localStorage.setItem('easyui_mock_messages', JSON.stringify(rows));
    localStorage.setItem('easyui_mock_active_leaves', JSON.stringify({ c1: 'm999' }));
    const sort = vi.spyOn(Array.prototype, 'sort');

    const path = await mockApi.listMessages('c1');
    expect(path).toHaveLength(1000);
    expect(path[0].id).toBe('m0');
    expect(path[path.length - 1].id).toBe('m999');
    expect(sort.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('parent 环上的路径与删除有限返回并保留其他根', async () => {
    const rows = [
      message('root', null, 'user', 1),
      message('a', 'b', 'assistant', 2),
      message('b', 'a', 'assistant', 3),
    ];
    localStorage.setItem('easyui_mock_messages', JSON.stringify(rows));
    localStorage.setItem('easyui_mock_active_leaves', JSON.stringify({ c1: 'a' }));

    const path = await mockApi.listMessages('c1');
    expect(path).toHaveLength(2);
    const remaining = await mockApi.deleteMessages({ conversationId: 'c1', ids: ['a'] });
    expect(remaining.map((m) => m.id)).toEqual(['root']);
  });
});


describe('Mock 异常父链激活叶恢复（@req REQ-2026-003）', () => {
  it('父节点缺失时激活叶不写不存在的 ID', async () => {
    const rows = [
      message('survivor', null, 'user', 1),
      message('orphan', 'missing', 'assistant', 2),
    ];
    localStorage.setItem('easyui_mock_messages', JSON.stringify(rows));
    localStorage.setItem('easyui_mock_active_leaves', JSON.stringify({ c1: 'orphan' }));

    const remaining = await mockApi.deleteMessages({ conversationId: 'c1', ids: ['orphan'] });
    expect(remaining.map((m) => m.id)).toEqual(['survivor']);
    const leaves = JSON.parse(localStorage.getItem('easyui_mock_active_leaves') ?? '{}') as Record<string, string | null>;
    expect(leaves.c1).toBeNull();
  });
});


describe('Mock 跨父多目标删除 survivor（@req REQ-2026-003）', () => {
  it('按激活叶 ancestry 回退，而不是由最后一个输入目标决定', async () => {
    const rows = [
      message('root', null, 'user', 1),
      message('a1', 'root', 'assistant', 2),
      message('a1-child', 'a1', 'user', 3),
      message('a1-leaf', 'a1-child', 'assistant', 4),
      message('a1-other', 'a1', 'assistant', 5),
      message('b1', 'root', 'assistant', 6),
      message('b1-leaf', 'b1', 'assistant', 7),
      message('c1', 'root', 'assistant', 8),
    ];
    localStorage.setItem('easyui_mock_messages', JSON.stringify(rows));
    localStorage.setItem('easyui_mock_active_leaves', JSON.stringify({ c1: 'a1-leaf' }));

    const remaining = await mockApi.deleteMessages({
      conversationId: 'c1',
      ids: ['a1-child', 'b1'],
    });
    expect(remaining.map((m) => m.id)).toEqual(['root', 'a1', 'a1-other']);
    const leaves = JSON.parse(localStorage.getItem('easyui_mock_active_leaves') ?? '{}') as Record<string, string | null>;
    expect(leaves.c1).toBe('a1-other');
  });
});
