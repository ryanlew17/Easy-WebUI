# 消息树与分支操作

> 权威范围：消息树模型、激活路径、分支操作、删除恢复和批量选择语义。
> 何时读取：修改消息 DAO、分支导航、消息操作或 Mock 分支逻辑之前。
> 代码事实来源：`electron/db/messages.ts`、`src/bridge/mock.ts`、`src/pages/chat/MessageBubble.tsx`。
> 最后更新：2026-11-25

列结构见 `../contracts/db-schema.md`；生成流程见 `./chat.md`；视觉和焦点规则见 `./ui-liquid-glass.md`。

## 1. 数据模型与不变量

- 消息以 `parent_id` 构成树，`conversations.active_leaf_id` 指向激活叶；空值表示以最新消息为叶。
- `listMessages` 返回根到激活叶的线性路径。路径上同 parent 子消息数大于 1 时附带 `branch={index,count,ids}`；同级按 `created_at,rowid` 排序，index 从 1 开始。
- v2→v3 与旧备份恢复共用幂等的 `backfillParentLinks()`。不可信导入中的环必须断边挂根，所有子树遍历使用 `visited` 防环。
- 树操作共享当次 id/children 索引，避免逐节点 SQL；删除分批执行，并与激活叶恢复处于同一事务。Mock 保留相同索引和防环语义。

**任何操作不得破坏其他分支的可达性；删除后激活路径必须解析到存活分支。**

## 2. 操作语义

| 操作 | 树行为 |
| --- | --- |
| `sendMessage` | 新 user 消息以当前激活叶为 parent；编辑后重发通过 `siblingOf` 以原消息 parent 为 parent，保留原分支 |
| `setActiveLeaf` | 将激活叶精确设为所选消息，后续发送从该消息分叉 |
| `regenerateMessage` | 在目标 assistant 的 parent 下新建同级分支，不删除旧分支 |
| `switchBranch` | 激活叶切到目标分支最深后代；分叉取最新子 |
| `continueMessage` | 不新建节点，追加到同一 assistant 消息 |
| `updateMessageContent` | 原地修改 assistant 内容，不触发生成 |
| `deleteMessages` | 事务内删除各节点子树；激活叶被删时先回退到最近存活祖先，再下钻最新存活后代；全删后置 NULL |

生成入口的节点位置和资格检查由 `./chat.md` 统一描述。

## 3. 消息操作与批量选择

- user/assistant 提供 branch/copy/edit/delete，assistant 另有 regenerate/continue；生成中禁用这些操作。
- 分支导航仅在 `count > 1` 时显示，不渲染 `‹1/1›`。
- 右键气泡进入批量选择：复选框统一在左侧，隐藏普通操作和分支导航；底部工具栏提供计数、删除和退出。整个 24px 勾选包装区均可切换。
- 进入分叉点时，会话页临时记录原激活叶并在顶栏提供“返回原分支”；这只恢复激活路径，不改变消息树或分支数据。通过分支导航回到该叶时入口自动清除；记录返回点时同时保存原激活路径，删除路径上任一祖先后立即清除入口，不保留指向已删子树的无效操作。
- 选择模式的浮层互斥与草稿保留见 `./ui-liquid-glass.md`；删除确认与 Esc 行为见 `./ux-guidelines.md`。
- 修改本文件所述行为必须回归 `tests/db-messages.test.ts`。
