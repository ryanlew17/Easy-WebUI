import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';

export type InspectorMode = 'grid' | 'overlay';

// @req REQ-2026-006：聊天与设置共享导航、工作区和检查器网格。
export function AppFrame({
  navigation,
  children,
  inspector,
  inspectorWidth,
  onInspectorModeChange,
}: {
  navigation: ReactNode;
  children: ReactNode;
  inspector?: ReactNode;
  inspectorWidth?: string;
  onInspectorModeChange?: (mode: InspectorMode) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const style = inspector && inspectorWidth
    ? { '--inspector-width': inspectorWidth } as CSSProperties
    : undefined;

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !onInspectorModeChange) return;
    let previous: InspectorMode | null = null;
    const update = (): void => {
      const mode = getComputedStyle(root).getPropertyValue('--inspector-layout').trim();
      const next: InspectorMode = mode === 'overlay' ? 'overlay' : 'grid';
      if (next === previous) return;
      previous = next;
      onInspectorModeChange(next);
    };
    update();
    const fontObserver = new MutationObserver(update);
    fontObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => {
        fontObserver.disconnect();
        window.removeEventListener('resize', update);
      };
    }
    const observer = new ResizeObserver(update);
    observer.observe(root);
    return () => {
      fontObserver.disconnect();
      observer.disconnect();
    };
  }, [onInspectorModeChange]);

  return (
    <div ref={rootRef} className="app-frame" data-has-inspector={inspector ? 'true' : 'false'} style={style}>
      {navigation}
      <main className="app-stage">{children}</main>
      {inspector}
    </div>
  );
}
