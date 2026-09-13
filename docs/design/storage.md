# 本地数据存储（目录体系与备份 UX）

> 适用范围：数据目录解析优先级（自定义/便携/安装版）、指针文件、旧数据抢救迁移、自定义位置变更流程、备份/恢复的用户流程。
> 何时读取：改 `electron/paths.ts` / `storage-migrate.ts`、设置页数据目录 UI、备份页之前。
> 关联需求：无（v1.0.1 现状快照）。
> 最后更新：2026-09-13
> 来源：原 prd.md §7.1/§7.3 + 原 docs/impl-contract.md §10.1（两份重复内容合并）；表结构见 `../contracts/db-schema.md`，备份格式见 `../contracts/backup-format.md`

## 1. 目录解析优先级

**自定义指针 → 便携 exe 旁 `data/` → 安装版 `userData/data`**。

- 便携判定：打包且存在 `PORTABLE_EXECUTABLE_DIR`（electron-builder portable 运行时注入；修复「便携版数据落 %TEMP% 解包目录」）。
- 安装版默认 `%APPDATA%/easy-webui/data`（从早期"exe 旁 data/"改为用户目录，修复 NSIS 重装清空安装目录丢数据）；重装/覆盖安装/卸载均不动它（`nsis.deleteAppDataOnUninstall=false`）。
- 指针文件：便携 → 便携根 `easywebui-data-dir.json`；安装版 → `userData/data-dir-pointer.json`，内容 `{"dataDir":"…"}`。

## 2. 启动顺序与旧数据抢救

`resolveDataDir` → `migrateStorageDir` → `openDatabase`。

- `migrateStorageDir`（**旧数据抢救**）：目标目录无 easyui.db 时从 legacy 目录列表（旧安装目录、%Temp% 解包目录等）首个含 db 的目录整体复制。
- 布局版本标记 `storage-layout.json`，当前 `STORAGE_LAYOUT_VERSION = 1`（扩展点 = LAYOUT_STEPS 数组），大版本结构变更可自动迁移。

## 3. 自定义位置变更（设置页 → 通用 → 数据存储路径）

- 校验链：`invalid_dir` → `noop`（同目录）→ `dir_inside_current`（子/父目录嵌套）→ `dir_not_writable`。
- 目标已有数据 → 仅写指针（`switched`）；否则 `wal_checkpoint(TRUNCATE)` + 全量复制（`migrated`）。
- 成功均 `needsRestart: true`，渲染层提示重启，`relaunchApp()` 执行 `app.relaunch()+exit(0)`。
- **任何路径都不删除旧数据**。

## 4. 目录结构

```
data/
├── easyui.db(-wal/-shm)   # SQLite 主库（WAL）
├── keyring.bin            # safeStorage 不可用时的回退密钥材料（权限 600）
├── window-state.json      # 窗口尺寸/位置记忆
├── storage-layout.json    # 存储布局版本标记
├── backups/               # 备份 zip 默认输出位置
└── logs/app.log           # 按日轮转，保留 7 天
```

## 5. 备份与恢复 UX（设置页「备份管理」）

1. **导出** `easyui-backup-YYYYMMDD-HHmm.zip`（格式与加密见 `../contracts/backup-format.md`）。
2. **不含密钥（默认）**：恢复后平台其余配置可用，仅需补填密钥。
3. **含密钥**：独立备份密码（≥8 位，二次确认），scrypt + AES-256-GCM 加密密钥明文列表。
4. **恢复**：选 zip → 验 manifest → 含密钥先验密码 → 事务内导入；**合并**（按 id 跳过，默认）/ **覆盖**（清表重导，二次确认 + 自动先做一份不含密钥的临时备份）；完成后报统计（平台/会话/消息/预设/跳过数）。
5. 备份列表支持打开目录与删除（删除需确认）。
