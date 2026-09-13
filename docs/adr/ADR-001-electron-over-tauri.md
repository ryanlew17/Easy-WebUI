# ADR-001: 选择 Electron 而非 Tauri（Desktop Shell）

- Status: Accepted
- Date: 2026-09-13
- Deciders: project owner
- Supersedes: —
- Superseded by: —

## Context

产品需要 PC 桌面分发（Windows 优先，macOS/Linux 配置就绪）。两个硬性约束决定了外壳选型：

1. 渲染进程直连各服务商 API 存在 CORS 限制，需要一个可以转发出站请求的原生壳；
2. API 密钥需要系统级加密存储（Windows DPAPI / macOS Keychain / Linux libsecret）。

同时项目由 AI 代理大量参与实现，生态成熟度与可参考资料量直接影响实现成本。

## Decision

采用 **Electron 44**：主进程 Provider Gateway 统一转发出站请求（绕过 CORS、密钥不进渲染进程），密钥加密用 Electron 内建的 `safeStorage`（不可用时机器指纹 scrypt + AES-256-GCM 兜底，见 `../design/security.md`）。主进程用 TypeScript 编写，tsc 编译到 `dist-electron/`。

## Consequences

- 包体积较大（Electron 运行时随包分发），安装包与内存占用高于 Tauri。
- 换取：`safeStorage` 稳定可用、生态与工具链成熟（electron-builder / electron-updater / better-sqlite3 原生模块按 ABI 预编译）、AI 代理实现成本最低。
- 原生模块（better-sqlite3）需匹配 Electron ABI，带来已记录的打包取舍（`npmRebuild: false` 等，见 README "Packaging" 与 `../architecture.md`）。

## Alternatives Considered

- **Tauri（已评估并否决）**：体积更小，但 Rust 工具链与密钥存储方案在本项目的评估中不如 Electron 生态与 `safeStorage` 稳；AI 代理对 Rust 侧改动的实现与调试成本更高。除非未来对包体积有硬性要求，不重启该选项。
