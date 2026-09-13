# Easy WebUI

[English](./README.md) | **简体中文**

轻量级、**本地优先**（local-first）的多供应商大模型对话桌面客户端（PC 端），基于 **Electron + React 18 + TypeScript**。全部数据保存在本机；API 密钥加密落盘，渲染进程永远接触不到密钥。

产品需求文档：[docs/prd.md](./docs/prd.md) · 技术架构：[docs/architecture.md](./docs/architecture.md) · 模块设计快照：[docs/design/](./docs/design/README.md) · 跨进程接口契约：[docs/contracts/impl-contract.md](./docs/contracts/impl-contract.md)

> 没有 Electron 环境也能预览：`npm run dev` 启动**纯浏览器预览**（localStorage mock 桥），完整走通全部 UI 流程，不依赖任何原生模块。

## 功能特性

- **12 家预置供应商**（仅作为快捷模板，不预写数据库）：OpenAI、Anthropic、OpenRouter、DeepSeek、Kimi (Moonshot AI)、智谱 (Bigmodel)、小米 (Xiaomi MiMo)、MiniMax、硅基流动 (SiliconFlow)、魔搭 (ModelScope)、火山引擎 (Ark)、阿里云百炼 (Alibaba Cloud Bailian)——同时支持完全自定义 base_url / 协议格式（`openai-chat` / `openai-responses` / `anthropic`，支持自动探测）。
- **流式对话 + 推理过程展示**——SSE 流式输出、三点 typing 指示器、Markdown 增量渲染（GFM 表格、代码高亮），DeepSeek 等模型的 `reasoning_content` 以折叠块展示。支持停止 / 重新生成。
- **LM Studio 风格参数预设系统**——全局预设之上叠加用户预设，会话级覆盖带高亮标记与一键恢复预设值；涵盖系统提示词、温度、可选回复长度限制、上下文溢出策略（滚动窗口 / 截断中段 / 到达上限停止）、停止字符串、top_k / 重复惩罚 / 存在惩罚 / top_p / min_p 采样开关，以及 JSON Schema 结构化输出。全局预设仅可在设置页编辑，并支持恢复出厂默认。
- **液态玻璃双主题 UI**——浅色 / 深色 / 跟随系统，玻璃拟态 + 严格的同屏模糊层预算，完整支持 `prefers-reduced-motion` / `prefers-reduced-transparency` 降级。
- **外观自定义**——界面缩放（50%–250% 步长 10%，增量式滑块拖动不失控 + 步进按钮，带视口补偿：模态框 / 弹层不错位，拦截 Ctrl+滚轮 / 触控板捏合缩放）、自定义界面字体与代码字体（严格字体栈白名单，非法输入拒绝并提示）、界面字号（10–24px）与代码块字号（6–40px）独立可调可一键重置、代码块背景独立三态（跟随 / 浅色 / 深色，强制覆盖语法高亮主题）。全部即时生效，启动时首帧前应用（无样式闪烁）。
- **密钥加密存储**——经 Electron `safeStorage`（DPAPI / Keychain / libsecret）加密；无系统密钥环时回退到机器指纹 scrypt + AES-256-GCM。渲染进程只能看到 `has_key` 布尔值。
- **加密备份 / 恢复**——一键 zip 备份；含密钥备份使用独立密码（scrypt + AES-256-GCM）保护。恢复支持合并 / 覆盖两种模式。
- **数据位置自管**——便携版数据固定在 exe 旁 `data/` 工作目录，安装版默认存于用户目录（重装 / 覆盖安装不丢数据，卸载也不删除）；支持自选存储路径并自动迁移全部数据（含备份），迁移后重启生效；旧版本遗留数据（安装目录、%Temp% 解包目录）在首次启动时自动抢救迁移；存储布局带版本标记，大版本升级可自动迁移结构。
- **关于与在线升级**——「设置 → 关于」提供版本 / 协议 / 作者 / GitHub 信息卡与在线升级卡：检查更新走 GitHub Releases 通道（electron-updater；Beta 开关映射 GitHub 预发布），发现新版本即自动下载并按 latest.yml 的 sha512 自动校验，随后展示固定高度可滚动的版本摘要 + 数据备份警告，确认后静默安装并自动重启；启动时按「自动检查更新」开关自检，发现新版本以通知气泡提示。web 预览下升级卡为桌面独占禁用态。
- **中英双语**——简体中文 / English，支持跟随系统语言。
- **模型管理**——拉取远程模型列表、单模型连通性检测（延迟 + 状态）、一键全部检测。

## 截图

| 会话页（浅色） | 会话页（深色） |
| --- | --- |
| ![会话页（浅色）](docs/screenshots/05-chat-light-zh.png) | ![会话页（深色）](docs/screenshots/07-chat-dark-zh.png) |

| 模型选择器（液态玻璃模糊） | 新增平台（12 家预置） |
| --- | --- |
| ![模型选择器](docs/screenshots/04-model-picker-blur-zh.png) | ![新增平台](docs/screenshots/03-provider-modal-light-zh.png) |

更多见 [docs/screenshots/](./docs/screenshots/)：欢迎页、设置、生成中「思考中…」状态与多行输入坞（上方浮出「生成回复」液态玻璃胶囊）等 8 张。

## 技术栈

- **桌面壳**：Electron 44（主进程 TypeScript，编译到 `dist-electron/`）
- **渲染进程**：Vite + React 18 + TypeScript（strict）+ Tailwind CSS 3
- **状态 / 国际化**：zustand、i18next + react-i18next
- **Markdown**：react-markdown + remark-gfm + highlight.js + DOMPurify
- **主进程存储**：better-sqlite3（WAL、外键、schema 迁移）
- **校验**：所有 IPC 入参走 zod；vitest 单元测试

## 快速开始

需要 **Node.js ≥ 18**。

```bash
npm install          # 若 better-sqlite3/electron 因网络失败，可 `npm install --ignore-scripts` 保底
                     #（Web 预览不依赖原生模块）
npm run dev          # 纯 Web 预览（Vite，端口 5173，localStorage mock 桥，可完整演示）
npm test             # vitest：gateway 三协议 / 裁剪 / 加密 / 备份 roundtrip
npm run typecheck    # tsconfig.web + tsconfig.electron 双检
npm run build        # web 类型检查 + vite build → dist/ + tsc → dist-electron/ + esbuild 打包 preload
npm run dev:electron # 桌面端开发（需先跑过一次 npm run build 产出 dist-electron/）
```

### 打包（Windows，已实测）

```bash
npx electron-builder --win portable nsis --publish never
# 产物：release/EasyWebUI_0.1.0_Portable.exe  （便携版）
#       release/EasyWebUI_0.1.0_Setup.exe     （NSIS 安装包）
```

产物命名来自 `package.json → build` 中按 target 配置的 `artifactName`
（`EasyWebUI_${version}_Setup.${ext}` / `EasyWebUI_${version}_Portable.${ext}`）。

`package.json → build` 中两项实测取舍（勿"清理"）：

- `"npmRebuild": false` —— 本机已用 `@electron/rebuild` 把 better-sqlite3 编成 Electron ABI，
  打包时跳过重编译，直接复用现有绑定；
- `"electronDist": "node_modules/electron/dist"` —— 规避 electron-builder 在 Windows 上
  "解压 electron zip 后 rename 目录 EPERM" 的问题（改为直接拷贝已解压的 Electron 发行目录）。

环境要点：构建进程的 PATH 需包含 PowerShell（`C:\Windows\System32\WindowsPowerShell\v1.0`，
electron-builder 收集 node 依赖时会间接调用）。winCodeSign 缓存
（`%LOCALAPPDATA%\electron-builder\Cache`）若因无符号链接权限解包失败，用 7za 手工解一遍
对应 `.7z` 即可（darwin 符号链接报错可忽略）。应用图标为 `build/icon.ico`。

## 目录结构

```
electron/            # 主进程（tsc → dist-electron/）
  main.ts            #   窗口 / 数据目录定位 / CSP / 日志
  preload.ts         #   contextBridge → window.easyui（白名单 API，契约 §2）
  ipc.ts             #   全部 ipcMain.handle，zod 入参校验，错误统一 redact()
  db/                #   better-sqlite3（WAL + foreign_keys + schema_migrations）
  crypto/            #   safeStorage 优先；不可用时 scrypt(机器指纹)+AES-256-GCM 回退
  gateway/           #   三种协议适配（openai-chat / openai-responses / anthropic）、
                       #   SSE 解析、joinUrl、上下文裁剪、超时与重试
  backup/            #   adm-zip 导出导入；数据编排为不依赖 sqlite 的纯函数
  chat.ts            #   生成编排：落库 → 裁剪 → 流式推送 → 落库
shared/              # types.ts（EasyUiApi，两端唯一事实来源）、presets.ts（12 家预置）、ipc.ts
src/                 # 渲染进程（Vite + React 18 + TS strict + Tailwind 3）
  bridge/            #   getApi()：window.easyui 存在则用真实桥，否则用 localStorage mock
  pages/             #   chat / settings
  components/        #   Modal / Toast / Markdown / controls
  store/             #   zustand stores
  i18n/              #   zh-CN / en-US
  styles/            #   设计令牌（液态玻璃、双主题）
tests/               # vitest：gateway / trim / crypto / backup
scripts/             # e2e 预览、electron 冒烟与打包产物验证
docs/                # prd.md（产品）、architecture.md、design/（模块设计快照）、
                       #   contracts/（IPC/协议/数据库/备份契约）、requirements/、adr/、release.md、screenshots/
```

关键约束：**所有出站 API 请求只走主进程 Gateway**——渲染进程永不见密钥/密文
（`Provider` 只有 `has_key` 布尔）；`nodeIntegration: false` + `contextIsolation: true`。

## 数据目录

- **便携版**：exe 旁 `data/` 工作目录（经 `PORTABLE_EXECUTABLE_DIR` 定位便携 exe 真实所在目录，不受 %Temp% 解包影响）；自定义路径指针 `easywebui-data-dir.json` 同在 exe 旁。
- **安装版**：默认 `%APPDATA%/easy-webui/data`（重装 / 覆盖安装 / 卸载均不删除）。
- **自定义路径**：设置 → 通用 → 数据存储路径 → 更改…，自动迁移全部数据，重启后生效。
- **版本升级迁移**：旧版本遗留数据（安装目录、%Temp% 解包目录）在首次启动时自动抢救迁移；`storage-layout.json` 记录存储布局版本，大版本结构变更自动升级。
- 结构：`easyui.db`（WAL）、`keyring.bin`（回退加密盐，600 权限）、`backups/`（备份 zip）、
  `logs/app.log`（按日轮转，保留 7 天）。

## 发布新版本（在线升级通道）

升级通道 = GitHub Releases（`build.publish` 已指向 `ryanlew17/Easy-WebUI`）：

1.  bump `version` → `npm run build` → `npx electron-builder --win`；
2.  GitHub 新建 Release（tag `vX.Y.Z`；Beta 版勾选 **Set as a pre-release**，仅 Beta 通道用户能检出）；
3.  上传 `release/latest.yml`、`EasyWebUI_X.Y.Z_Setup.exe`、`EasyWebUI_X.Y.Z_Setup.exe.blockmap`
    （升级只吃安装版；便携版不进升级通道，靠整包替换 + 数据在 exe 旁天然保留）；
4.  用户端链路：启动自检 / 手动检查 → 发现新版本自动下载 → 按 `latest.yml` 的 sha512 校验 →
    版本摘要 + 备份警告 → 确认后静默安装并自动重启。

## 安全与隐私

1. **API 密钥永不明文落盘**：`safeStorage`（DPAPI/Keychain/密钥环）加密后存
   `providers.api_key_cipher`（带 `v1:ss:` / `v1:mf:` 前缀自描述）；safeStorage 不可用时用
   机器指纹（hostname+用户名+平台 的 SHA-256）+ `keyring.bin` 随机盐 scrypt 派生
   AES-256-GCM 密钥。
2. 所有已知密钥注册进 `crypto/redact` 注册表，日志、IPC 错误、服务商错误消息一律脱敏为
   `前3字符+***`。
3. 备份默认**不含**密钥；含密钥备份用独立密码（≥8 位）scrypt(N=2^15,r=8,p=1)+AES-256-GCM
   加密明文列表入包——**绝不导出 safeStorage 机器密文**；恢复时用本机加密服务重新加密。
4. CSP：`default-src 'self'`（生产；dev 模式下由 vite 插件剥离以保证 HMR 可用）。
5. 渲染进程代码（含 mock 桥）不 import `electron/` 或任何 node 模块。

### CSP hash

`index.html` 的防 FOUC 内联脚本通过 `script-src 'sha256-…'` 白名单放行（不加
`unsafe-inline`）。**若修改该脚本内容（含任何空白），必须重新计算哈希**：

```bash
node -e "const fs=require('fs'),c=require('crypto');const m=fs.readFileSync('index.html','utf8').match(/<script>(\(function[\s\S]*?)<\/script>/);console.log(c.createHash('sha256').update(m[1],'utf8').digest('base64'))"
```

（注意用上面这条精确匹配"无属性 `<script>`"的命令；用宽泛的 `/<script>.../` 正则可能
误匹配到注释中的文字。）

## 开发注意事项

- **`package.json` 的 `main` 为 `dist-electron/electron/main.js`**：契约原文写
  `dist-electron/main.js`，但 `tsc` 会保持 `electron/` 与 `shared/` 的目录结构输出；为保证
  桌面端真实可启动，按实际产物路径填写。
- **`dev:electron` 依赖 `dist-electron/` 已构建**（契约允许的简化）。preload 由 esbuild 以
  自包含方式打包（`--external:electron`），是构建的最后一步；如后续引入 `tsx`/`esbuild`
  直跑 TS，可去掉该前置步骤。
- **better-sqlite3 需按 Electron 的 ABI 编译**（electron-builder 打包时自动处理；开发期若
  `electron .` 报 ABI 错误，执行一次 `npx electron-rebuild -f -w better-sqlite3`）。纯 Web
  预览与 `npm test` 均不依赖该原生模块。**注意**：Electron 44+ 的 V8 API 与
  better-sqlite3 ≤ 11 不兼容（C2668/C2039 编译错误），需 better-sqlite3 ≥ 12
  （本项目已用 v13）。
- 一切用户可见字符串走 i18next `t()`；错误文案三段式：发生了什么 / 可能原因 / 建议操作。

## 路线图

- 随 API 演进补充更多协议适配与供应商预置
- 更丰富的会话组织（搜索、分组）
- 候选方向见 [docs/roadmap.md](./docs/roadmap.md)；产品范围与非目标见 [docs/prd.md](./docs/prd.md)

## 许可证

MIT
