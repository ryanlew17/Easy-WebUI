# ADR-002: 一切浮层 portal 到 body（Popover Portal）

- Status: Accepted
- Date: 2026-09-13
- Deciders: project owner
- Supersedes: —
- Superseded by: —

## Context

液态玻璃视觉系统大量使用 `backdrop-filter`。CSS 规范行为：**祖先带 `backdrop-filter` 会形成 backdrop root，其后代的模糊只能采样祖先内部内容**——结果是嵌套在玻璃面板（如 `.glass-bar`）内的浮层模糊视觉失效。v1.0.1 之前下拉/提示类浮层曾作为模糊祖先的 DOM 子孙渲染，出现"浮层不透/模糊错乱"的视觉缺陷。另一诱因：宿主滚动容器 `overflow-y-auto` 会裁切容器内绝对定位浮层。

## Decision

**所有浮层（下拉、弹层、tooltip、悬浮提示、生成胶囊、InfoTip）一律 `createPortal(document.body)` 渲染**，绝不作为 `.glass-bar` 等模糊祖先的 DOM 子孙；统一走 `src/components/Popover.tsx`（`AnchoredPopover`）基座：锚点 rect → `fixed` 定位、placement/align、`matchAnchorWidth`、滚动/resize/visualViewport 重定位、边缘翻转、外点关闭。InfoTip 同规则（三态显隐 + 钉住态）。现行规则见 `../design/popover.md`。

## Consequences

- 浮层定位需自行处理锚定、翻转、视口钳制（`AnchoredPopover` 已封装），且定位计算必须遵守"视觉 px / 布局 px"换算纪律（应用内 CSS zoom 下锚定不漂移）。
- 换取：模糊效果正确、不受宿主裁切；v1.0.1 以此根治浮层模糊问题。
- 新增浮层组件的隐性约束：**不 portal 到 body 就是 bug**（AGENTS.md 硬约束 9）。

## Alternatives Considered

- **浮层留在 DOM 原位、给祖先去掉 `backdrop-filter`**：破坏玻璃视觉系统，否决。
- **每处浮层手写 fixed 定位**：重复实现锚定/翻转/钳制逻辑，易漂移出 bug，否决——统一收敛到 `AnchoredPopover`。
