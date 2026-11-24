# 本地数据与备份

> 权威范围：数据目录、启动迁移、自定义位置、UI 偏好持久化和备份/恢复流程。
> 何时读取：修改 `electron/paths.ts`、存储迁移、窗口/外观持久化或备份页之前。
> 代码事实来源：`electron/paths.ts`、`electron/storage-migrate.ts`、`electron/backup/`、`shared/appearance.ts`。
> 最后更新：2026-11-25

数据库结构见 `../contracts/db-schema.md`；备份 ZIP 与加密格式见 `../contracts/backup-format.md`。

## 1. 数据目录

解析优先级：**自定义指针 → 便携 exe 旁 `data/` → 安装版 `userData/data`**。

- 便携模式由打包运行时的 `PORTABLE_EXECUTABLE_DIR` 判定；安装版默认 `%APPDATA%/easy-webui/data`，卸载不删除业务数据。
- 指针文件在便携根为 `easywebui-data-dir.json`，安装版为 `userData/data-dir-pointer.json`，内容为 `{"dataDir":"…"}`。
- 启动顺序为 `resolveDataDir → migrateStorageDir → openDatabase`。
- 目标没有数据库时，从旧安装目录或临时解包目录中抢救首个有效数据目录；%Temp% 候选必须同时包含 `easyui.db` 和 `storage-layout.json`。
- `storage-layout.json` 的当前布局版本为 1，后续结构迁移通过 `LAYOUT_STEPS` 扩展。
- `logs/app.log` 按日轮转为 `app-YYYY-MM-DD.log`，启动时清理 7 天前的滚动文件；内容脱敏规则见 `./security.md`。

```text
data/
├── easyui.db(-wal/-shm)
├── keyring.bin
├── window-state.json
├── storage-layout.json
├── backups/
└── logs/app.log
```

## 2. 自定义位置

设置页修改数据目录时依次检查 `invalid_dir`、`noop`、目录嵌套和 `dir_not_writable`。

- 目标已有数据：只切换指针（`switched`）。
- 目标无数据：执行 WAL checkpoint 并完整复制（`migrated`）。
- 成功均返回 `needsRestart:true`，提示并执行重启；任何路径都不删除旧数据。

## 3. UI 偏好持久化

轻量偏好使用 `easyui_prefs` Cookie，并以同名 localStorage 兜底：主题、已解析语言、侧栏状态、右栏宽度，以及 `zoom`、字体、代码主题和字号等外观项。

- 外观项同时写入 SQLite GeneralSettings，设置页以其为事实来源；Cookie 用于 React 挂载前应用首帧，避免 FOUC。
- Cookie 值为 `encodeURIComponent(JSON)`，小于 2KB，有效期 365 天，`SameSite=Lax`，不设 HttpOnly。
- Cookie 不得包含敏感信息；业务数据一律进入 SQLite。外观值的归一化与白名单由 `shared/appearance.ts` 负责，CSP 哈希规则见 `./security.md`。

## 4. 备份与恢复

- 备份默认不含密钥；含密钥备份的密码要求与加密格式见 `../contracts/backup-format.md`（机器密文不得直接导出）。
- 恢复时依次验证 manifest、必要密码和事务导入。合并模式按 ID 跳过；覆盖模式需要二次确认，并先自动创建不含密钥的临时备份。
- 完成后报告平台、会话、消息、预设和跳过数量；备份列表支持打开目录与删除，确认规则见 `./ux-guidelines.md`。
- 列表缓存只保存成功解析的展示字段，按完整路径、尺寸和 mtime 失效；损坏、超限或已删除文件不进入缓存。
- 导入消息树时以线性 visiting/done 状态防环，成环节点降级挂根。
