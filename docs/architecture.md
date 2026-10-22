# 技术架构

> 适用范围：技术选型、进程架构与关键约束、目录结构、构建与工程配置（tsconfig / vite / 依赖）、Mock 桥二元性。
> 何时读取：做架构级/跨模块改动、新增目录或依赖、排查构建问题之前。
> 关联需求：无（v1.0.1 现状快照）。
> 最后更新：2026-09-13
> 来源：原 prd.md §2 + 原 docs/impl-contract.md §0

## 1. 技术选型（当前锁定版本）

| 层 | 选型 | 理由 |
| --- | --- | --- |
| 外壳 | **Electron 44** | PC 桌面分发；渲染进程直连服务商 API 有 CORS 限制，主进程可转发；提供 `safeStorage` 系统级密钥加密 |
| 前端 | Vite 8 + React 18 + TypeScript 5.6（strict） | 生态成熟、AI 代理实现成本最低 |
| 样式 | Tailwind CSS 3 + CSS 自定义属性 | 液态玻璃与双主题均依赖设计令牌（design tokens） |
| 存储 | **better-sqlite3**（主进程，WAL 模式） | 单文件、事务、查询快；原生模块已按 Electron ABI 预编译 |
| 网络 | 主进程 `net.fetch` | 绕过 CORS，统一 SSE 流式处理 |
| 状态 / i18n | Zustand / i18next + react-i18next | 轻量；两份 JSON 语言包 |
| Markdown | react-markdown + remark-gfm + highlight.js + DOMPurify | GFM 表格、代码高亮、渲染前消毒 |
| 备份 | adm-zip | 纯 JS 免原生编译 |
| 更新 | electron-updater（GitHub Releases 通道） | 增量 blockmap + sha512 校验 |

> 备选 Tauri 已评估并否决：Electron 生态与 `safeStorage` 更稳，不更换。

## 2. 进程架构

```
┌──────────────────────────── Electron Main Process ────────────────────────────┐
│ 窗口管理(含尺寸记忆) │ SQLite 数据层 │ 加密服务(safeStorage) │ Provider Gateway  │
│ 备份导入导出 │ 在线更新(updater) │ 数据目录解析与迁移 │ 日志(脱敏) │ IPC(zod 校验) │
└────────────────────────────────────┬───────────────────────────────────────────┘
                    │  IPC（invoke/handle；流式/事件用 webContents.send）
┌────────────────────────────────── Renderer Process ───────────────────────────┐
│ React UI（会话页/设置页） │ Zustand Store │ i18n │ Cookie 偏好(防 FOUC)         │
└────────────────────────────────────────────────────────────────────────────────┘
```

**关键约束**（摘要见 AGENTS.md，详情在各 design/contracts 文档）：

1. **所有出站 API 请求必须经由主进程 Provider Gateway 转发**，渲染进程不持有明文密钥、不直接请求服务商。渲染进程只提供"平台 id + 模型名 + 参数"，主进程查库解密密钥后发请求（`./design/gateway.md`、`./design/security.md`）。
2. 流式响应经 `webContents.send('chat:delta', …)` 推送，渲染进程增量渲染；取消经 IPC 调 `AbortController.abort()`，已收部分内容落库（`partial: true`）（`./design/chat.md`）。
3. **IPC 接口对每个 payload 做 zod 校验**，不信任渲染进程传入的任何字段；错误经 `redact()` 脱敏后以 `EASYUI_ERR:` 编码抛回（`./contracts/impl-contract.md` §4）。
4. `nodeIntegration: false`、`contextIsolation: true`，`contextBridge` 只暴露白名单 API（`window.easyui.*`）（`./design/security.md`）。
5. **渲染进程代码不得 import `electron/` 下任何模块**；跨进程共享的类型与纯逻辑一律放 `shared/`。
6. **Web 预览 Mock 桥**：`src/bridge/index.ts` 的 `getApi()` 在无 `window.easyui` 时返回 localStorage 实现的 `mockApi`（完整 `EasyUiApi`，含流式演示回复）。`npm run dev` 纯浏览器可走通全部 UI 流程；**主进程逻辑的行为修复须同步修 mock 桥**，两端语义一致（`./contracts/impl-contract.md` §6）。

## 3. 目录结构

```
EasyWebUI/
├── docs/                # prd.md、architecture.md（本文件）、design/、contracts/、requirements/、
│                        #   adr/、roadmap.md、changelog.md、testing.md、release.md、screenshots/、archive/
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
│                        #   appearance / reasoning / title / errors / ipc
├── src/                 # 渲染进程（Vite + React 18 + strict + Tailwind 3）
│   ├── bridge/          #   getApi()：Electron 桥或 localStorage mock
│   ├── pages/           #   chat/（三栏会话页）、settings/（五标签设置页）
│   ├── components/      #   Modal / Toast / Markdown / Popover / controls / icons / params
│   ├── store/           #   zustand（conversations/messages/presets/providers/settings/ui）
│   ├── i18n/ lib/ styles/
├── tests/               # vitest 单测（gateway/trim/crypto/backup/db/窗口状态…）
├── scripts/             # 走查与探针（puppeteer-core + 系统 Edge 无头）、截图、冒烟
├── build/               # 应用图标
└── release/             # electron-builder 产物
```

## 4. 工程与构建

- 包管理 npm，Node ≥ 18。**命令清单见 AGENTS.md**（dev / dev:electron / typecheck / test / build / 打包 / 探针脚本）。
- 三份 tsconfig：`tsconfig.json`（基础 + references）、`tsconfig.web.json`（src/ + shared/，DOM lib，strict）、`tsconfig.electron.json`（electron/ + shared/，module commonjs，outDir `dist-electron`，types node）。
- `build` 产物链：web typecheck → vite build（→ `dist/`）→ tsc 主进程（→ `dist-electron/`，**保留 electron/ + shared/ 目录结构**，故 `package.json → main` 为 `dist-electron/electron/main.js`）→ esbuild 自包含打包 preload（`--external:electron`，最后一步）。
- `vite.config.ts`：`base: './'`（Electron `file://` 加载需要相对路径，**不许改**）；server.port 5173。
- `dev:electron` 依赖先 `npm run build` 产出 `dist-electron/`（允许的简化）；如后续引入 tsx/esbuild 直跑 TS 可去掉前置。
- better-sqlite3 需匹配 Electron ABI：开发期 `electron .` 报 ABI 错误时 `npx electron-rebuild -f -w better-sqlite3`；**Electron 44+ 的 V8 API 与 better-sqlite3 ≤ 11 不兼容，需 ≥ 12（本项目 v13）**；纯 Web 预览与 `npm test` 不依赖原生模块。
- electron-builder 输出 Windows（nsis + portable，已实测）与 macOS（dmg）/ Linux（AppImage，配置就绪未实测）。产物命名见 `package.json → build` 按 target 的 `artifactName`；图标 `build/icon.ico`。
- `build.npmRebuild: false`（better-sqlite3 已由 `@electron/rebuild` 按 Electron ABI 编好，打包直接复用）与 `build.electronDist: node_modules/electron/dist`（规避 electron-builder 在 Windows 上解压后 rename 目录 EPERM）是测得的工程决策，**不许"清理"**。
- 打包环境：构建进程 PATH 需含 PowerShell（`C:\Windows\System32\WindowsPowerShell\v1.0`，electron-builder 收集 node 依赖时间接调用）；winCodeSign 缓存（`%LOCALAPPDATA%\electron-builder\Cache`）若因符号链接权限解包失败，用 7za 手工解开对应 `.7z`（darwin 符号链接报错可忽略）。
- `npm install` 若因 better-sqlite3/electron 下载失败，可 `npm install --ignore-scripts` 保底（Web 预览与单测不依赖原生模块）。

## 5. 测试与验证体系

门槛与命令说明见 `./testing.md`；发布流程见 `./release.md`。
