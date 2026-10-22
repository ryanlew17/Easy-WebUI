/**
 * updater 纯逻辑测试：electron-updater 懒加载，vitest 纯 Node 环境安全。
 * 覆盖：compareSemver、dev/未打包分支、EASYUI_MOCK_UPDATE 演示通道全状态机。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { compareSemver, createUpdater, type UpdaterDeps } from '../electron/updater';
import type { UpdateProgress } from '../shared/types';

function makeDeps(over?: Partial<UpdaterDeps>) {
  const sent: { channel: string; payload: unknown }[] = [];
  const deps: UpdaterDeps = {
    send: (channel, payload) => sent.push({ channel, payload }),
    getVersion: () => '0.1.1',
    isPackaged: () => false,
    getBeta: () => false,
    ...over,
  };
  return { deps, sent };
}

afterEach(() => {
  delete process.env.EASYUI_MOCK_UPDATE;
});

describe('compareSemver', () => {
  it('相等 / patch / minor / major 比较', () => {
    expect(compareSemver('0.1.1', '0.1.1')).toBe(0);
    expect(compareSemver('0.1.2', '0.1.1')).toBe(1);
    expect(compareSemver('0.2.0', '0.1.9')).toBe(1);
    expect(compareSemver('1.0.0', '0.9.9')).toBe(1);
    expect(compareSemver('0.1.0', '0.1.1')).toBe(-1);
  });
  it('容忍 v 前缀与预发布尾签', () => {
    expect(compareSemver('v0.2.0', '0.1.1')).toBe(1);
    expect(compareSemver('0.2.0-beta.1', '0.2.0')).toBe(0);
  });
  it('噪声输入不抛异常', () => {
    expect(compareSemver('abc', '0.1.1')).toBe(0);
  });
});

describe('updater dev/未打包分支', () => {
  it('check 返回 unavailable/dev_mode（不触网不 reject）', async () => {
    const { deps } = makeDeps();
    const u = createUpdater(deps);
    const r = await u.check();
    expect(r).toEqual({ status: 'unavailable', reason: 'dev_mode' });
    expect(u.getState()).toEqual({ phase: 'idle' });
  });
  it('无待下载版本时 download 拒绝 no_update_pending', async () => {
    const { deps } = makeDeps();
    const u = createUpdater(deps);
    await expect(u.download()).rejects.toThrow('no_update_pending');
  });
  it('未下载完成时 install 拒绝', async () => {
    const { deps } = makeDeps();
    const u = createUpdater(deps);
    await expect(u.install()).rejects.toThrow('dev_mode');
  });
});

describe('updater mock 通道（EASYUI_MOCK_UPDATE=1）', () => {
  it('check → available（patch+1）→ download 进度推送 → downloaded → install no-op', async () => {
    process.env.EASYUI_MOCK_UPDATE = '1';
    const { deps, sent } = makeDeps({ isPackaged: () => false });
    const u = createUpdater(deps);

    const r = await u.check();
    expect(r.status).toBe('available');
    if (r.status !== 'available') throw new Error('unreachable');
    expect(r.info.version).toBe('0.1.2');
    expect(r.info.release_notes).toContain('模拟更新');
    expect(r.info.size).toBeGreaterThan(0);
    expect(u.getState().phase).toBe('available');

    const dl = await u.download();
    expect(dl.verified).toBe(true);
    const progresses = sent
      .filter((m) => m.channel === 'update:progress')
      .map((m) => (m.payload as UpdateProgress).percent);
    expect(progresses[0]).toBe(10);
    expect(progresses[progresses.length - 1]).toBe(100);
    expect(u.getState().phase).toBe('downloaded');

    await expect(u.install()).resolves.toBeUndefined();
  }, 10000);

  it('beta 开关反映在 mock 更新说明中；已下载后重复 download 直接成功', async () => {
    process.env.EASYUI_MOCK_UPDATE = '1';
    const { deps } = makeDeps({ isPackaged: () => false, getBeta: () => true });
    const u = createUpdater(deps);
    const r = await u.check();
    if (r.status !== 'available') throw new Error('unreachable');
    expect(r.info.release_notes).toContain('beta');
    await u.download();
    await expect(u.download()).resolves.toEqual({ verified: true });
  }, 10000);
});
