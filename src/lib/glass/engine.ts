// @req REQ-2026-006：以可注入驱动管理懒加载引擎的降级、生命周期与资源释放。
import { fadeAttributeChanged } from './geometry';
import type { GlassDiagnostics, GlassFallbackReason, GlassRole } from './types';

export interface GlassSurfaceHooks {
  onReady: (ready: boolean) => void;
  onError: (reason: GlassFallbackReason) => void;
}

export interface GlassDiagnosticUpdate {
  maps: number;
  mapPixels: number;
  mapBuilds: number;
}

export interface GlassDriverStartInput {
  root: HTMLElement;
  content: HTMLElement;
  signal: AbortSignal;
  onDiagnostic: (update: GlassDiagnosticUpdate) => void;
  onDeviceLoss: () => void;
}

export interface GlassDriverSession {
  addSurface: (role: GlassRole, element: HTMLElement, hooks: GlassSurfaceHooks) => () => void;
  setActive: (active: boolean) => void;
  dispose: () => void;
}

export interface GlassDriver {
  start: (input: GlassDriverStartInput) => Promise<GlassDriverSession>;
}

interface DesiredSurface {
  element: HTMLElement;
}

export class GlassEngine {
  private readonly driver: GlassDriver;
  private readonly timeoutMs: number;
  private readonly desired = new Map<GlassRole, DesiredSurface>();
  private readonly unregisterActive = new Map<GlassRole, () => void>();
  private readonly readyTimers = new Map<GlassRole, ReturnType<typeof setTimeout>>();
  private readonly readySurfaces = new Set<GlassRole>();
  private readonly listeners = new Set<(diagnostics: GlassDiagnostics) => void>();
  private session: GlassDriverSession | null = null;
  private abort: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private active = true;
  private disposed = false;
  private diagnostics: GlassDiagnostics = {
    state: 'css', surfaces: 0, maps: 0, mapPixels: 0, mapBuilds: 0,
  };

  constructor(driver: GlassDriver, options: { timeoutMs?: number } = {}) {
    this.driver = driver;
    this.timeoutMs = options.timeoutMs ?? 4_000;
  }

  getDiagnostics(): GlassDiagnostics {
    return { ...this.diagnostics };
  }

  subscribe(listener: (diagnostics: GlassDiagnostics) => void): () => void {
    this.listeners.add(listener);
    listener(this.getDiagnostics());
    return () => this.listeners.delete(listener);
  }

  async start(root: HTMLElement, content: HTMLElement): Promise<void> {
    if (this.disposed || this.diagnostics.state !== 'css') return;
    this.abort = new AbortController();
    this.diagnostics = { ...this.diagnostics, state: 'initializing', reason: undefined };
    this.emit();
    const expired = new Promise<null>((resolve) => {
      this.timer = setTimeout(() => {
        this.abort?.abort();
        this.fallback('timeout');
        resolve(null);
      }, this.timeoutMs);
    });
    try {
      const pending = this.driver.start({
        root,
        content,
        signal: this.abort.signal,
        onDiagnostic: (update) => {
          if (this.disposed) return;
          this.diagnostics = { ...this.diagnostics, ...update };
          this.emit();
        },
        onDeviceLoss: () => this.fallback('device-lost'),
      });
      const session = await Promise.race([pending, expired]);
      if (session === null) {
        void pending.then((late) => late.dispose()).catch(() => undefined);
        return;
      }
      if (this.disposed || this.abort.signal.aborted || this.diagnostics.state === 'fallback') {
        session.dispose();
        return;
      }
      this.clearTimer();
      this.session = session;
      this.diagnostics.state = 'active';
      for (const [role, surface] of this.desired) this.attach(role, surface);
      if (!this.active) session.setActive(false);
      this.emit();
    } catch {
      if (!this.disposed && this.diagnostics.state !== 'fallback') this.fallback('map');
    }
  }

  register(role: GlassRole, element: HTMLElement): () => void {
    if (this.disposed || this.diagnostics.state === 'fallback') return () => undefined;
    const existing = this.desired.get(role);
    if (existing) this.detach(role, existing);
    const surface: DesiredSurface = { element };
    element.dataset.glassRole = role;
    delete element.dataset.glassError;
    this.desired.set(role, surface);
    if (this.session && this.diagnostics.state === 'active') this.attach(role, surface);
    this.emit();
    return () => {
      if (this.desired.get(role) !== surface) return;
      this.detach(role, surface);
      this.emit();
    };
  }

  setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    this.session?.setActive(active);
  }

  fallback(reason: GlassFallbackReason): void {
    if (this.disposed || this.diagnostics.state === 'fallback') return;
    this.abort?.abort();
    this.clearTimer();
    // 先落 fallback 状态：releaseSurfaces 回调里的 onReady(false) 不得再重挂就绪超时。
    this.diagnostics = { ...this.diagnostics, state: 'fallback', reason };
    const session = this.session;
    this.session = null;
    this.releaseSurfaces();
    session?.dispose();
    this.diagnostics = {
      state: 'fallback', surfaces: 0, maps: 0, mapPixels: 0, mapBuilds: this.diagnostics.mapBuilds, reason,
    };
    this.emit();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.abort?.abort();
    this.clearTimer();
    const session = this.session;
    this.session = null;
    this.releaseSurfaces();
    session?.dispose();
    this.diagnostics = { state: 'css', surfaces: 0, maps: 0, mapPixels: 0, mapBuilds: 0 };
    this.emit();
    this.listeners.clear();
  }

  private attach(role: GlassRole, surface: DesiredSurface): void {
    if (!this.session) return;
    const unregister = this.session.addSurface(role, surface.element, {
      onReady: (ready) => {
        if (this.desired.get(role) !== surface || this.disposed) return;
        if (ready) {
          this.readySurfaces.add(role);
          this.clearReadyTimer(role);
        } else {
          this.readySurfaces.delete(role);
          this.armReadyTimer(role, surface);
        }
        // 同值 setAttribute 仍会触发 vendored ticker 的 MutationObserver 自唤醒；仅变化时写。
        if (fadeAttributeChanged(surface.element.dataset.glassActive, ready)) {
          surface.element.dataset.glassActive = String(ready);
        }
        if (ready) delete surface.element.dataset.glassError;
      },
      onError: (reason) => this.surfaceError(role, surface, reason),
    });
    this.unregisterActive.set(role, unregister);
    if (!this.readySurfaces.has(role)) this.armReadyTimer(role, surface);
  }

  /** 表面未就绪时武装超时；已就绪后回落（onReady(false)）需重新武装，驱动静默不再无限挂起。 */
  private armReadyTimer(role: GlassRole, surface: DesiredSurface): void {
    if (this.disposed || this.diagnostics.state !== 'active' || this.readyTimers.has(role)) return;
    this.readyTimers.set(role, setTimeout(() => {
      if (this.desired.get(role) === surface) this.surfaceError(role, surface, 'timeout');
    }, this.timeoutMs));
  }

  private surfaceError(role: GlassRole, surface: DesiredSurface, reason: GlassFallbackReason): void {
    if (this.desired.get(role) !== surface || this.disposed) return;
    surface.element.dataset.glassError = reason;
    this.detach(role, surface);
    if (this.unregisterActive.size === 0) {
      this.fallback(reason);
      return;
    }
    this.diagnostics.reason = reason;
    this.emit();
  }

  private detach(role: GlassRole, surface: DesiredSurface): void {
    this.desired.delete(role);
    this.clearReadyTimer(role);
    this.readySurfaces.delete(role);
    this.unregisterActive.get(role)?.();
    this.unregisterActive.delete(role);
    surface.element.dataset.glassActive = 'false';
  }

  private clearReadyTimer(role: GlassRole): void {
    const timer = this.readyTimers.get(role);
    if (timer) clearTimeout(timer);
    this.readyTimers.delete(role);
  }

  private releaseSurfaces(): void {
    for (const role of this.readyTimers.keys()) this.clearReadyTimer(role);
    this.readySurfaces.clear();
    for (const unregister of this.unregisterActive.values()) unregister();
    this.unregisterActive.clear();
    for (const surface of this.desired.values()) surface.element.dataset.glassActive = 'false';
    this.desired.clear();
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private emit(): void {
    this.diagnostics.surfaces = this.unregisterActive.size;
    for (const listener of this.listeners) listener(this.getDiagnostics());
  }
}
