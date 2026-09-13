# 树形分支与消息操作（schema v3）

> 适用范围：消息树模型（parent_id + active_leaf_id）、激活路径解析、分支操作语义（发送/分叉/重生成/续写/切换/删除）、气泡操作与批量选择。
> 何时读取：改 `electron/db/messages.ts`、分支导航 UI、消息操作按钮、`src/bridge/mock.ts` 分支逻辑之前；**此处的行为改动需要回归测试（tests/db-messages.test.ts）**。
> 关联需求：无（v1.0.1 现状快照）。
> 最后更新：2026-09-13
> 来源：原 prd.md §4.5 + 原 docs/impl-contract.md §11.1；列级契约见 `../contracts/db-schema.md`，API 见 `../contracts/impl-contract.md` §2

## 1. 模型

- 消息是 **parent_id 树**；`conversations.active_leaf_id` 指向激活叶（空 = 最新一条为叶）。
- `listMessages` 返回根 → 激活叶的线性路径；路径上同 parent 子消息数 >1 的消息带 `branch={index, count, ids}`（同级按 created_at,rowid 排序，index 从 1 起）。
- v2→v3 迁移与旧备份恢复共用 `backfillParentLinks()` 回填（幂等，规则见 `../contracts/db-schema.md` §3）。

## 2. 操作语义

| 操作 | 语义 |
| --- | --- |
| `sendMessage` | 新 user 消息 parent = 当前激活叶；`siblingOf`（编辑后重发）时 parent = 原消息的 parent → **开新分支，原分支保留** |
| `setActiveLeaf`（branch 按钮） | 激活叶精确设为该消息——"在此消息之后分叉聊天"，之后 sendMessage 即在其下开辟新分支 |
| `regenerateMessage` | 目标 assistant 的 parent 下新建同级分支（**不删除旧分支**），激活叶切到新分支 |
| `switchBranch` | 激活叶 = 目标分支最深后代（分叉取最新子） |
| `continueMessage` | 不建行，delta 追加到同一消息（计时/字数对总内容累计，见 `./chat.md` §4） |
| `generateResponse` | 激活叶为 user 时直接生成 assistant 子消息；否则报 `nothing_to_generate` |
| `updateMessageContent` | assistant 原地改内容，不触发生成 |
| `deleteMessages` | 各节点子树连删（事务）；**激活叶在被删子树内时回退到最近存活祖先、再下钻其最新存活后代**（删除后再解析，保证 2/2 分支删除其一后另一分支完整可达；全删光置 NULL）；同级只剩 1 支后不渲染 `‹1/1›` 徽标 |

**不变量：任何分支操作/删除不得破坏其他分支的可达性，删除后激活路径必须恢复到存活分支。**

## 3. 气泡操作 UI

- user/assistant 均有 branch/copy/edit/delete 四个 icon 按钮（统一 `IconButton` + `icons.tsx` 图标库，见 `./ui-liquid-glass.md` §6）；assistant 额外 regenerate/continue；生成中全部禁用。
- 分支导航 `‹ n/N ›` 只在 count>1 时出现（取自 `branch` 元数据）。
- **右键任一气泡进入批量选择模式**：左侧统一对齐的复选框列、隐藏其余操作（分支导航暂隐藏），底部浮层显示计数 + 删除 + 退出（Esc 亦可）；delete 弹确认框。
