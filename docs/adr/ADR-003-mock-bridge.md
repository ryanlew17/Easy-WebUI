# ADR-003: Mock 桥双实现（Web 预览与主进程语义一致）

- Status: Accepted
- Date: 2026-09-13
- Deciders: project owner
- Supersedes: —
- Superseded by: —

## Context

`npm run dev`（纯 Vite 浏览器预览）要求不依赖任何原生模块即可走通全部 UI 流程（建平台 → 检测模型 → 建会话 → 流式对话 → 改参数 → 切主题/语言），用于开发迭代与 headless 走查。但主进程逻辑（SQLite、IPC、Gateway）无法在浏览器运行。

## Decision

`src/bridge/index.ts` 的 `getApi()`：存在 `window.easyui`（Electron preload）则返回之，否则返回 localStorage 实现的 `mockApi`——**完整实现 `EasyUiApi` 接口**（含流式演示回复、分支树、参数预设、升级 mock 通道）。UI 代码只依赖 `getApi()`，不感知运行形态。

配套红线：**主进程逻辑的行为修复必须同步修 mock 桥**，两端语义一致（例：分支删除路径恢复同时存在于 `electron/db/messages.ts` 与 `mock.ts`）。契约见 `../contracts/impl-contract.md`（Mock 桥一节）。

## Consequences

- 两端语义一致性成为长期维护约束：每个行为修复都要检查是否需要双改，漏改会造成"桌面正确、预览错误"（或反之）的隐性分歧。
- 换取：纯浏览器即可开发与走查（不需要 Electron/原生模块环境）、CI/E2E 成本低、演示零门槛。
- `EasyUiApi` 接口成为强契约：接口变更立即暴露 mock 桥的未同步处（类型检查即失败）。

## Alternatives Considered

- **只在 Electron 内开发（`dev:electron`）**：依赖原生模块构建与桌面环境，迭代慢、headless 走查困难，否决。
- **共享"纯逻辑层"减少双写**（如分支树算法放 `shared/`）：已部分采用（params/reasoning/title 等纯逻辑在 `shared/`），但持久化与 IPC 壳层天然分端，无法完全消除双实现。
