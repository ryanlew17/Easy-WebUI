# REQ-2026-006：液态玻璃视觉系统升级

状态：active
来源：owner (视觉升级目标)
前置需求：[REQ-2026-005](./REQ-2026-005-react-19-upgrade.md)（React 19 渲染基线）
关联决策：`docs/adr/ADR-005-liquid-glass-rendering-strategy.md`
关联设计：`docs/design/ui-liquid-glass.md`、`docs/design/popover.md`、`docs/design/ux-guidelines.md`、`docs/architecture.md`、`docs/release.md`
影响模块：`src/styles/`、`src/components/`、`src/pages/`、`src/vendor/liquid-glass/`、`vite.config.mts`、`scripts/`、`tests/`、项目文档
非目标：上游 GlassMenu/Base UI 接入；批量替换既有交互组件与消息树；为气泡、列表行、抽屉或按钮建立独立 GPU 表面；远程视觉资源；移动端支持；主进程业务行为与 Mock 桥契约变更

## 背景

现有界面已经具备完整的双主题和玻璃基础，但材质表现仍主要依赖半透明底色、均匀模糊和阴影。此次升级需要同时完成两件事：提升整个应用的轮廓、层级、排版和控件一致性；在输入坞与消息顶栏引入真实折射，形成明确的高质量视觉锚点。

在 REQ-2026-005 的 React 19 基线上，按 ADR-005 分为 Track A（全局静态质量）、Track B（CSS 光学）和 Track C（vendored 真实折射）。Track A+B 必须完整交付；Track C 按生产验证结果交付输入坞与顶栏、仅输入坞，或保持 CSS 路径。聊天模型下拉和 Generate 胶囊可在该场景中增加临时材质，不属于常驻表面。

## 方案要点

### 1. Track A：全局静态质量

- 重构 `src/styles/tokens.css` 的材质语义，按背景画布、抽屉、常驻 chrome、内容卡片、交互控件、浮层和模态分别管理底色、边缘、高光、阴影与滤镜权限。保留无通栏 hairline、避免卡片套卡片的布局语言。
- 在面板、气泡、输入坞、模态和胶囊上采用 `corner-shape: squircle`，通过 `@supports` 回退到现有 `border-radius`。将 `vite.config.mts` 的 Chrome/Edge CSS 目标提高到 139+，保留其他预览目标和现有双保险压缩声明。
- 分别校准深浅主题的背景、材质、文字、占位符、禁用态和状态色。降低多色渐变与噪点的视觉权重，正文和控件对比度达到 WCAG AA。
- 统一字号、字重、行高、分组间距、列表行和工具栏节奏；统计与 token 数保持等宽数字，中英混排使用现有本地字体栈。
- 统一 hover、pressed、selected、disabled、loading 和 focus-visible 状态。保持 rem 尺寸、`min-w-0` 链、32×32 命中区、内嵌焦点环和现有键盘行为。

### 2. Track B：CSS 光学升级

- 用伪元素、渐变、`mask`/`mask-composite` 实现方向性描边，替代关键玻璃表面的均匀边框；不改变元素布局尺寸。
- 在关键表面边缘使用 2–4px 的窄模糊/亮度环，通过 mask 限定滤镜区域。边缘环与现有模糊层统一计数，同屏不超过 5 层；现有 5 层名额已近占满，模糊环须替换而非新增名额，优先以非滤镜的亮度/色散环表达边缘。
- 输入坞增加指针跟随高光，以 rAF 节流更新 CSS 自定义属性，仅改变小高光层的 transform/opacity，不重建滤镜或地图。
- 消息列表上下缘使用 CSS `mask-image` 渐隐，不引入 `GlassScrollEdges`，不让渐隐遮挡阅读、焦点或滚动操作。
- 以低强度冷暖 inset shadow 表达色散，仅用于关键边缘。高光和发光不扩展到全部气泡与卡片。
- 沿用现有 150/200/300ms 与缓动令牌。`prefers-reduced-motion` 下关闭高光跟随和位移动效；reduced transparency、forced colors 下移除装饰性光学层并保证文字对比度。
- 下拉、菜单、Generate 胶囊、Toast、tooltip、模态继续 portal 到 `document.body`。默认使用 Track A+B；仅聊天模型下拉与 Generate 胶囊可在 Track C 中注册为临时折射表面，其余浮层不进入引擎。

### 3. Track C：vendored 真实折射

#### 3.1 引入与维护

- 将 `@glass-sdk/liquid-glass@0.0.2` 的 `/core`、`/gpu`、`/dom` dist、必要共享模块、类型声明和 `styles.css` 放入 `src/vendor/liquid-glass/`，不作为 npm 运行依赖安装。
- 同目录保留上游 LICENSE、来源 URL、版本、获取日期和本地改动清单；在第三方声明中记录 Glass HQ 版权与 MIT 条款。
- 所有本地适配集中并标记，re-vendor 时逐项复查。上游升级必须显式执行 diff 审查和完整视觉/性能回归。

#### 3.2 Electron/Chromium 适配

- 删除 Firefox `-moz-element()` 分支与 IndexedDB 持久缓存，只保留有像素硬上限的内存缓存；缓存不包含消息内容，不进入备份。
- 检查 vgpu 的 Worker 创建方式。若使用 `blob:`，改为打包产物内的本地文件 Worker；无合适 Worker 路径时使用无 Worker 模式，不放宽 CSP。
- 材质地图图片统一使用 `data:` URL，与现有 `img-src 'self' data:` 一致。
- 通过动态 `import()` 将引擎、WGSL/vgpu 与相关代码放入懒加载 chunk，验证 Vite 相对路径在 Electron `file://` 下可用。CSS 材质先完成首帧，引擎初始化不阻塞会话与输入。

#### 3.3 场景与适配层

- 新增 `GlassMaterialProvider` 材质适配层，只暴露 `composer`、`topbar`、`model-picker`、`generate-pill` 四种语义角色和统一状态；页面组件不直接调用 vendored API。
- 聊天中栏建立唯一有界场景：消息列表为实时内容层，消息顶栏与输入坞为两个常驻表面；设置页和其他页面不创建折射场景。
- 模型下拉与 Generate 胶囊保留现有 `AnchoredPopover`、body portal、定位和键盘行为，由适配层调用 `addSurface` 注册临时材质；关闭时立即注销并释放地图引用。0.0.2 源码已核实 `addSurface` 按视口矩形注册场景外元素、无 DOM 包含要求；生产环境下的绘制正确性与双层缩放几何仍按验收门验证，失败即降级回 CSS。场景需要感知 portal 的指针与位置更新时，由适配层显式唤醒，不改变 ADR-002。
- 首版不使用 `GlassMenu`：其固定 portal 到场景根节点，并引入 Base UI 与 menu 语义；现有模型选择和 Select 保持 listbox 语义。
- 输入坞高度按行数阶梯化取整，避免逐像素增高反复生成地图。地图只在尺寸、半径、DPR、主题或材质参数变化时更新。
- 引擎激活后移除目标表面自身的 `backdrop-filter`，使用 SVG 材质输出替代；指针移动、高光变化与流式 delta 不触发地图重建。
- 页面隐藏或组件卸载时停止动画和场景工作；移除全局常驻滤镜循环，缓存与监听器可完整释放。

#### 3.4 降级与交付门

- 无 WebGPU/adapter、地图失败或超时、GPU device loss、滤镜图超限、reduced transparency、forced colors 或几何验证失败时，切换到 Track A+B 材质。
- 降级由适配层完成，聊天、输入、阅读、选择和设置功能不中断；CSS 材质是首帧和永久可用路径。
- 先验证生产 `file://` + CSP、Worker、地图 URL 与动态 chunk，再接入两个常驻表面；临时表面（模型下拉与 Generate 胶囊）在常驻表面验收通过后接入。顶栏的流式滚动滤镜成本单独验收；未通过则仅保留输入坞，输入坞也未通过则 Track C 整体留在 CSS 路径。

### 4. 验证与性能基准

- 为高度阶梯化、能力检测/降级状态、缓存上限等纯逻辑补充 Vitest；修改代码和测试按项目约定标记 `@req REQ-2026-006`。
- 扩展 `probe-verify-portal.mjs` 与 UI 走查，覆盖材质降级、圆角回退、浮层 body portal、临时表面注册/注销、焦点、双层缩放和内部滚动；保留既有几何断言，并验证浮层关闭后表面数量恢复。
- 扩展截图基线，覆盖静态聊天、流式、滚动、输入坞多行、模型下拉、模态、Toast、选择模式和设置标签。截图前断言主题、语言、缩放及关键状态，动态数据固定。
- 保留 `perf-renderer.mjs` 的 `--disable-gpu` 主线程基准，增加 GPU 开启变体；扩展 Electron 基准覆盖生产 `loadFile`、隔离数据目录和真实材质。
- 性能场景包含流式滚动穿越顶栏、多行输入、窗口 resize、右栏拖拽、双层缩放、主题切换、浮层/模态反复开关及 adapter 失败/device loss。
- 视觉性能对比在同机、同数据、同视口下预热并执行至少 5 次 A/B 交替，报告中位数与范围。至少完成一次集显或较低性能 Windows 设备验证。
- 记录滤镜覆盖面积、过滤像素、实际重绘、地图构建与缓存、帧间隔、长任务、主线程指标和内存，不以 React render 或 rAF 次数替代真实滤镜成本。

### 5. 交付顺序与文档

按 **Track A → Track B → Track C 生产验证与接入 → 全量回归** 交付。Track C 的移除不影响前两轨道。

完成后回写 `design/ui-liquid-glass.md`、`design/popover.md`、`architecture.md` 和验证文档；代码、截图、基准结果与本需求最终状态保持一致。若新增用户可见文案，同步中英文语言包；本需求不修改主进程业务行为，无需同步 Mock 桥。

## 验收标准

### 全局视觉与交互

- [ ] 深浅主题、全部页面和主要控件完成统一材质、连续轮廓、排版与状态升级；不支持 `corner-shape` 时普通圆角布局完整。
- [ ] 文字与关键控件对比度达到 WCAG AA；长内容、内部滚动、焦点、命中区和键盘行为无回归。
- [ ] 渐变描边、窄边缘环、输入坞高光、滚动渐隐和轻微色散按语义使用，同屏玻璃模糊层仍不超过 5。
- [ ] reduced motion、reduced transparency、forced colors 下装饰效果正确降级；双层缩放范围均通过走查。
- [ ] 所有浮层和模态仍 portal 到 `document.body`；仅聊天模型下拉与 Generate 胶囊可注册临时场景表面，其余浮层只使用 CSS 材质。

### Vendored 引擎

- [ ] `src/vendor/liquid-glass/` 仅承载选定的 0.0.2 模块与必要共享文件，许可证、来源和本地改动完整；在 REQ-2026-005 的 React 19 基线上，不新增 Base UI、GlassMenu 或该包的 npm 运行依赖。
- [ ] 引擎在生产 Electron `file://` + 当前 CSP 下可加载，Worker、地图 `data:`、动态 chunk 和内存缓存按适配策略工作。
- [ ] 页面只通过材质适配层使用引擎；常驻折射最多覆盖消息顶栏与输入坞，临时折射仅覆盖模型下拉与 Generate 胶囊，最终范围以验收记录为准。
- [ ] 临时浮层保持现有定位、焦点和键盘行为，关闭后注销表面并恢复数量；双层缩放下折射区域与浮层边缘一致。
- [ ] 输入坞高度阶梯化生效；流式、高光和指针事件不重建地图；引擎表面不叠加自身 `backdrop-filter`。
- [ ] WebGPU 不可用、地图失败、device loss、透明度/强制颜色偏好和几何失败时，均自动使用完整 CSS 材质。

### 性能门槛

- [ ] 冷启动最慢一次 <3s，同机中位数相对基线回退 ≤10%。
- [ ] 首屏 gzip JavaScript 净增 ≤50 KiB；引擎位于懒加载 chunk，并单独记录其体积。
- [ ] 流式仍按 50ms 节流；脚本与 TaskDuration 中位数回退 ≤10%，无玻璃归因的 >50ms 长任务。
- [ ] 滚动、拖拽与浮层场景以 60fps 为目标，p95 帧间隔 ≤33.4ms，无持续可见卡顿。
- [ ] 稳定空闲后无持续 rAF、GPU 提交或滤镜重绘；地图和表面数量不单调增长。
- [ ] 地图缓存具有明确像素硬上限；30 次 resize/主题/浮层循环并静置回收后无单调内存增长。

### 工程验收

- [ ] `npm run typecheck`、`npm test`、`npm run build` 全量通过。
- [ ] `probe-verify-portal.mjs`、`e2e-ui-polish.mjs`、截图流程及新增材质/降级检查通过。
- [ ] `npm run perf`、GPU 变体和 `npm run perf:electron` 完成，门槛数据与运行环境记录在下方验收记录。
- [ ] 真实 Electron 生产 `file://` 冒烟通过；最终设计文档、ADR 引用、第三方声明和截图与交付行为一致。

## 验收记录

待实施。最终仅保留实际交付范围、验证命令、性能数据和未覆盖边界。
