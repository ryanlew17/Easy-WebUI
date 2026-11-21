# ADR-005: 液态玻璃采用三轨道架构与 vendored 折射引擎

- Status: Accepted
- Date: 2026-11-21
- Deciders: project owner
- Supersedes: —
- Superseded by: —

## Context

Easy WebUI 已有双主题、材质令牌、模糊预算、浮层 portal、缩放补偿和减弱动效支持。现有材质能表达半透明、模糊、边缘与阴影，但不能提供连续轮廓、真实边缘折射和精细的动态光照。全面升级需要同时改善全局视觉质量与关键表面的材质表现，而不是给所有元素叠加更多模糊。

Glass-HQ/liquid-glass（npm `@glass-sdk/liquid-glass`）提供了本项目缺少的真实折射能力：vgpu/WebGPU 生成材质地图，SVG filter 将其作用于实时 DOM。它不截取 DOM 内容，并提供地图缓存、GPU 懒加载、合批渲染和诊断接口。其主要限制也已明确：

- 其 React 组件依赖 React 19 与 Base UI（后者是包的运行依赖而非 peer）。升级 React 19 由独立需求 REQ-2026-005 先行交付，现有控件和浮层行为继续保留。
- 引擎要求显式、有界的场景与内容层，不能采样任意页面背景。
- 本项目生产环境通过 `file://` 和严格 CSP 加载，持久缓存、Worker、地图 URL 与动态 chunk 需要按这一形态适配。
- 上游仍处于 0.0.x 阶段，开发线已有破坏性 API 变化；其性能结果不能直接代表本项目的 Windows/Electron 环境。

本项目还有两项结构约束：浮层默认 portal 到 `document.body`（ADR-002）；气泡、列表行、抽屉等高频或大面积内容不逐实例使用昂贵滤镜。0.0.2 dist 已核实：`addSurface` 的表面几何按视口矩形逐帧测量（相对内容层/根换算），注册时不检查 DOM 包含关系，场景外元素亦可注册，材质作用于表面元素自身；因此 body portal 与场景材质注册可以共存，ADR-002 挂载规则不受影响。

## Decision

采用 **Track A / Track B / Track C 三轨道视觉架构**：

1. **Track A — 全局静态质量**：由本项目设计令牌和原生 CSS 承担，覆盖全部页面。包含材质层级、连续圆角、主题、排版、间距与控件状态，不增加依赖。
2. **Track B — CSS 光学升级**：由本项目自行维护，覆盖多数表面。使用渐变描边、边缘折射环、指针高光、滚动边缘 mask 和轻微色散暗示，形成统一的玻璃观感。
3. **Track C — 真实折射引擎**：常驻表面仅用于聊天输入坞与消息顶栏。采用 vendored Glass-HQ `/core`、`/gpu`、`/dom` 实现，不引入其 React 组件，不通过 npm 引入该包及其依赖树。

Track A+B 是本次升级的完整基础形态；Track C 是可独立移除的增强层。材质适配层只暴露 `composer`、`topbar`、`model-picker`、`generate-pill` 四种语义角色（见 REQ-2026-006），页面不直接接触上游 API。引擎激活后，目标表面使用 SVG 材质输出替代自身的 `backdrop-filter`，不叠加两套主滤镜。

真实折射场景限定为聊天中栏：消息列表作为实时内容层，输入坞和消息顶栏是最多两个常驻折射表面。模型下拉与 Generate 胶囊可保持 `AnchoredPopover` 的 body portal，再由适配层注册为临时表面；它们关闭时必须注销。设置页、Toast、tooltip、模态和其他浮层继续使用 CSS 材质。滚动边缘使用纯 CSS mask，不采用上游 `GlassScrollEdges`。

vendored 代码按 Electron/Chromium 生产目标维护：移除 Firefox 专用路径与 IndexedDB 持久缓存，使用有硬上限的内存缓存，并适配 Worker、地图 `data:` URL 和懒加载。保留 MIT 许可证、版权、来源版本和本地改动记录。上游升级只能通过显式 re-vendor、diff 审查和视觉/性能基准完成，不自动追随 `main`。

React 19 基线由 [REQ-2026-005](../requirements/archive/REQ-2026-005-react-19-upgrade.md) 独立交付；视觉实施范围与验收门槛见 [REQ-2026-006](../requirements/active/REQ-2026-006-liquid-glass-visual-upgrade.md)。

## Consequences

### 收益

- 全局视觉质量由 Track A+B 保证，关键表面再获得真实折射，投入与视觉收益相匹配。
- React 19 由独立 REQ-2026-005 交付；视觉工作保留现有控件行为、键盘交互、portal 定位、消息树与双层缩放成果。
- 材质引擎集中在有界场景，滤镜面积、表面数量和缓存都有明确边界。
- CSS 材质同时承担首帧、降级与无 WebGPU 环境的完整体验。
- vendoring 使生产适配和性能修复可以直接落地，也使上游变更按本项目节奏进入。

### 成本与长期约束

- 本项目需要维护一份经过裁剪的上游渲染代码，包括本地修改清单、类型声明和第三方许可证；不能把它视为无维护成本的静态资源。
- re-vendor 不是简单覆盖文件。每次升级都要重新应用生产适配，审查渲染与缓存差异，并重跑视觉、流式、缩放和性能验收。
- 材质适配层成为页面与引擎之间的稳定边界。新表面默认使用 Track A+B，不得绕过适配层直接在页面中调用上游 API。
- body portal 临时表面继续由 `AnchoredPopover` 定位；适配层负责注册、唤醒、注销和缓存释放。ADR-002 的挂载规则不变。
- 引擎路径需要额外覆盖生产 `file://`、CSP、动态 chunk、GPU device loss 和内存缓存；这些属于 Track C 的固定维护面。
- 性能预算从单纯的“同屏模糊层 ≤5”扩展为层数、过滤像素、滤镜步骤和重绘频率共同约束。现有预算仍然有效。
- 若 Track C 未达到验收门槛，交付收缩为仅输入坞或完全使用 CSS；这一结果不影响 Track A+B 的独立价值。

### 文档与代码责任

实施完成后，`design/ui-liquid-glass.md` 记录现行材质角色与预算，`design/popover.md` 继续记录 portal 纪律，`architecture.md` 补充 vendored 引擎与懒加载边界；本 ADR 保留选型理由，不随参数调整反复改写。

## Alternatives Considered

- **直接 npm 安装并只使用 `/dom`**：REQ-2026-005 后包级 peer（`react` / `react-dom` >=19）虽可干净解析，但安装仍会把本项目不使用的 `@base-ui/react`、`@lisse/core`、`vgpu` 作为普通依赖拉入安装与审计树；且本项目对上游的适配策略是裁剪式源码修改（删除持久缓存与 Firefox 路径、改 Worker 与地图 URL 形态），npm 包无法承载这些改动。vendoring 是与该策略一致的引入方式，React 19 升级本身与是否引入 npm 包无关。
- **全量采用上游 React 组件并持续追新**：需要 Base UI，并重写现有菜单、控件和浮层；成本与回归面明显超过视觉收益，否决。
- **只走 Track A+B**：可以形成完整升级，也是没有真实折射时的最终形态；作为首选上限会放弃输入坞与顶栏的真实位移折射，因此保留为 Track C 之外的基线而非唯一方案。
- **完全自研真实折射引擎**：WGSL 地图、SVG 滤镜编排、缓存与浏览器适配的投入过高，Glass-HQ 已提供可审计的 MIT 实现，否决重复造轮子。
- **body portal 浮层永久不进场景**（动机稿原结论）：核实 0.0.2 源码后，“场景 API 无法跨越 body portal”这一结构前提不成立（`addSurface` 按视口矩形测量、无 DOM 包含检查）。据此仅对模型下拉与 Generate 胶囊开放临时注册（见 Decision），其余 body portal 浮层维持纯 CSS，不为浮层重开通用规则。
- **使用上游 GlassMenu**：技术上可行，React 组件通过 `Menu.Portal container={root}` 进入场景根节点并获得 Base UI 的定位和焦点恢复。但它要求场景根挂载例外、新增 Base UI，并把现有 listbox 选择语义改为 menu；首版不采用。若未来选择该路线，再单独修订 ADR-002，而不是扩大为通用浮层规则。
- **采用上游渐进模糊**：当前存在渐进模糊条带问题，且本项目所需效果可由 CSS mask 表达，否决；滚动边缘不依赖 Track C。
