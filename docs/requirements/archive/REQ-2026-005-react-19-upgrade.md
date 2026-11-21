# REQ-2026-005：React 19 渲染基线升级

状态：done
来源：owner (长期技术栈、类型能力与组件生态维护决策)
关联设计：`docs/architecture.md`、`docs/design/popover.md`、`docs/design/ux-guidelines.md`、`docs/release.md`
影响模块：`package.json`、`package-lock.json`、`src/`、`tests/`、构建与验证脚本、项目文档
非目标：引入 Glass-HQ 或 Base UI；使用 React 19 新 API 重写业务状态；视觉参数调整；SSR/Server Components；主进程业务行为、IPC 与 Mock 桥契约变更

## 背景

React 19 是后续组件生态、类型能力和长期维护的基线。项目当前源码以函数组件、`createRoot`、受控组件和 portal 为主，没有旧式挂载 API 或 class 组件迁移负担；`react-i18next`、`react-markdown`、Zustand 等直接依赖的 peer 范围已覆盖 React 19。迁移以版本升级和回归验证为主，为 REQ-2026-006 及后续开发提供统一基础。

## 方案要点

### 1. 升级依赖与类型

- 将 `react`、`react-dom` 升级为 19.3.1，将 `@types/react`、`@types/react-dom` 升级为 19.3.0，并更新锁文件中的配套依赖。
- 保持 npm 标准 peer 解析；不使用 `--legacy-peer-deps`、绕过 peer 的 override 或重复 React 实例。
- 依据实际类型检查结果修正 ref 回调、组件 props 和事件类型。保留现有 `createRoot`、`StrictMode`、组件结构与状态管理，不做新 API 驱动的重写。

### 2. 回归关键交互

- 覆盖受控输入、textarea 自适应、消息流式更新、Zustand 外部 store、Markdown/代码块、模态焦点、Select/listbox 键盘导航和 portal 浮层。
- 检查 StrictMode 下 effect/ref 的挂载与清理，确认没有重复订阅、重复初始化或卸载后的状态更新。
- 保持应用内 50%–250% 缩放、浏览器 67%–200% 缩放、reduced motion/transparency、焦点环和中英文布局行为。
- 仅为迁移暴露的行为缺口补充测试；现有业务测试和性能基准继续作为回归门槛。

### 3. 独立交付与文档

- 本需求先于液态玻璃 REQ-2026-006 完成并单独验收，视觉文件与 vendored 引擎不在本需求中改动。
- 完成后更新 `docs/architecture.md`、`AGENTS.md` 及实际涉及的文档版本说明；不提前把待升级版本写成现行事实。

## 验收标准

- [x] 干净 `npm ci` 成功，无 peer 冲突、忽略 peer 的安装参数或重复 React；运行时代码实际使用 React/React DOM 19.3.1。
- [x] `npm run typecheck`、`npm test`、`npm run build` 通过，生产与全量 `npm audit` 不引入新漏洞。
- [x] Web 预览与真实 Electron 均可完成建平台、检测模型、建会话、流式对话、停止/取消、改参数、切主题/语言和设置操作。
- [x] StrictMode 无新增警告或重复副作用；受控输入、Markdown、外部 store、模态焦点和键盘行为正常。
- [x] 模型下拉、Select、Generate 胶囊、InfoTip、Toast 与模态定位/层级正常，双层缩放和既有 portal 探针通过。
- [x] `npm run perf` 与 `npm run perf:electron` 通过；冷启动最慢一次 <3s，同机主线程与冷启动中位数相对迁移前基线回退不超过 10%。
- [x] 最终架构文档、版本声明和验收记录与安装及运行结果一致。

## 验收记录

2026-11-21 项目内自验通过。

- 实现：`react` / `react-dom` 升级为 `^19.3.1`，`@types/react` / `@types/react-dom` 升级为 `^19.3.0`；锁文件经标准 npm peer 解析更新。类型检查未发现需要修改的 ref、props 或事件类型，保留现有 `createRoot`、`StrictMode`、组件与状态结构。生产 bundle 中的 React / React DOM 版本均为 19.3.1，依赖树无重复实例。
- 静态回归：Node 26.13.1 下干净 `npm ci` 成功；`npm run typecheck`、`npm test`（22 个文件 / 315 项）及 `npm run build` 通过；`npm audit --omit=dev` 与全量 `npm audit` 均为 0。
- Web 回归：使用 Chrome 158 执行 `e2e-preview-static.mjs`、`probe-verify-portal.mjs`、`e2e-ui-polish.mjs`、`e2e-chat-ux.mjs`、`e2e-ui-motion.mjs`、`probe-zoom-blur.mjs` 与 `zoom-probe.mjs`，全部通过；覆盖建平台/模型、会话与流式 Markdown、参数、主题/语言、应用缩放、模态/焦点、Toast、InfoTip、Generate 与 portal 几何。`e2e-chat-ux.mjs` 的陈旧 `.ctx-tip` 选择器改为按 portal 的 `role="tooltip"` 和上下文百分比定位。
- Electron 回归：Electron 45.4.1 加载生产 `dist/`，在临时 app/userData 数据目录与本地 HTTP/SSE 服务下走通真实 preload/IPC/SQLite 的平台、模型检测、会话、流式生成、停止/取消、参数、Select 键盘、模态焦点、主题/语言与 About。停止后内容以 `partial: true` 落库；第二次生成内容精确匹配且未重复追加；无 React / StrictMode 警告。一次性驱动脚本及临时数据已删除。
- 性能：`npm run perf` 与 `npm run perf:electron` 均通过。主线程对比采用迁移前后相同的独立 `node scripts/perf-renderer.mjs` 口径；冷启动为同机三次运行。

| 指标 | React 18 基线 | React 19 | 变化 |
| --- | ---: | ---: | ---: |
| ScriptDuration 中位数 | 104.93 ms | 108.27 ms | +3.18% |
| TaskDuration 中位数 | 227.40 ms | 237.43 ms | +4.41% |
| Electron 冷启动中位数 | 1542.39 ms | 842.88 ms | -45.35% |
| Electron 冷启动最慢一次 | 2148.33 ms | 2647.41 ms | 均 <3000 ms |

- 边界：本机默认 Edge 在迁移前即无法由 Puppeteer 启动，浏览器走查统一使用项目支持的 `EASYUI_BROWSER_PATH` Chrome 158 入口。真实 Electron 每次页面重载仍报告既有的响应头 CSP 阻止内联启动脚本错误；相关 CSP 文件在本需求中未改动，未计为 React 新增回归，也未在本需求中扩展修复。
