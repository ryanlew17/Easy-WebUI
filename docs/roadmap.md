# 路线图（候选，未排期）

> 适用范围：尚未实现的候选功能方向。**全部未排期、未承诺**；正式立项时转为 `requirements/active/` 中的 REQ（或 GitHub Issue）。
> 何时读取：规划新需求、评估某功能是否"已实现"时。
> 关联需求：无。
> 最后更新：2026-09-13
> 来源：原 prd.md §10（路线图部分）+ README.md / README.zh-CN.md 路线图条目

## 候选项

| 方向 | 说明 | 备注 |
| --- | --- | --- |
| 消息全文搜索 | SQLite FTS5，随写入同步更新 | db-schema 预留演进空间 |
| 纯文本附件 | 仅预留扩展点（非目标中排除文件解析/RAG） | |
| 长会话虚拟滚动 | 1 万条消息会话首屏 < 500ms 目标的后续手段 | 性能预算见 `design/ux-guidelines.md` §8 |
| macOS / Linux 打包实测 | electron-builder 配置就绪未实测 | |
| 会话导出为 Markdown | | |
| 更丰富的会话组织 | 搜索、分组/文件夹 | 来自 README 路线图 |
| 更多协议适配与供应商预置 | 随 API 演进补充 | 12 家预置见 `contracts/impl-contract.md` §5 |

## 流程

新需求一律先登记（GitHub Issue 或 `requirements/active/REQ-*.md`），不直接写进本文件或 `prd.md`；落地后从本表移除并回写对应 `design/` 快照。
