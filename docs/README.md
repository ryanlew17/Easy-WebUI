# 文档地图

> 只阅读与当前任务相关的文档。`design/` 与 `contracts/` 描述现行行为；`requirements/active/` 描述待办需求；`requirements/archive/` 仅记录已完成需求。更早快照见 Git 历史。

## 核心入口

| 任务 | 权威文档 |
| --- | --- |
| 产品定位、用户、非目标 | [prd.md](./prd.md) |
| 技术选型、进程边界、构建 | [architecture.md](./architecture.md) |
| 测试、打包、发布 | [release.md](./release.md) |
| 新需求、验收与性能证据 | [requirements/index.md](./requirements/index.md) |
| 版本历史 / 候选方向 | [changelog.md](./changelog.md) · [roadmap.md](./roadmap.md) |

## 模块行为（`design/`）

| 文档 | 范围 |
| --- | --- |
| [provider](./design/provider.md) | 平台编辑、模型与格式检测 |
| [chat](./design/chat.md) | 生成编排、流式渲染、思考开关、统计 |
| [params](./design/params.md) | 参数合成、预设与覆盖 |
| [context-trim](./design/context-trim.md) | 发送裁剪与本地用量估算 |
| [message-tree](./design/message-tree.md) | 消息树、分支操作与删除恢复 |
| [title](./design/title.md) | 标题目标解析、生成与事件 |
| [gateway](./design/gateway.md) | 主进程网络、限制与统一错误 |
| [storage](./design/storage.md) | 数据目录、迁移、UI 偏好与备份 |
| [security](./design/security.md) | 密钥、脱敏、CSP、内容安全与隐私 |
| [ui-liquid-glass](./design/ui-liquid-glass.md) | 视觉令牌、骨架、材质、缩放与动效 |
| [popover](./design/popover.md) | 浮层挂载、定位与临时材质生命周期 |
| [ux-guidelines](./design/ux-guidelines.md) | 焦点、快捷键、空态、升级与可访问性 |
| [i18n](./design/i18n.md) | 双语言包、语言解析与格式化 |

## 接口契约（`contracts/`）

- [impl-contract.md](./contracts/impl-contract.md)：契约的代码事实来源索引、事件通道、IPC 错误码与 Mock 桥行为；类型以 `shared/types.ts` 为准。
- [protocol-mapping.md](./contracts/protocol-mapping.md)：三种 API 格式的参数、请求、SSE 与 URL 映射。
- [db-schema.md](./contracts/db-schema.md)：SQLite 结构、索引与迁移。
- [backup-format.md](./contracts/backup-format.md)：备份 ZIP、manifest 与加密格式。

## 架构决策（`adr/`）

ADR-001 Electron（非 Tauri）· ADR-002 浮层 portal 到 `document.body` · ADR-003 Mock 桥与主进程语义一致 · ADR-004 安装版数据放用户目录 · ADR-005 液态玻璃三轨道与 vendored 折射引擎。

ADR 只记录决策背景与后果；现行规则以 `design/` 和 `contracts/` 为准。新 ADR 用 `ADR-NNN-短标题.md`，含 Status / Date / Context / Decision / Consequences / Alternatives。

## 维护约定

- 新需求先登记 GitHub Issue 或 `requirements/active/`；实现后回写行为文档并更新需求状态。
- 每类现行规则只在一个 `design/` 文档维护，其他文档通过链接引用；类型和接口细节以 `shared/` 与 `contracts/` 为准。
- 需求文档保留决策、验收和性能证据，不另设性能报告目录；实施计划、审计等中间产物在收口时删除。
- 走查与探针截图写入 `build/e2e-shots/`（不入库）；`docs/screenshots/` 只保留 README 引用的 8 张精选图。
- 接口变更同步 `shared/types.ts`、Electron、Mock 桥和对应契约。
- 已完成需求移入 `requirements/archive/`；历史快照不再复制到入口文档。
