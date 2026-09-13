# 数据库结构契约（SQLite schema v3）

> 适用范围：`easyui.db` 表结构、索引、schema_migrations 迁移链（v1→v3）、旧数据回填规则。实现位于 `electron/db/`（迁移定义在 `electron/db/index.ts`）。
> 何时读取：新增/修改表列、写迁移、排查分支回填或旧备份恢复问题之前。
> 关联需求：无（结构变更需求先落 `../requirements/`）。
> 最后更新：2026-09-13
> 来源：原 prd.md §7.2 + 原 docs/impl-contract.md §11.1（已对照 electron/db/index.ts 核实列与索引）

连接与迁移机制：

- `PRAGMA journal_mode=WAL`、`foreign_keys=ON`。
- 迁移表 `schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)`，启动时按 version 升序自动执行未应用迁移（每个迁移在事务内，只跑一次）。

## 1. 表结构（v3 现状）

### providers（v1）

| 列 | 类型/约束 | 说明 |
| --- | --- | --- |
| `id` | TEXT PRIMARY KEY | uuid v4 |
| `name` | TEXT NOT NULL | 用户自定义名称 |
| `base_url` | TEXT NOT NULL | 存储时已去末尾 `/` |
| `api_format` | TEXT NOT NULL CHECK(`openai-chat`/`openai-responses`/`anthropic`) | |
| `api_key_cipher` | BLOB | **加密后**密钥密文（`v1:ss:`/`v1:mf:` 前缀），永不存明文；只在主进程 DB 存在 |
| `models_json` | TEXT NOT NULL DEFAULT '[]' | `ProviderModel[]`（含 `last_check`） |
| `created_at` / `updated_at` | INTEGER NOT NULL | |

### conversations（v1 + v2 + v3 列）

| 列 | 类型/约束 | 来源版本 | 说明 |
| --- | --- | --- | --- |
| `id` | TEXT PRIMARY KEY | v1 | |
| `title` | TEXT NOT NULL DEFAULT '' | v1 | |
| `provider_id` | TEXT REFERENCES providers(id) ON DELETE SET NULL | v1 | |
| `model` | TEXT | v1 | 模型切换不回溯历史消息 |
| `pinned` | INTEGER NOT NULL DEFAULT 0 | v1 | |
| `created_at` / `updated_at` | INTEGER NOT NULL | v1 | |
| `preset_id` | TEXT REFERENCES presets(id) ON DELETE SET NULL | v2 | null = 全局预设 |
| `overrides_json` | TEXT NOT NULL DEFAULT '{}' | v2 | 只存与"全局←选中预设"基线不等的键 |
| `active_leaf_id` | TEXT | v3 | 激活叶（空 = 最新一条为叶） |
| `reasoning_enabled` | INTEGER NOT NULL DEFAULT 1 | v3 | 会话级思考开关 |

索引：`idx_conv_updated ON conversations(updated_at DESC)`。

### messages（v1 + v3 列）

| 列 | 类型/约束 | 来源版本 | 说明 |
| --- | --- | --- | --- |
| `id` | TEXT PRIMARY KEY | v1 | |
| `conversation_id` | TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE | v1 | |
| `role` | TEXT NOT NULL CHECK(`system`/`user`/`assistant`) | v1 | |
| `content` | TEXT NOT NULL | v1 | |
| `reasoning` | TEXT | v1 | reasoning_content 落库 |
| `token_count` | INTEGER | v1 | 落库缓存（null = 未计） |
| `partial` | INTEGER NOT NULL DEFAULT 0 | v1 | 取消后已收部分落库标记 |
| `error_json` | TEXT | v1 | `{code,message}`（已脱敏） |
| `created_at` | INTEGER NOT NULL | v1 | 同级排序键之一 |
| `parent_id` | TEXT | v3 | 父消息 id；会话首条为 NULL |
| `reasoning_ms` / `ttft_ms` / `total_ms` | INTEGER | v3 | 生成统计 |
| `finish_reason` | TEXT | v3 | 原文保留 |

索引：`idx_msg_conv ON messages(conversation_id, created_at)`、`idx_msg_parent ON messages(parent_id)`（v3）。

### presets（v2）

| 列 | 类型/约束 | 说明 |
| --- | --- | --- |
| `id` | TEXT PRIMARY KEY | 全局预设 id = `'global'` |
| `name` | TEXT NOT NULL | |
| `is_global` | INTEGER NOT NULL DEFAULT 0 | 全局预设常驻、不可删、不可改名 |
| `params_json` | TEXT NOT NULL DEFAULT '{}' | 完整 `ParamValues` |
| `created_at` / `updated_at` | INTEGER NOT NULL | |

### settings（v1）

键值表：`key TEXT PRIMARY KEY, value TEXT NOT NULL`。实际用法为**单条记录** `key='general'`、`value` 为 GeneralSettings 的 JSON（读取时与 `DEFAULT_SETTINGS` 合并；设置页事实来源，见 `electron/db/settings.ts`）。

## 2. 迁移链（v1 → v3）

- **v1**：基础表（providers / conversations / messages / settings），conversations 含旧 `params_json`（完整 SessionParams）。
- **v2**：建 `presets` 表；conversations 加 `preset_id` + `overrides_json`；旧 `params_json`（SessionParams）→ overrides 纯函数迁移（规则见 `shared/params.ts` migrateLegacyParams，同时把 provider/model 提升到会话顶层字段）；全局预设按工厂默认幂等插入；删除旧 `params_json` 列。
- **v3**：messages 加 `parent_id`/统计列/`finish_reason` + `idx_msg_parent`；conversations 加 `active_leaf_id`/`reasoning_enabled`；按 (created_at, rowid) 顺序把 parent_id 回填成前一条消息（线性历史 → 树）。

## 3. 回填规则（`backfillParentLinks`，v3 迁移与旧备份恢复共用）

- 对每个会话按 (created_at, rowid) 升序扫描，`parent_id` 为 NULL 且不是序列首条的消息把 parent 指向前一条；已含非 NULL parent_id 的消息一律不动。
- 健康 v3 会话（仅根消息 parent_id 为 NULL 且为最老一条）上运行是无害的 no-op（幂等）。
- schema_version < 3 的旧备份恢复后复用同一回填函数。

> 消息全文搜索（FTS5）未实现，属路线图项（`../roadmap.md`）。
