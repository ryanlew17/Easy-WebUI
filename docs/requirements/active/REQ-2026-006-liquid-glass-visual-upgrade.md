# REQ-2026-006：液态玻璃视觉系统升级

- 状态：active（外部视觉审查发现待修复问题，暂不交付）
- 目标版本：1.1.0
- 前置需求：[REQ-2026-005](../archive/REQ-2026-005-react-19-upgrade.md)
- 关联决策：[ADR-005](../../adr/ADR-005-liquid-glass-rendering-strategy.md)
- 现行行为：`docs/design/`；验证命令：`docs/release.md`

## 目标与范围

在 React 19 基线上统一应用的页面骨架、材质、轮廓、排版和控件状态，并评估 vendored 真实折射引擎。工作分为 Track A（全局静态质量）、Track B（CSS 光学）和 Track C（真实折射增强）。

不改动消息树、主进程业务行为、IPC、协议适配器、密钥或 Mock 桥契约；不引入 Base UI、GlassMenu、远程视觉资源或移动端支持。

## 最终交付

- 聊天与设置共享 `AppFrame`、15rem 导航、52rem 内容列和可拖宽检查器；64rem 以下检查器转为覆盖栏。设置导航、参数面板和全部设置标签使用同一套字段与分组规则。
- 四档圆角、统一 squircle 渐进增强、语义材质和分离的强调色令牌覆盖深浅主题。内容层保持开放；输入坞是强玻璃锚点，顶栏与浮层按职责使用较克制的材质。
- 输入坞焦点由无裁剪 wrapper 承担；Generate 是单一玻璃胶囊；发送/停止为圆形。选择模式、Toast 和输入坞共享底部基线，浮层继续使用 body portal。
- 滚动渐隐、指针高光、消息统计详情、思考导轨、开放空态和长双语选项换行均已落地。关键状态具有自动化断言和截图证据。
- **Track C 默认不启用。** `GlassMaterialProvider` 输出 `fallback/filter-budget`，保持零表面、零地图；CSS 材质是首帧和永久可用路径。vendored 引擎、适配层、许可证与懒加载产物保留，重新启用必须另经完整生产与性能验收。

当前控件和材质规则以 `docs/design/ui-liquid-glass.md`、`popover.md`、`ux-guidelines.md` 为准，本文不复制其实现清单。

## 验收结论

- [x] 深浅主题、全部页面、主要控件及双层缩放完成统一升级；不支持 `corner-shape` 时普通圆角布局完整。
- [x] 正文与关键控件达到 WCAG AA；焦点、键盘、长内容、内部滚动和命中区无回归。
- [x] 同屏模糊层不超过 5；reduced motion、reduced transparency、forced colors 与各类引擎失败均正确降级。
- [x] 浮层定位、焦点和 listbox/dialog 语义保持；默认 CSS 路径不注册折射表面。
- [x] vendored 代码的来源、许可证、本地改动、本地 Worker、data: 地图和懒加载边界完整。
- [x] 功能、视觉、性能和真实 Electron 生产冒烟通过；独立代码审查与独立视觉审查均完成。

## 验收证据（2026-11-22）

### 功能与视觉

- `npm run typecheck`、`npm test`（29 文件 / 359 项）、`npm run build` 通过。
- `docs/release.md` 所列视觉令牌、焦点、Portal、聊天 UX、UI polish、动效、生产预览、参数/预设、23 状态截图及 Electron 冒烟均实际执行通过。
- 当前 Chrome 与 Chrome 138 分别验证 squircle 和普通圆角回退；真实 Electron 覆盖隔离数据目录、preload/IPC/SQLite、流式停止、多行输入及全部降级路径。
- 独立视觉审查实际读取关键截图；后续欢迎文案、长选项与 2.5rem 渐隐打磨也经过失败断言、修复后回归和真实浏览器读图。

### 最终 UI 的性能 A/B

环境：Windows 10.0.26300、Ryzen 7 9800X3D、Node 26.13.1、Chrome、Electron 45.4.1 / Chromium 156；WebGPU 为 NVIDIA Blackwell。结果仅代表该本机环境。最终 UI 与重构前构建在同机、同数据、同视口下预热并执行 5 组交替 A/B。

| 指标 | 中位数变化 | 结果 |
| --- | ---: | --- |
| 主线程 ScriptDuration / TaskDuration | +1.18% / −2.85% | 通过 10% 门槛 |
| GPU ScriptDuration / TaskDuration | +1.16% / −2.66% | 通过 10% 门槛 |
| 冷启动可交互 / 材质就绪 | +4.20% / +4.17% | 通过；最慢材质就绪 442.21ms |
| 交互 p95 帧间隔 | 最慢 25ms | 通过 33.4ms 门槛 |

静置 Paint=0；两次 GC 后候选内存 7.68→7.68MiB，无单调增长。流式仍按 50ms 节流。`npm run perf`、`perf:gpu`、`perf:glass`、`perf:electron` 均通过。

首屏 gzip JS 在 UX 重构前后为 202,340→202,506 bytes，净增 166 bytes。懒加载 gzip 为 dom 27,968、gpu 59,328、编码器 1,675、Worker 1,311 bytes；默认首屏不加载引擎 chunk。生产及全量依赖审计均为 0。

### Track C 降级决定

真实折射先通过生产 `file://`、动态 chunk、本地 Worker、data: PNG、临时表面生命周期和故障降级验证，再按同一流式 A/B 口径测量：

| 实验范围 | ScriptDuration 回退 | TaskDuration 回退 | 决定 |
| --- | ---: | ---: | --- |
| 输入坞 + 顶栏 | +31.71% | +27.42% | 移除顶栏折射 |
| 仅输入坞 | +25.86% | +22.76% | 超过 10% 门槛，默认完整 CSS |

实验结果不构成真实折射已交付的声明。后续启用不得复用实验截图代替验收。

### 边界

既有生产 CSP 响应头可能阻止 `index.html` 内联启动脚本；该问题在 REQ-2026-005 已存在，本需求未放宽 CSP，探针将其单列。

实施计划、UX 审计和独立性能文档均为中间产物；有效结论已收束至本文，原文件不再保留。
