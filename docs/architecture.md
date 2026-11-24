# 技术架构

> 适用范围：技术选型、进程架构与关键约束、目录结构、构建与工程配置、Mock 桥二元性。
> 何时读取：做架构级/跨模块改动、新增目录或依赖、排查构建问题之前。
> 最后更新：2026-11-25
> 来源：原 prd.md §2 + 原 docs/impl-contract.md §0

## 1. 技术选型（当前锁定版本）

| 层 | 选型 | 理由 |
| --- | --- | --- |
| 外壳 | **Electron 45.4.1**（Node 24.22.3 / Chromium 156） | 桌面分发；渲染进程直连服务商 API 受 CORS 限制；异步 `safeStorage` 密钥加密 |
| 前端 | Vite 8 + React 19.3.1 + TypeScript 7（strict，`@typescript/native`） | 原生编译器提升类型检查与构建速度；不依赖 TS 编程 API |
| 样式 | Tailwind CSS 4（@tailwindcss/vite）+ CSS 自定义属性 | 液态玻璃与双主题依赖设计令牌；插件取代 PostCSS/autoprefixer |
| 存储 | **better-sqlite3**（主进程，WAL） | 单文件、事务、查询快；按平台提供 N-API 预编译产物，必要时按 Electron 重编译 |
| 网络 | 主进程 `net.fetch` | 绕过 CORS，统一 SSE 流式处理 |
| 状态 / i18n | Zustand / i18next + react-i18next | 轻量；两份 JSON 语言包 |
| Markdown | react-markdown 10 + remark-gfm + highlight.js 核心/语言按需加载 + DOMPurify；ReleaseNotes 另加 rehype-raw/sanitize | 渲染前消毒；聊天禁 raw HTML，语言按需加载 |
| 备份 | adm-zip | 纯 JS 免原生编译 |
| 更新 | electron-updater（GitHub Releases 通道） | 增量 blockmap + sha512 校验 |

> 备选 Tauri 已评估并否决（ADR-001），不更换。

## 2. 进程架构与关键约束

```
┌──────────────────────────── Electron Main Process ────────────────────────────┐
│ 窗口管理(含尺寸记忆) │ SQLite 数据层 │ 加密服务(safeStorage) │ Provider Gateway  │
│ 备份导入导出 │ 在线更新(updater) │ 数据目录解析与迁移 │ 日志(脱敏) │ IPC(zod 校验) │
└────────────────────────────────────┬───────────────────────────────────────────┘
                    │  IPC（invoke/handle；流式/事件用 webContents.send）
┌────────────────────────────────── Renderer Process ───────────────────────────┐
│ React UI（会话页/设置页） │ Zustand Store │ i18n │ Cookie 偏好(防 FOUC)         │
└──────────────────────────────────────────────────────────────────────────────┘
```

| 约束 | 规则 | 详见 |
| --- | --- | --- |
| 出站请求收口 | 一律经主进程 Provider Gateway；渲染进程不持明文密钥、不直连服务商 | `./design/gateway.md`、`./design/security.md` |
| 流式与取消 | delta 经 `chat:delta` 推送；取消走 `AbortController`，已收内容落库 `partial: true` | `./design/chat.md` |
| IPC 校验 | 每 payload zod 校验；错误 `redact()` 后以 `EASYUI_ERR:` 编码抛回 | `./contracts/impl-contract.md` §3 |
| 渲染进程隔离 | `nodeIntegration:false` + `contextIsolation:true`，只暴露 `window.easyui.*` 白名单；渲染代码禁 import `electron/`，跨进程共享放 `shared/` | `./design/security.md` |
| Mock 桥二元性 | `getApi()` 无 `window.easyui` 时返回 localStorage mock；主进程行为修复须同步 mock | `./contracts/impl-contract.md` §4 |

## 3. 目录结构

```
EasyWebUI/
├── docs/                # README.md、prd.md、architecture.md（本文件）、design/、contracts/、
│                        #   requirements/、adr/、roadmap.md、changelog.md、release.md、screenshots/
├── electron/            # 主进程（tsc → dist-electron/，commonjs）
│   ├── main.ts          #   入口：窗口/数据目录/CSP/日志/生命周期
│   ├── preload.ts       #   contextBridge → window.easyui
│   ├── ipc.ts           #   全部 ipcMain.handle（zod 校验 + redact）
│   ├── chat.ts          #   生成编排：落库 → 裁剪 → 流式 → 落库（树形分支）
│   ├── db/              #   better-sqlite3（WAL + schema_migrations 迁移）
│   ├── crypto/          #   safeStorage 优先；机器指纹 scrypt+AES-GCM 兜底；redact
│   ├── gateway/         #   协议适配 / SSE / joinUrl / 裁剪 / 超时重试
│   ├── backup/          #   adm-zip 导出导入（纯函数核心，不依赖 sqlite/electron）
│   ├── updater.ts       #   在线升级（electron-updater + 状态机）
│   ├── window-state*.ts #   窗口尺寸记忆（纯函数核心 + fs 壳，可测）
│   └── paths.ts / storage-migrate.ts / logger.ts
├── shared/              # 跨进程唯一共享层：types（EasyUiApi 契约）/ params / presets /
│                        #   appearance / reasoning / title / errors / ipc / ipc-constants（无 zod）
├── src/                 # 渲染进程（Vite + React 19 + strict + Tailwind 4）
│   ├── bridge/          #   getApi()：Electron 桥或 localStorage mock
│   ├── pages/           #   chat/（三栏会话页）、settings/（五标签设置页）
│   ├── components/      #   AppFrame / FormLayout / Modal / Toast / Markdown / Popover / controls / icons / params
│   ├── store/           #   zustand（conversations/messages/presets/providers/settings/ui）
│   ├── i18n/ lib/ styles/
│   ├── lib/glass/       #   材质能力、几何、像素缓存、生命周期与 vendored driver
│   └── vendor/liquid-glass/ # 选定的 Glass SDK 0.0.2 + 最小 vgpu/Lisse、类型与 MIT 许可证
├── tests/               # vitest 单测（gateway/trim/crypto/backup/db/窗口状态/视觉材质…）
├── scripts/             # 走查与探针（puppeteer-core + Chromium 无头，默认系统 Edge）、截图、冒烟、性能基准
├── build/               # 应用图标与本地走查产物（gitignore）
└── release/             # electron-builder 产物
```

## 4. 工程与构建

- npm，Node `>=26.13.1 <27`；`.npmrc` 的 `engine-strict` 负责 install/ci，统一 `scripts/node-version-guard.mjs` 覆盖 npm pre-hook 与直接执行的脚本入口。命令清单见 AGENTS.md。三份 tsconfig：`tsconfig.json`（基础 + references）、`tsconfig.web.json`（src/ + shared/，DOM lib，strict，相对 `paths` 无 `baseUrl`）、`tsconfig.electron.json`（electron/ + shared/，NodeNext，rootDir `.`，outDir `dist-electron`，发射 CommonJS）。`@typescript/native` 提供 TS7 的 `tsc`；`typescript` 5.9 保留满足旧 peer。
- `build` 产物链：web typecheck → vite build（→ `dist/`）→ tsc 主进程（→ `dist-electron/`，**保留 electron/ + shared/ 目录结构**，故 `package.json → main` 为 `dist-electron/electron/main.js`）→ esbuild 自包含打包 preload（`--external:electron`，最后一步）。
- `vite.config.mts`：`base: './'`（Electron `file://` 需要相对路径，**不许改**）；server.port 5173；`.mts` 保持 ESM 原生加载；Tailwind 4 经 `@tailwindcss/vite`，旧 JS 配置经 `@config` 保留，`source(none)` 下仅显式注册 `index.html` 与 `src/**/*.{ts,tsx}`；CSS／构建目标 Chrome／Edge 139+、Safari 16.4+、Firefox 128+。这些是构建目标，不代表对应浏览器均已完成实测；`corner-shape` 另有 Chrome 138 普通圆角回退验证。
- better-sqlite3 ABI：开发期报 ABI 错误时 `npx electron-rebuild -f -w better-sqlite3`；**Electron 44+ 需 better-sqlite3 ≥ 12（本项目 v13）**；纯 Web 预览安装可 `npm install --ignore-scripts` 保底，但桌面完整验收必须执行安装脚本并实载原生模块。Electron 45.4.1 包提供 `install-electron` 而不自动执行二进制下载，本项目以根 `postinstall: install-electron` 在干净安装后准备 `dist`。`allowScripts` 仅为声明性约定；项目未安装 `@lavamoat/allow-scripts`，该字段不参与安装门控。
- electron-builder 输出 Windows（nsis + portable，已实测）与 macOS（dmg）/ Linux（AppImage，配置就绪未实测）。`build.npmRebuild: false`（预编译原生模块已经目标 Electron 实载验证，打包直接复用）与 `build.electronDist: node_modules/electron/dist`（规避 Windows 解压 rename EPERM）是**测得的工程决策，不许"清理"**。排障：构建 PATH 需含 PowerShell；winCodeSign 缓存解包失败用 7za 手工解开对应 `.7z`（darwin 符号链接报错可忽略）。
- 验证、打包与发布门槛见 `./release.md`；性能基准不触碰真实业务数据（`perf` / `perf:electron` 使用内存 SQLite、临时目录与隔离 userData）。

## 5. 液态玻璃与 vendored 边界（REQ-2026-006）

- Track A/B 由 `src/styles/tokens.css`、`src/styles/glass-optics.css` 和现有组件承担，始终提供首帧与完整 CSS 降级。Track C 默认输出 `fallback/filter-budget`，不创建 GPU 表面；`data-glass-engine="enabled"` 仅用于后续明确评审（需在页面脚本执行前注入），不是用户偏好。
- `GlassMaterialProvider` 只在聊天中栏建立场景，页面不得直接调用 vendored API。引擎、WGSL/vgpu 和编码器经动态 `import()` 进入独立 chunk；Worker 由 Vite 编译为本地文件，地图使用 data: PNG，不放宽 CSP。
- `scripts/revendor-liquid-glass.mjs` 仅在显式 re-vendor 时运行：固定版本、校验 registry integrity、生成最小浏览器闭包并重放本地补丁。正常 install/build 不访问上游，不把 Glass SDK、Base UI 或 vgpu 添加为 npm 依赖。
- 许可证、来源与本地改动见 `src/vendor/liquid-glass/VENDORED.md` 和 `THIRD_PARTY_NOTICES.md`。像素缓存与 pending 共用 4,000,000 像素硬上限，不使用 IndexedDB/localStorage 持久缓存。
- REQ-2026-006 的测量数据与 CSS 降级决定收束在[归档需求](./requirements/archive/REQ-2026-006-liquid-glass-visual-upgrade.md)中，不另设性能文档目录；GPU Task 余量约束与复验要求见 `./release.md`。
