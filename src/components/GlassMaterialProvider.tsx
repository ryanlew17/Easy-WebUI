// @req REQ-2026-006：聊天中栏唯一材质场景；页面只接触语义角色。
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { readGlassCapabilities, resolveGlassCapabilities } from '../lib/glass/capabilities';
import { createVendoredGlassDriver } from '../lib/glass/driver';
import { GlassEngine } from '../lib/glass/engine';
import type { GlassRole } from '../lib/glass/types';

const GlassEngineContext = createContext<GlassEngine | null>(null);

// @req REQ-2026-006：仅输入坞的 GPU 门槛仍超 10%，默认使用完整 CSS 材质。
const REAL_REFRACTION_ENABLED = document.documentElement.dataset.glassEngine === 'enabled';

export function GlassMaterialProvider({
  rootRef,
  contentRef,
  sessionKey,
  children,
}: {
  rootRef: RefObject<HTMLElement | null>;
  contentRef: RefObject<HTMLElement | null>;
  sessionKey: string;
  children: ReactNode;
}) {
  const [engine, setEngine] = useState<GlassEngine | null>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const root = rootRef.current;
    if (!REAL_REFRACTION_ENABLED) {
      if (root) {
        root.dataset.glassState = 'fallback';
        root.dataset.glassReason = 'filter-budget';
        root.dataset.glassSurfaces = '0';
        root.dataset.glassMaps = '0';
        root.dataset.glassMapPixels = '0';
        root.dataset.glassMapBuilds = '0';
      }
      setEngine(null);
      return;
    }
    const content = contentRef.current;
    if (!sessionKey || !root || !content) {
      setEngine(null);
      return;
    }
    const next = new GlassEngine(createVendoredGlassDriver());
    setEngine(next);
    const unsubscribe = next.subscribe((diagnostics) => {
      root.dataset.glassState = diagnostics.state;
      root.dataset.glassReason = diagnostics.reason ?? '';
      root.dataset.glassSurfaces = String(diagnostics.surfaces);
      root.dataset.glassMaps = String(diagnostics.maps);
      root.dataset.glassMapPixels = String(diagnostics.mapPixels);
      root.dataset.glassMapBuilds = String(diagnostics.mapBuilds);
    });
    const reducedTransparency = window.matchMedia('(prefers-reduced-transparency: reduce)');
    const forcedColors = window.matchMedia('(forced-colors: active)');
    const applyCapabilities = (): void => {
      const result = resolveGlassCapabilities(readGlassCapabilities());
      if (!result.enabled) next.fallback(result.reason);
    };
    const onVisibility = (): void => next.setActive(!document.hidden);
    reducedTransparency.addEventListener('change', applyCapabilities);
    forcedColors.addEventListener('change', applyCapabilities);
    document.addEventListener('visibilitychange', onVisibility);
    onVisibility();
    rafRef.current = requestAnimationFrame(() => {
      const result = resolveGlassCapabilities(readGlassCapabilities());
      if (result.enabled) void next.start(root, content);
      else next.fallback(result.reason);
    });
    return () => {
      cancelAnimationFrame(rafRef.current);
      reducedTransparency.removeEventListener('change', applyCapabilities);
      forcedColors.removeEventListener('change', applyCapabilities);
      document.removeEventListener('visibilitychange', onVisibility);
      // 先 dispose 再解除订阅：归零诊断经订阅写入根节点，避免残留上一会话的表面/地图计数。
      next.dispose();
      unsubscribe();
    };
  }, [rootRef, contentRef, sessionKey]);

  return <GlassEngineContext.Provider value={engine}>{children}</GlassEngineContext.Provider>;
}

export function useGlassSurface(
  role: GlassRole,
  ref: RefObject<HTMLElement | null>,
  active = true,
): void {
  const engine = useContext(GlassEngineContext);
  useEffect(() => {
    const element = ref.current;
    if (!engine || !active || !element) return;
    let unregister: (() => void) | undefined;
    const temporary = role === 'model-picker' || role === 'generate-pill';
    const register = (): void => {
      if (unregister || !element.isConnected) return;
      if (temporary && element.dataset.positioned !== 'true') return;
      unregister = engine.register(role, element);
    };
    const observer = temporary ? new MutationObserver(register) : null;
    observer?.observe(element, { attributes: true, attributeFilter: ['data-positioned'] });
    register();
    return () => {
      observer?.disconnect();
      unregister?.();
    };
  }, [engine, role, ref, active]);
}
