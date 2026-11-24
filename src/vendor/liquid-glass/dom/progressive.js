// @req REQ-2026-006：滚动边缘与渐进模糊由 Track B CSS 承担，本引擎不实现该路径。
export function createProgressiveLayer() {
  return {
    regions: () => [], update: () => '', outsets: () => 0,
    scrollsContent: () => false, error: () => undefined,
    add: () => () => {}, addScroll: () => () => {}, dispose: () => {},
  };
}

