# REQ-2026-005：React 19 渲染基线升级

状态：active
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

- [ ] 干净 `npm ci` 成功，无 peer 冲突、忽略 peer 的安装参数或重复 React；运行时代码实际使用 React/React DOM 19.3.1。
- [ ] `npm run typecheck`、`npm test`、`npm run build` 通过，生产与全量 `npm audit` 不引入新漏洞。
- [ ] Web 预览与真实 Electron 均可完成建平台、检测模型、建会话、流式对话、停止/取消、改参数、切主题/语言和设置操作。
- [ ] StrictMode 无新增警告或重复副作用；受控输入、Markdown、外部 store、模态焦点和键盘行为正常。
- [ ] 模型下拉、Select、Generate 胶囊、InfoTip、Toast 与模态定位/层级正常，双层缩放和既有 portal 探针通过。
- [ ] `npm run perf` 与 `npm run perf:electron` 通过；冷启动最慢一次 <3s，同机主线程与冷启动中位数相对迁移前基线回退不超过 10%。
- [ ] 最终架构文档、版本声明和验收记录与安装及运行结果一致。

## 验收记录

待实施。最终记录实际版本、验证命令、性能对比和必要的类型修正。
