# REQ-2026-001：安全审计修复

状态：done（2026-11-01）
来源：2026-10 内部安全审计与后续复审
关联设计：`docs/design/security.md`、`docs/design/gateway.md`、`docs/contracts/backup-format.md`
影响模块：`shared/`、`electron/`、`src/`
非目标：独立依赖审计项及 PRD 已排除的功能

## 背景

内部审计发现密钥外发、网关与导航边界、备份输入、消息树环和错误脱敏等风险，同时需要完成 Electron 异步加密迁移并修复相关竞态。

## 方案要点

- 收紧密钥、网关、导航、新窗口和 IPC sender 边界，统一错误脱敏。
- 加固备份 KDF、路径、文件名和密码限制，保留消息树及 Mock 安全不变量。
- 升级 Electron/Node，迁移异步 safeStorage，并修复生成锁与窗口缩放时序。

## 验收标准

- 密钥不明文落盘、不进入渲染进程，机器密文不得导出。
- 响应限制、备份防护、脱敏、分支恢复及兼容旧密文均有效。
- 单元测试、类型检查、构建、UI 探针和真实打包应用冒烟通过。

## 验收记录

2026-11-01 自审通过。

- 实现：完成上述安全修复、Electron 45.2.1 升级及 safeStorage 异步迁移。
- 验证：256 项测试、双类型检查、生产构建、portal/UI 走查和 Setup/Portable 冒烟通过。
- 边界：依赖审计作为发布门槛维护于 `docs/release.md`。
