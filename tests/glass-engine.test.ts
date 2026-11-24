import { describe, expect, it, vi } from 'vitest';
import {
  GlassEngine,
  type GlassDriver,
  type GlassDriverSession,
  type GlassSurfaceHooks,
} from '../src/lib/glass/engine';

// @req REQ-2026-006：以驱动替身覆盖 GPU 外部边界；状态转换与被测引擎均为真实实现。
const root = { dataset: {} } as unknown as HTMLElement;
const content = { dataset: {} } as unknown as HTMLElement;
const composer = { dataset: {} } as unknown as HTMLElement;
const topbar = { dataset: {} } as unknown as HTMLElement;

function driverHarness(startImpl?: GlassDriver['start']) {
  const registrations = new Map<string, { element: HTMLElement; hooks: GlassSurfaceHooks }>();
  const session: GlassDriverSession = {
    addSurface: vi.fn((role, element, hooks) => {
      registrations.set(role, { element, hooks });
      return () => registrations.delete(role);
    }),
    setActive: vi.fn(),
    dispose: vi.fn(),
  };
  const driver: GlassDriver = { start: startImpl ?? (vi.fn(async () => session) as GlassDriver['start']) };
  return { driver, session, registrations };
}

describe('@req REQ-2026-006 glass engine lifecycle', () => {
  it('replays desired surfaces after asynchronous initialization', async () => {
    const { driver, registrations } = driverHarness();
    const engine = new GlassEngine(driver);
    engine.register('composer', composer);
    expect(registrations.size).toBe(0);
    await engine.start(root, content);
    expect(registrations.get('composer')?.element).toBe(composer);
    expect(engine.getDiagnostics()).toMatchObject({ state: 'active', surfaces: 1 });
    engine.dispose();
  });

  it('disposes a late session after initialization timeout', async () => {
    let resolveStart: ((session: GlassDriverSession) => void) | undefined;
    const { session } = driverHarness();
    const driver: GlassDriver = {
      start: vi.fn(() => new Promise<GlassDriverSession>((resolve) => { resolveStart = resolve; })),
    };
    const engine = new GlassEngine(driver, { timeoutMs: 5 });
    await engine.start(root, content);
    expect(engine.getDiagnostics()).toMatchObject({ state: 'fallback', reason: 'timeout' });
    resolveStart?.(session);
    await Promise.resolve();
    expect(session.dispose).toHaveBeenCalledTimes(1);
    expect(engine.getDiagnostics().state).toBe('fallback');
  });

  it('unregisters immediately and disposes idempotently', async () => {
    const { driver, session, registrations } = driverHarness();
    const engine = new GlassEngine(driver);
    await engine.start(root, content);
    const unregister = engine.register('composer', composer);
    engine.register('topbar', topbar);
    unregister();
    expect(registrations.has('composer')).toBe(false);
    expect(registrations.has('topbar')).toBe(true);
    engine.dispose();
    engine.dispose();
    expect(session.dispose).toHaveBeenCalledTimes(1);
    expect(engine.getDiagnostics().surfaces).toBe(0);
  });

  it('falls back to CSS on device loss and startup failure', async () => {
    const { driver, session } = driverHarness();
    const engine = new GlassEngine(driver);
    await engine.start(root, content);
    const startInput = (driver.start as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    startInput?.onDeviceLoss();
    expect(engine.getDiagnostics()).toMatchObject({ state: 'fallback', reason: 'device-lost' });
    expect(session.dispose).toHaveBeenCalledTimes(1);

    const failed = new GlassEngine({ start: async () => { throw new Error('map failed'); } });
    await failed.start(root, content);
    expect(failed.getDiagnostics()).toMatchObject({ state: 'fallback', reason: 'map' });
  });

  it('falls back only the failing surface on a map or geometry error', async () => {
    const { driver, registrations } = driverHarness();
    const engine = new GlassEngine(driver);
    await engine.start(root, content);
    engine.register('composer', composer);
    engine.register('topbar', topbar);
    registrations.get('composer')?.hooks.onError('map');
    expect(registrations.has('composer')).toBe(false);
    expect(registrations.has('topbar')).toBe(true);
    expect(engine.getDiagnostics()).toMatchObject({ state: 'active', surfaces: 1, reason: 'map' });
    engine.dispose();
  });

  it('falls back the whole scene when its last surface fails', async () => {
    const { driver, registrations, session } = driverHarness();
    const engine = new GlassEngine(driver);
    await engine.start(root, content);
    engine.register('composer', composer);
    registrations.get('composer')?.hooks.onError('map');
    expect(engine.getDiagnostics()).toMatchObject({ state: 'fallback', reason: 'map', surfaces: 0 });
    expect(session.dispose).toHaveBeenCalledTimes(1);
    engine.dispose();
  });

  it('times out a surface that never becomes ready', async () => {
    const { driver, registrations } = driverHarness();
    const engine = new GlassEngine(driver, { timeoutMs: 5 });
    await engine.start(root, content);
    engine.register('topbar', topbar);
    registrations.get('topbar')?.hooks.onReady(true);
    engine.register('composer', composer);
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(registrations.has('composer')).toBe(false);
    expect(registrations.has('topbar')).toBe(true);
    expect(engine.getDiagnostics()).toMatchObject({ state: 'active', reason: 'timeout', surfaces: 1 });
    engine.dispose();
  });

  it('re-arms the ready timeout when a ready surface drops back to not-ready', async () => {
    const { driver, registrations } = driverHarness();
    const engine = new GlassEngine(driver, { timeoutMs: 5 });
    await engine.start(root, content);
    engine.register('composer', composer);
    registrations.get('composer')?.hooks.onReady(true);
    registrations.get('composer')?.hooks.onReady(false);
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(registrations.has('composer')).toBe(false);
    expect(engine.getDiagnostics()).toMatchObject({ state: 'fallback', reason: 'timeout', surfaces: 0 });
    engine.dispose();
  });

  // 同值 setAttribute 仍会触发 vendored ticker 的 MutationObserver 自唤醒，必须仅在变化时写。
  it('writes glassActive only when readiness changes', async () => {
    const { driver, registrations } = driverHarness();
    const engine = new GlassEngine(driver);
    await engine.start(root, content);
    let writes = 0;
    const dataset = new Proxy({} as Record<string, string>, {
      set(target, key, value) {
        if (key === 'glassActive') writes += 1;
        return Reflect.set(target, key, value);
      },
    });
    const element = { dataset } as unknown as HTMLElement;
    engine.register('composer', element);
    const hooks = registrations.get('composer')?.hooks;
    hooks?.onReady(true);
    hooks?.onReady(true);
    hooks?.onReady(true);
    expect(writes).toBe(1);
    hooks?.onReady(false);
    expect(writes).toBe(2);
    engine.dispose();
  });

  it('pauses and resumes the existing session without duplicate registrations', async () => {
    const { driver, session, registrations } = driverHarness();
    const engine = new GlassEngine(driver);
    await engine.start(root, content);
    engine.register('composer', composer);
    engine.setActive(false);
    engine.setActive(true);
    expect(session.setActive).toHaveBeenNthCalledWith(1, false);
    expect(session.setActive).toHaveBeenNthCalledWith(2, true);
    expect(registrations.size).toBe(1);
    engine.dispose();
  });
});
