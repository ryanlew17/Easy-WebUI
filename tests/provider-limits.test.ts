import { afterEach, describe, expect, it, vi } from 'vitest';
import { IPC } from '../shared/ipc-constants';
import { registerIpcHandlers, type IpcDeps } from '../electron/ipc';
import { mockApi } from '../src/bridge/mock';

type Handler = (event: unknown, ...args: unknown[]) => unknown;
const handlers = vi.hoisted(() => new Map<string, Handler>());

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: Handler) => {
      handlers.set(channel, handler);
    },
  },
  dialog: {},
  shell: {},
}));

const models = (count: number) =>
  Array.from({ length: count }, () => ({ id: 'model', enabled: true }));

function localStorageStub() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  };
}

afterEach(() => {
  handlers.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('平台模型数量上限（@req REQ-2026-002）', () => {
  it('主进程 IPC 在调用 DAO 前拒绝超过 2000 个模型', async () => {
    const update = vi.fn();
    registerIpcHandlers({ providers: { update } } as unknown as IpcDeps);
    const handler = handlers.get(IPC.updateProvider);
    expect(handler).toBeDefined();
    let rejection: unknown;
    try {
      await handler!(
        { senderFrame: { url: 'file:///E:/EasyWebUI/dist/index.html' } },
        'provider-id',
        { models: models(2001) },
      );
    } catch (e) {
      rejection = e;
    }
    const { parseIpcError } = await import('../shared/errors');
    expect(parseIpcError(rejection).code).toBe('invalid_input');
    expect(update).not.toHaveBeenCalled();
  });

  it('Web mock 桥采用同一上限', async () => {
    vi.stubGlobal('localStorage', localStorageStub());
    const provider = await mockApi.createProvider({
      name: 'Test',
      base_url: 'https://api.test.com',
      api_format: 'openai-chat',
    });
    await expect(
      mockApi.updateProvider(provider.id, { models: models(2001) }),
    ).rejects.toThrow('invalid_input');
  });

  it('模型检测数据拒绝非有限延迟，且在调用 DAO 前失败', async () => {
    const update = vi.fn(() => ({ id: 'provider-id' }));
    registerIpcHandlers({ providers: { update } } as unknown as IpcDeps);
    const handler = handlers.get(IPC.updateProvider);
    expect(handler).toBeDefined();
    let rejection: unknown;
    try {
      await handler!(
        { senderFrame: { url: 'file:///E:/EasyWebUI/dist/index.html' } },
        'provider-id',
        {
          models: [
            {
              id: 'model',
              enabled: true,
              last_check: { status: 'ok', latency_ms: Number.POSITIVE_INFINITY },
            },
          ],
        },
      );
    } catch (e) {
      rejection = e;
    }
    const { parseIpcError } = await import('../shared/errors');
    expect(parseIpcError(rejection).code).toBe('invalid_input');
    expect(update).not.toHaveBeenCalled();
  });

  it('Web mock 桥同样拒绝非有限模型检测数据', async () => {
    vi.stubGlobal('localStorage', localStorageStub());
    const provider = await mockApi.createProvider({
      name: 'Test',
      base_url: 'https://api.test.com',
      api_format: 'openai-chat',
    });
    await expect(
      mockApi.updateProvider(provider.id, {
        models: [
          {
            id: 'model',
            enabled: true,
            last_check: { status: 'ok', latency_ms: Number.POSITIVE_INFINITY },
          },
        ],
      }),
    ).rejects.toThrow('invalid_input');
  });
});
