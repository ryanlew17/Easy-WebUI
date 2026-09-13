# design — 模块行为设计快照

> 适用范围：各模块**当前已实现的稳定行为**——模块是什么、行为规则是什么。不存放增量需求（→ `../requirements/`）与接口字段（→ `../contracts/`）。
> 何时读取：按 AGENTS.md 路由按需读取对应模块文档；不要默认全量读取。
> 关联需求：无（本文档为 v1.0.1 现状快照）。
> 最后更新：2026-09-13
> 来源：原 prd.md §3–§9 + 原 docs/impl-contract.md §7/§9–§11（2026-09-13 文档架构升级拆分）

## 文档索引

| 文档 | 模块 | 何时读取 |
| --- | --- | --- |
| [provider.md](./provider.md) | 模型平台管理（字段/预置模板/检测/格式探测） | 改设置页平台相关 UI、平台 IPC、检测逻辑 |
| [chat.md](./chat.md) | 会话页布局、生成编排、思考开关、生成统计 | 改会话页/生成链路/统计展示 |
| [params.md](./params.md) | 参数与预设系统（LM Studio 式，schema v2） | 改参数面板/预设/覆盖语义 |
| [context-trim.md](./context-trim.md) | 上下文裁剪与计量 | 改 trim.ts、上下文计量环 |
| [message-tree.md](./message-tree.md) | 树形分支模型与消息操作（schema v3） | 改分支/删除/气泡操作 |
| [title.md](./title.md) | 会话标题生成（自动/手动） | 改标题链路 |
| [gateway.md](./gateway.md) | 主进程 Provider Gateway 行为总览 | 改 gateway/ 模块（细节看 contracts/protocol-mapping.md） |
| [storage.md](./storage.md) | 本地数据目录、迁移、备份 UX | 改 paths/storage-migrate/备份页 |
| [security.md](./security.md) | 密钥加密、脱敏、渲染进程安全、隐私 | 改 crypto/、CSP、任何接触密钥的代码 |
| [ui-liquid-glass.md](./ui-liquid-glass.md) | 液态玻璃视觉系统（令牌/主题/缩放/气泡/图标/动效） | 改任何视觉/样式 |
| [i18n.md](./i18n.md) | 国际化规则 | 加/改任何用户可见字符串 |
| [popover.md](./popover.md) | 浮层 portal 规则与 InfoTip | 改浮层/下拉/提示组件 |
| [ux-guidelines.md](./ux-guidelines.md) | 焦点/快捷键/空状态/错误文案/关于页升级/可访问性 | 改交互细节与设置页第五标签 |

## 与其他文档的边界

- **接口、字段、协议映射、格式** → `../contracts/`（本目录只描述行为与规则）。
- **宏观产品（定位/用户/非目标/模块地图）** → `../prd.md`。
- **技术选型、进程架构、目录结构** → `../architecture.md`。
- 行为变更类需求 → `../requirements/active/`，落地后回写本目录快照。
