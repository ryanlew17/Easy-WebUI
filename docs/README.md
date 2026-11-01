# 文档地图

> 只阅读与当前任务相关的文档。`design/` 与 `contracts/` 描述现行行为；`requirements/active/` 描述待办需求；`requirements/archive/` 仅记录已完成需求。更早快照见 Git 历史。

## 核心入口

| 任务 | 权威文档 |
| --- | --- |
| 产品定位、用户、非目标 | [prd.md](./prd.md) |
| 技术选型、进程边界、构建 | [architecture.md](./architecture.md) |
| 测试、打包、发布 | [release.md](./release.md) |
| 新需求与验收 | [requirements/index.md](./requirements/index.md) |
| 版本历史 / 候选方向 | [changelog.md](./changelog.md) · [roadmap.md](./roadmap.md) |

## 模块行为（`design/`）

| 文档 | 范围 |
| --- | --- |
| [provider](./design/provider.md) | 平台字段、预置模板、模型与格式检测 |
| [chat](./design/chat.md) | 生成编排、单生成锁、思考开关、统计 |
| [params](./design/params.md) | 全局/用户预设与会话覆盖 |
| [context-trim](./design/context-trim.md) | 上下文裁剪与计量 |
| [message-tree](./design/message-tree.md) | 树形分支、删除与激活路径 |
| [title](./design/title.md) | 自动/手动标题生成 |
| [gateway](./design/gateway.md) | 主进程网关、大小限制与错误行为 |
| [storage](./design/storage.md) | 数据目录、迁移、备份交互 |
| [security](./design/security.md) | 密钥、脱敏、CSP、导航与隐私 |
| [ui-liquid-glass](./design/ui-liquid-glass.md) | 视觉令牌、主题、缩放、动效 |
| [popover](./design/popover.md) | 浮层 portal 与 InfoTip |
| [ux-guidelines](./design/ux-guidelines.md) | 焦点、快捷键、错误文案、可访问性 |
| [i18n](./design/i18n.md) | 双语言包与文案规则 |

## 接口契约（`contracts/`）

- [impl-contract.md](./contracts/impl-contract.md)：契约的代码事实来源索引、事件通道、IPC 错误码与 Mock 桥行为；类型以 `shared/types.ts` 为准。
- [protocol-mapping.md](./contracts/protocol-mapping.md)：三种 API 格式的参数、请求、SSE 与 URL 映射。
- [db-schema.md](./contracts/db-schema.md)：SQLite 结构、索引与迁移。
- [backup-format.md](./contracts/backup-format.md)：备份 ZIP、manifest 与加密格式。

## 架构决策（`adr/`）

ADR-001 Electron（非 Tauri）· ADR-002 浮层 portal 到 `document.body` · ADR-003 Mock 桥与主进程语义一致 · ADR-004 安装版数据放用户目录。

ADR 只记录决策背景与后果；现行规则以 `design/` 和 `contracts/` 为准。新 ADR 用 `ADR-NNN-短标题.md`，含 Status / Date / Context / Decision / Consequences / Alternatives。

## 维护约定

- 新需求先登记 GitHub Issue 或 `requirements/active/`；实现后回写行为文档并更新需求状态。
- 接口变更同步 `shared/types.ts`、Electron、Mock 桥和对应契约。
- 已完成需求移入 `requirements/archive/`；历史快照不再复制到入口文档。
