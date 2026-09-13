# ADR — 架构决策记录

> 适用范围：重要技术决策的背景、选项与后果（为什么选 X 不选 Y）。决策**生效后的现行规则**在 `../design/` 与 `../contracts/`，ADR 只记录决策过程。
> 何时读取：想推翻或重新评估某项既有决策时；做同类型新决策前。
> 关联需求：无。
> 最后更新：2026-09-13
> 来源：2026-09-13 文档架构升级新建；同日回溯补录 ADR-001 至 ADR-004

## 索引

| 编号 | 标题 | 状态 | 日期 |
|---|---|---|---|
| [ADR-001](./ADR-001-electron-over-tauri.md) | 选择 Electron 而非 Tauri（Desktop Shell） | Accepted | 2026-09-13 |
| [ADR-002](./ADR-002-popover-portal.md) | 一切浮层 portal 到 body（Popover Portal） | Accepted | 2026-09-13 |
| [ADR-003](./ADR-003-mock-bridge.md) | Mock 桥双实现（Web 预览与主进程语义一致） | Accepted | 2026-09-13 |
| [ADR-004](./ADR-004-userdata-data-dir.md) | 数据目录默认落在 userData 而非安装目录 | Accepted | 2026-09-13 |

> ADR-001 至 ADR-004 为 2026-09-13 回溯补录（决策事实在 v0.1.x–v1.0.1 已落地，文档化晚于决策）。

## 文件格式

`ADR-NNN-短标题.md`，头部字段：Status（proposed / accepted / superseded by ADR-XXX）/ Date / Deciders / Supersedes / Superseded by；正文：Context（背景）/ Decision（决策）/ Consequences（后果）/ Alternatives Considered（备选方案）。
