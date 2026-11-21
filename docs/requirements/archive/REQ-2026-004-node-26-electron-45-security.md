# REQ-2026-004：Node 26 基线与 Electron 45 安全升级

状态：done
来源：owner (安全基线与维护成本决策)
关联设计：`docs/architecture.md`、`docs/design/security.md`、`docs/design/gateway.md`、`docs/release.md`
影响模块：`package.json`／`package-lock.json`／`.npmrc`、`scripts/`、`electron/main.ts`、验证与项目文档
非目标：其他框架或工具库 major 升级、业务契约／数据格式／UI 行为变更、正式发布

## 背景

Node.js 26.13.1 是 2026-11-11 安全版本。实施前项目仍允许旧版 Node，Electron 45.2.1 内嵌 Node 24.22.1；需要统一开发与构建基线、取得 Electron 45 安全修复并清理 minimatch 漏洞，同时保持业务行为与分发契约稳定。

## 方案要点

- 将 Node 基线收紧为 `>=26.13.1 <27`，以 `engine-strict` 和统一版本门覆盖 install/ci、npm 脚本及直接执行脚本。
- 升级 Electron 至 45.4.1，保持 `@types/node` 与内嵌 Node 24 对齐；以根 `postinstall: install-electron` 准备二进制分发目录。
- 使用两条版本键限定 override 修复 minimatch 9.x／10.x 漏洞链，保留合法 3.x／5.x 实例。
- 保持业务 schema、备份格式、IPC、协议、UI、`base`、CSP、浏览器构建目标及 electron-builder 工程规避项不变。

## 验收标准

- [x] Node 26.13.1 下干净 `npm ci`、全量测试、双类型检查和构建通过；真实 Node 24 环境会被拒绝。
- [x] Electron 实际版本为 45.4.1／Node 24.22.3／Chromium 156.0.8078.100；SQLite、safeStorage、压缩响应、SSE、取消、重定向拒绝、消息分支和备份恢复正常。
- [x] dev HMR、隔离 `dev:electron`、生产 `file://`、UI／缩放／减少动态效果及性能门槛通过。
- [x] Setup／Portable 在无 `NODE_PATH` 的隔离环境运行；v1.0.3 → v1.0.4 真实升级后旧数据与密文可用。
- [x] 生产与全量审计均为 0，相关文档与最终行为一致。

## 验收记录

2026-11-20 项目内自验与外部复核通过。

- 实现：完成 Node／Electron 基线、统一版本门、Electron 二进制安装及两条版本键限定 override；18 个直接执行脚本均接入 fail-fast。
- 验证：22 个测试文件／315 项测试、双类型检查、构建和双审计通过；真实 Electron、dev HMR、生产页面、性能及 Setup／Portable 验证通过；隔离在线升级完成下载、sha512 校验、NSIS 安装与重启，未触碰真实用户数据或已有安装。
- 边界：保留既有 Vite 大 chunk 警告，第三方工具的直接 `npx` 调用不属于项目脚本门控。
