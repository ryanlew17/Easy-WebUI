# 需求索引

> 适用范围：**增量需求**的唯一登记处。PRD 不内联需求正文；已实现功能的行为快照在 `../design/`，不转为需求。
> 何时读取：开始实现任何新需求之前——先在这里（或 GitHub Issues）定位需求 ID。
> 关联需求：本文件即需求索引。
> 最后更新：2026-09-13
> 来源：2026-09-13 文档架构升级新建（无历史需求，不编造；原 PRD 中已实现功能视为 design 快照）

## 需求表

| ID | 标题 | 状态 | 来源 | 影响模块 | 关联设计 | 更新时间 |
|---|---|---|---|---|---|---|
| _（暂无进行中的需求；新需求用 [REQ-TEMPLATE.md](./REQ-TEMPLATE.md) 在 `active/` 创建，登记后填入本表）_ | | | | | | |

## 状态流转

- `active`：进行中，文件在 [active/](./active/)。
- `done` / `cancelled`：移入 [archive/](./archive/)，本表保留一行（状态更新）。
- 来源优先级：**GitHub Issue > `active/*.md` > design 快照**（见 AGENTS.md）。

## 约定

- ID 格式 `REQ-YYYY-NNN`（如 `REQ-2026-001`）；对应 GitHub Issue 时在"来源"列写 `owner/repo#123`。
- 需求落地后：回写受影响的 `../design/` 快照，并在代码/测试注释标注 `@req REQ-YYYY-NNN`（或 `@issue #123`）。
- 模板：[REQ-TEMPLATE.md](./REQ-TEMPLATE.md)。
