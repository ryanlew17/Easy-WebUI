import type { CSSProperties, ReactNode } from 'react';

// @req REQ-2026-006：聊天与设置共享导航、工作区和检查器网格。
export function AppFrame({
  navigation,
  children,
  inspector,
  inspectorWidth,
}: {
  navigation: ReactNode;
  children: ReactNode;
  inspector?: ReactNode;
  inspectorWidth?: string;
}) {
  const style = inspector && inspectorWidth
    ? { '--inspector-width': inspectorWidth } as CSSProperties
    : undefined;
  return (
    <div className="app-frame" data-has-inspector={inspector ? 'true' : 'false'} style={style}>
      {navigation}
      <main className="app-stage">{children}</main>
      {inspector}
    </div>
  );
}
