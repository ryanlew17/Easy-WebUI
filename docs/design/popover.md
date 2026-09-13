# 浮层与模糊（portal 规则）

> 适用范围：一切浮层（下拉、弹层、tooltip、悬浮提示、生成胶囊、InfoTip）的 DOM 挂载规则与定位行为。
> 何时读取：新增/修改任何浮层组件之前——**浮层不 portal 到 body 就是 bug**。
> 关联需求：无（v1.0.1 现状快照，portal 规则自 v1.0.1 确立）。
> 最后更新：2026-09-13
> 来源：原 prd.md §5.6 + 原 docs/impl-contract.md §10.3

## 1. backdrop root 规律（根因）

**祖先带 `backdrop-filter` 会形成 backdrop root，其后代的模糊只能采样祖先内部内容 → 视觉失效。**

因此：**一切浮层（下拉、弹层、tooltip、悬浮提示、生成胶囊）必须 `createPortal(document.body)`**，不得是 `.glass-bar` 等模糊祖先的 DOM 子孙。

另一动机：宿主滚动容器 `overflow-y-auto` 会裁切容器内绝对定位浮层。

## 2. AnchoredPopover（`src/components/Popover.tsx`）

统一浮层基座，能力：

- 锚点 rect → `fixed` 定位、placement/align、`matchAnchorWidth`、gap/viewportMargin。
- 滚动 / resize / visualViewport 重定位、边缘翻转、外点关闭。
- 定位计算遵守"视觉 px / 布局 px"换算纪律（应用内 CSS zoom 下锚定不漂移）。

## 3. InfoTip（参数 ⓘ，`controls.tsx`）

- hover/focus/click 三态显隐 + 钉住态（Esc / 点外关闭）。
- 浮层 portal 到 body + fixed 定位；按视口余量自动上/下翻转，横向钳制视口内。
