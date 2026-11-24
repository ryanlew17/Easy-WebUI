# 需求索引

> 适用范围：**增量需求**的唯一登记处。PRD 不内联需求正文；已实现功能的行为快照在 `../design/`，不转为需求。
> 何时读取：开始实现任何新需求之前——先在这里（或 GitHub Issues）定位需求 ID。
> 关联需求：本文件即需求索引。
> 最后更新：2026-11-25
> 来源：增量需求登记与归档。

## 需求表

| ID | 标题 | 状态 | 来源 | 影响模块 | 关联设计 | 更新时间 |
|---|---|---|---|---|---|---|
| [REQ-2026-001](./archive/REQ-2026-001-security-audit-fixes.md) | 安全审计修复 | done | 内部安全审计与复审 | shared/、electron/、src/ | design/security.md、design/gateway.md、contracts/backup-format.md | 2026-11-01 |
| [REQ-2026-002](./archive/REQ-2026-002-input-and-protocol-safety.md) | 输入、工具链与升级摘要安全跟进 | done | 外部独立审查与范围扩展 | shared/、electron/、src/、构建与发布链 | contracts/impl-contract.md、contracts/protocol-mapping.md、design/security.md、design/ux-guidelines.md | 2026-11-01 |
| [REQ-2026-003](./archive/REQ-2026-003-performance-optimization.md) | 安全修复后的性能评估与深度优化 | done | REQ-2026-001 至 REQ-2026-002 修复与项目内性能评估 | electron/、src/、shared/、scripts/、tests/ | design/security.md、design/chat.md、design/message-tree.md、design/storage.md | 2026-11-02 |
| [REQ-2026-004](./archive/REQ-2026-004-node-26-electron-45-security.md) | Node 26 基线与 Electron 45 安全升级 | done | 用户安全基线与维护成本决策 | 构建工具链、electron/、scripts/、文档 | architecture.md、design/security.md、design/gateway.md、release.md | 2026-11-20 |
| [REQ-2026-005](./archive/REQ-2026-005-react-19-upgrade.md) | React 19 渲染基线升级 | done | 用户长期技术栈与组件生态维护决策 | package.json、package-lock.json、src/、tests/、文档 | architecture.md、design/popover.md、design/ux-guidelines.md、release.md | 2026-11-21 |
| [REQ-2026-006](./archive/REQ-2026-006-liquid-glass-visual-upgrade.md) | 液态玻璃视觉系统升级 | done | 用户视觉升级目标与已认可动机稿；依赖 REQ-2026-005 | src/、vite.config.mts、scripts/、tests/、文档 | adr/ADR-005、design/ui-liquid-glass.md、design/popover.md、design/ux-guidelines.md、architecture.md、release.md | 2026-11-25 |

## 状态流转

- `active`：进行中，文件在 `requirements/active/`。
- `done` / `cancelled`：移入 [archive/](./archive/)，本表保留一行（状态更新）。
- 来源优先级：**GitHub Issue > `active/*.md` > design 快照**（见 AGENTS.md）。

## 约定

- ID 格式 `REQ-YYYY-NNN`（如 `REQ-2026-001`）；对应 GitHub Issue 时在"来源"列写 `owner/repo#123`。
- 需求落地后：回写受影响的 `../design/` 快照，并在代码/测试注释标注 `@req REQ-YYYY-NNN`（或 `@issue #123`）。
- 每个需求最终只保留 1 个文档（背景 / 方案要点 / 验收标准 / 验收记录）；验收报告、交接清单、实施计划等中间产物精炼后提炼进需求文档，随即删除，不单独留档。
- 模板：[REQ-TEMPLATE.md](./REQ-TEMPLATE.md)。
