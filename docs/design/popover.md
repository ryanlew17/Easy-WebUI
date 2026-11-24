# 浮层与定位

> 权威范围：浮层挂载、锚点定位、缩放换算、InfoTip 和临时材质生命周期。
> 何时读取：新增或修改下拉、菜单、tooltip、Toast、Modal、Generate 或选择工具栏之前。
> 代码事实来源：`src/components/Popover.tsx`、`controls.tsx`、`Modal.tsx`、`Toast.tsx`。
> 最后更新：2026-11-25

## 1. 挂载规则

带 `backdrop-filter` 的祖先会形成 backdrop root，后代的模糊只能采样祖先内部；滚动容器的 overflow 还会裁切绝对定位浮层。因此浮层不得留在模糊或滚动祖先内，统一通过 portal 挂到 `document.body`；Toast 使用根级 fixed host，位于顶栏下方并按工作区居中，随工作区尺寸和缩放重定位；默认三栏形态下不得遮挡检查器、输入坞或 Generate 控件。窄窗口下显式打开的覆盖栏占满工作区，或窗口高度容不下 Toast 时，允许 Toast 短暂覆盖。

挂载规则与 ADR-002 一致，不因材质或动画重开场景根节点例外。视觉令牌见 `./ui-liquid-glass.md`。

## 2. AnchoredPopover

`src/components/Popover.tsx` 是锚定浮层基座：

- 默认提供 `.glass-pop`；`variant="bare"` 只负责 portal 和定位，由内容自身承担材质。Generate 使用此变体，单表面材质规则见 `./ui-liquid-glass.md`。
- 支持 placement、align、matchAnchorWidth、gap、16px 默认 viewportMargin、边缘翻转、外点关闭，以及 scroll(capture)、resize、visualViewport 和锚点 ResizeObserver 重定位。
- 缩放优先读取根节点 `--app-zoom`，未设置时才以锚点 rect 宽度 / offsetWidth 自校准；锚点收缩到零宽时不得回退为 1。
- 打开后经 useLayoutEffect 首测和 rAF 复测；定位完成前隐藏，完成后设置 `data-positioned="true"`。
- 保留调用方的 listbox/dialog 语义、焦点和键盘行为；长选项换行由共享控件规则负责。

## 3. InfoTip 与延迟卸载

InfoTip 支持 hover、focus、点击钉住和外点关闭；Esc 行为统一见 `./ux-guidelines.md`。浮层按视口余量上下翻转并横向钳制。

`useDelayedUnmount` 用于退场动画。关闭开始时立即注销临时材质，不等待延迟卸载结束。

## 4. 临时材质边界

只有模型下拉和 Generate 可通过 `GlassMaterialProvider` 注册临时表面，且必须同时满足 mounted 与 `data-positioned="true"`。其他浮层不注册。

**默认不启用真实折射，所有浮层均使用 CSS 材质。** 保留的注册/注销能力仅供未来独立验收后启用，不代表默认行为；引擎边界见 `../architecture.md`。
