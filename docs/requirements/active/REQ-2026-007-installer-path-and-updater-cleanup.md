# REQ-2026-007：安装器路径选择、数据迁移与 updater 清理

状态：active
来源：owner（安装可配置性与磁盘占用决策，2026-11-25）
关联设计：`docs/design/storage.md`、`docs/adr/ADR-004-userdata-data-dir.md`、`docs/adr/ADR-006-installer-assisted-and-data-handoff.md`、`docs/architecture.md`、`docs/release.md`、`docs/design/ux-guidelines.md`；新增安装器契约 `docs/contracts/installer.md`（本需求交付）
影响模块：`package.json`（nsis）、`installer/`（新增）、`electron/`（main／paths／storage-migrate／ipc／updater）、`shared/types.ts`、`src/pages/settings/`、`src/i18n/`、`scripts/`、`tests/`、`docs/`（contracts／design／architecture／release）
非目标：便携版行为变更；macOS／Linux 安装器；自动删除旧数据；跨 Windows 用户共享同一数据目录；数据目录漫游或云同步；安装包签名与更新通道调整；安装器液态玻璃皮肤（见 ADR-006）。

## 背景

当前 Windows 安装包是一键安装（`oneClick` 未配置，默认 true），用户无法选择安装目录；数据目录固定为 `%APPDATA%\easy-webui\data`，只能在应用内设置页切换且必须重启。覆盖安装始终沿用注册表记录的旧目录，无法把程序迁到其他磁盘。同时 electron-updater 下载的安装包长期留在 `%LOCALAPPDATA%\easy-webui-updater\pending`，NSIS 又把安装器复制为差量基线；单份约等于 Setup 体积（当前 140,239,311 B ≈ 134 MiB），一轮更新后合计约 2×134 MiB，安装成功后不清理，持续占用用户磁盘。

需求要求：安装时可改安装路径与数据路径；覆盖安装或检测到已有安装时另选路径安装应触发完整迁移，数据路径变更包含在迁移流程内；安装后首次启动清理 updater 缓存，清理范围由用户选择。本需求仅作用于安装版，便携版行为不变。

## 已确认决策

| # | 决策 | 影响 |
|---|---|---|
| 1 | 保留 per-machine 选项 | 安装模式页保留；需覆盖 UAC 提权、HKLM 注册表、跨用户数据语义与双模式测试矩阵 |
| 2 | 覆盖安装默认“不更改”数据目录 | 安装页默认不改数据位置，避免静默改写已有自定义指针 |
| 3 | 迁移后提供删除旧数据的显式操作 | 新增迁移记录与删除入口；删除前二次确认，绝不自动执行 |
| 4 | 支持 `/DATADIR=` 自定义参数 | 静默安装与自动化测试可用；与交互页共用 NSIS 侧校验，与 Node 侧按契约对拍 |
| 5 | 卸载同样清 updater 缓存 | 新增 `customUnInstall`；受 per-machine 与用户配置目录限制 |
| 6 | 指针失效明确报错 + 阻断 | 取消现有静默回落到 `userData/data` 的行为，避免双份数据分叉 |
| 7 | 安装路径必须为纯 ASCII | 中文页提示、英文页不提示但同样校验；非法默认值红色路径 + 错误条 + 禁用“下一步”，不改写、不换盘、不弹窗；Electron 中文路径兼容问题多，接受中文用户名手动改选；`--updated` 静默更新沿用旧目录、不做该校验 |
| 8 | updater 清理范围由用户选择 | 首启清理入口默认仅清下载残留并保留加速文件；全清选项显示警告条；更高版本待装包始终保留 |

## 方案要点

### 1. 安装器形态与安装路径

- `nsis` 改为引导式安装：`oneClick: false`、`allowToChangeInstallationDirectory: true`；不设 `perMachine`，保留安装模式页（仅当前用户／所有用户），`allowElevation` 保持默认，per-machine 选择由 UAC 提权完成。
- 自定义脚本放 `installer/installer.nsh` 并通过 `nsis.include` 引用。`build/` 已被 `.gitignore` 覆盖，不得把脚本放该目录。
- 覆盖安装：目录页默认值取注册表 `InstallLocation`；用户改目录后由模板 `uninstallOldVersion` 先卸载旧版本（旧卸载器执行 `RMDir /r $INSTDIR`），再安装到新目录，注册表项与快捷方式随之重写。程序侧无需自写迁移逻辑。
- **最终路径以模板改写后为准**：模板在 instfiles pre 阶段用大小写敏感的 `StrContains` 检查 `$INSTDIR` 是否含 `${APP_FILENAME}`，不含则追加子目录（`assistedInstaller.nsh:33-38`）。用户选 `D:\Apps` 实际安装到 `D:\Apps\Easy WebUI`；输入小写 `d:\apps\easy webui` 会被再追加一层。页面离开早于该改写，因此页面必须按同一规则计算并展示“实际安装到”的路径，长度、ASCII、嵌套与可写校验及意图 `installDir` 均使用该预测值；`customInstall` 再以模板实际改写后的 `$INSTDIR` 复核，不一致时走安全侧（不迁移，应用守卫会丢弃意图）并记录安装器日志。
- 安装路径校验，页面进入、每次编辑、页面离开与 `customInstall` 各执行一次：
  - 绝对路径；所有字符位于 U+0020–U+007E（即不含任何非 ASCII 字符）；不含 Windows 非法字符 `<>:"|?*`；不以空格或点结尾；长度 ≤180（按最终路径计算）。
  - 可写探测（创建并删除临时文件）；per-machine 模式允许受保护目录，由提权完成写入。
  - 中文 UI 在目录页显示“安装路径需为纯英文”的提示行；英文 UI 不显示该提示。两种 UI 下非 ASCII 路径均阻断，错误文案使用当前 UI 语言。
  - **规则依据**：Electron 在中文路径下的安装、更新与提权链路兼容问题多、维护成本高，因此安装路径限定为纯 ASCII。中文用户名导致默认路径非法时，由错误条引导用户改选。
  - **更新豁免**：`${isUpdated}` 静默更新不做 ASCII 与长度校验，沿用注册表中的现有安装目录，避免历史非 ASCII 路径的安装无法升级；交互安装与显式指定新目录仍执行全部规则。
- **就地错误状态，不使用弹窗**：
  - 进入目录页即校验默认值。默认值非法时（典型场景：中文用户名使 `%LOCALAPPDATA%\Programs\...` 含非 ASCII 字符），路径输入框文字显示为红色、错误条展开并给出具体原因，“下一步”保持不可交互（禁用态，不响应点击与回车）。
  - 不自动改写默认值、不自动切换到其他磁盘；用户必须手动改选合规路径后才能继续。`customInstall` 仍重复校验（`--updated` 除外），防止绕过。
  - 用户编辑路径或浏览选择目录时实时重算；错误原因变化时更新错误条文案，合法时收起错误条并恢复“下一步”。
  - 所有校验反馈均以错误条显示/收起表达，不得以弹窗提示；“下一步”禁用期间不存在可触发弹窗的路径。
  - 错误条使用文字说明为主、红色为辅，不得仅靠颜色传达状态；安装器语言为 zh_CN／en_US 时文案随之切换。
- 数据目录与安装目录不得相等，也不得互为父子；与 `setDataDir` 的 `dir_inside_current` 语义一致并补齐相等判断。

### 2. 数据目录：安装期意图 + 首启迁移

安装器不复制数据、不写指针，只记录意图；迁移由应用在 `openDatabase` 之前完成，因此无需重启。

- **安装页**：目录页之后插入自定义页；默认“不更改”，勾选后可输入或浏览。仅安装版显示。
- **意图写入位置**：交互模式在自定义页离开时写入——页面回调运行在 UAC 提权前的外层实例，`$APPDATA` 属于发起安装的用户；静默模式在 `customInit` 从 `/DATADIR=` 写入，并按 §1 同一规则从 `/D=`／`$INSTDIR` 计算最终安装路径，以 `${ifNot} ${UAC_IsInnerInstance}` 保证只有外层实例落盘。`customInstall` 只复核并写完成凭据，不写意图，避免提权后写到管理员账户的配置目录。
- **静默与更新**：`${isUpdated}`（electron-updater 以 `/S --updated --force-run` 调用）与无 `/DATADIR=` 的静默安装均不写意图、不改数据位置；交互页在 `--updated` 下跳过。
- **参数**：`/DATADIR="D:\EasyData"` 为数据目录；`/D=` 为 NSIS 原生安装目录参数（必须位于命令行末尾且不加引号）。静默模式下页面回调不参与校验，调用方传入的 `/D=` 必须就是最终安装目录；`customInstall` 以实际 `$INSTDIR` 复核，不一致时应用按守卫丢弃意图并在安装日志告警。静默模式参数非法时以非零错误码退出，不弹窗。静默 per-user 安装未提供 `/D=` 且默认路径含非 ASCII 时，同样按规则以非零码退出，调用方必须显式传入合规路径。使用另一管理员账户凭据提权的静默 per-machine 安装无法确定发起用户，不得写意图，以专用错误码退出；需要该组合时改用 per-user 静默安装，限制写入契约。
- **校验**：规则以 `docs/contracts/installer.md` 为唯一事实来源。安装器不能执行 Node，因此 NSIS 与 Node 各实现一份，用同一组边界用例对拍：非 ASCII、非法字符、结尾空格或点、180 长度、UNC、与最终安装目录嵌套、目标非空。应用侧复用 `setDataDir` 的绝对路径、嵌套与可写校验，并新增 UNC 拒绝；迁移核心抽为共享函数。
- **意图文件**：`%APPDATA%\<APP_PACKAGE_NAME>\installer-intent.ini`，UTF-16LE + BOM，行式 `key=value`：

  | 键 | 说明 |
  | --- | --- |
  | `schema` | 固定 `1` |
  | `mode` | `custom` |
  | `dataDir` | 用户选择的数据目录 |
  | `installDir` | 模板改写后的最终安装目录，作为生效守卫 |
  | `installerVersion` | 安装包版本，作为生效守卫 |
  | `writtenAt` | ISO 8601 UTC 时间 |

  - 每次安装（含交互、静默与 `--updated`）开始时，外层实例先删除遗留意图；仅在交互确认或 `/DATADIR=` 时重新写入。应用成功处理、终态拒绝或用户取消后同样删除。
  - **生效守卫**：`installDir` 是页面按模板规则预测、`customInstall` 复核的值，应用最终以 `path.dirname(process.execPath)` 实测比对。消费前必须同时满足 `schema=1`、`installDir` 与实测安装目录相等（Win32 大小写不敏感）、`installerVersion` 等于 `app.getVersion()`。
  - **安装完成凭据**：`customInstall` 在 `$INSTDIR` 写入 `install-commit.ini`（UTF-16LE，含 `installerVersion`、`installDir`、`completedAt`）。应用额外要求该文件存在、版本一致且 `completedAt >= writtenAt`；缺失或早于意图即判定安装未完成（取消、失败或回滚），删除意图并正常启动。该凭据与路径守卫共同覆盖“意图已写但安装未完成”的窗口。任一守卫不满足均只删除意图、继续普通启动，不执行迁移。
  - 读取按 UTF-16LE 解码并显式剥离 BOM（Node 会将其读成 `\uFEFF`）。不写 JSON、不写指针：NSIS 无法可靠输出 UTF-8，且指针提前指向空目录会在复制失败时表现为“数据丢失”。
- **首启与迁移状态机**（`resolveDataDir → 读意图 → 守卫 → 目标判定 → 迁移 → openDatabase`）：
  1. `resolveDataDir` 沿用旧指针得到源目录；源目录不存在、为空或不含 `easyui.db` 时不复制，直接写指针与 journal（`status=fresh`），删除意图。源指针失效按 §5 处理，阻断对话框把意图目标列为候选项。
  2. **目标判定必须 marker-first**：
     - 目标与源为同一目录：`noop`，删除意图，不写指针、不迁移。
     - 存在 `.migrating`：上次迁移未完成，目标内容均视为本次副本，清空目标后重新复制，**绝不进入 `switched`**。
     - 无标记且存在 `easyui.db` 或 `storage-layout.json`：`switched`，只写指针、写 journal、删除意图。
     - 无标记且目录为空：执行迁移。
     - 无标记但含其他文件：终态拒绝，不复制、不写入、不覆盖。
  3. 迁移：写 `.migrating` → 用 better-sqlite3 打开源库执行 `wal_checkpoint(TRUNCATE)` 后关闭 → 复制主库 `easyui.db`（不复制可再生的 `-wal`／`-shm`）、`keyring.bin`、`window-state.json`、`storage-layout.json`、`backups/`（排除 `logs/`）→ 打开目标库执行 `PRAGMA quick_check` → 以临时文件 + rename 原子写指针 → 写 journal → 删除标记与意图。
  4. 失败分类：
     - 可重试（复制中断、磁盘满、目标权限、checkpoint busy、`quick_check` 失败）：删除目标内本次副本、保留 `.migrating` 与意图，写 journal（`status=failed`，附错误码），继续使用旧数据，每个应用版本提示一次；下次启动重试或在设置页手动重试。重试为整目录重来，不做断点续传。
     - 终态（目标含外来文件、路径校验不通过）：删除标记与意图，写 journal（`status=failed`），保留源，提示一次后转入普通启动。
  5. 取消：splash 提供取消；取消等同删除本次副本与意图、写 journal（`status=cancelled`）、保留源，不自动重试。
  6. splash 使用异步分块复制（stream 或 worker）与字节进度；不得用 `fs.cpSync` 同步复制冻结主进程。迁移可能达 GB 级（`backups/`）。
- **迁移记录**：`<当前生效数据目录>/migration-journal.json`（成功切换后为目标目录，失败或取消时仍为源目录）记录 `from`／`to`／`status`（`completed|switched|fresh|failed|cancelled`）／`completedAt`／`quickCheck`／`retainedBytes`，供删除旧数据、设置页展示与诊断使用。设置页迁移与安装期迁移共用同一结构与同一迁移核心，`needsRestart` 差异由调用方决定。
- **多用户语义**：安装期选择的数据目录只对执行安装的 Windows 用户生效（意图与指针均在 `%APPDATA%`）。per-machine 安装后，其他用户首次启动使用各自默认数据目录；不提供机器级共享数据目录。

### 3. 旧数据删除（显式）

- 仅对 `status=completed` 的迁移记录，在首启清理对话框与设置页“数据位置”区域提供“删除旧数据目录”入口，展示旧路径与占用空间；`switched`（目标已有数据）与 `fresh`（无源数据）不提供入口。该操作独立于 updater 清理选项，永不随默认策略执行。
- 仅当旧目录可识别为 Easy WebUI 数据目录（同时含 `easyui.db` 与 `storage-layout.json`）、且不等于当前数据目录、不等于安装目录、不位于安装目录内时可操作。
- 二次确认列出完整路径与影响；确认后递归删除并清除迁移记录；失败只报错，不自动重试。
- 不存在任何自动删除路径；用户不操作时旧数据永久保留（沿用 ADR-004）。

### 4. updater 缓存清理（策略由用户选择）

- **入口与时机**：安装版在安装或升级后的首次启动展示清理对话框（模态，窗口就绪后弹出，处理或关闭后进入主界面），每个应用版本只展示一次。该对话框就是“删除旧数据目录”的承载入口，包含两个相互独立的区块：updater 清理选项、旧数据目录删除（仅存在可删除的 `completed` 迁移记录时显示；否则只显示 updater 区块）。设置页“数据位置／存储”区域保留同一入口，复用相同的选项、警告条与关闭语义，可重复执行。若既无可清理的 updater 缓存、又无可删除的旧数据目录，则不显示该对话框。
- **目录定位与安全**：由 `resources/app-update.yml` 的 `updaterCacheDirName` 按行正则提取，兜底 `app.getName() + '-updater'`（不引入 YAML 依赖）；操作前断言解析结果的父目录等于 `%LOCALAPPDATA%` 且 basename 以 `-updater` 结尾，防止目录名为空时误删缓存根。
- **updater 选项（单选，默认第一项）**：
  - **仅清理下载残留（默认）**：删除 `pending/` 内安装包与 `update-info.json`，以及缓存根除 `installer.exe`、`current.blockmap` 外的陈旧文件。保留的这两个文件是 NSIS 安装时刷新的差量基线（`installer.nsh:93`、`NsisUpdater.js:49`），使下一次在线更新仍为差量下载。UI 不出现技术文件名，使用“保留更新加速文件（约 134 MB）”一类表述，最终文案在 i18n 定稿。
  - **全部清理**：删除整个 updater 缓存，含加速文件。选中时对话框内显示警告条：“下次更新需要重新下载完整安装包（约 134 MB），可能消耗更多流量与时间”；执行前再次确认。
  - **全局保留规则（优先于上述两项）**：不删除“已下载但版本高于当前”的 `pending/` 包，并在选项中标注“已下载的新版本将保留”。版本比较必须包含 prerelease 段，不得复用丢弃尾签的 `compareSemver`，否则 `1.2.0-beta.2` 与 `1.2.0-beta.1` 会判等。
- **关闭语义**：直接关闭对话框等同按默认项执行，保证首启清理不落空；删除旧数据永不随默认项或关闭动作执行。
- **失败处理**：删除失败（安装器进程仍占用自身 exe）时记录所选策略与待重试状态，下次启动按同一策略静默重试，不再弹窗；日志记录所选策略、释放字节与保留大小。
- 仅安装版执行（`app.isPackaged && !PORTABLE_EXECUTABLE_DIR`）。
- **卸载**：`customUnInstall` 先 `SetShellVarContext current`，自动删除当前用户整个 updater 缓存（含 `installer.exe`、`current.blockmap`、`pending/`），不触碰 `%APPDATA%` 数据；模板在 per-machine 卸载中同样会切回 current（`uninstaller.nsh:234-236`）。per-machine 卸载只清理执行卸载的用户，其他用户缓存由其下次启动清理，此限制写入发布说明。

### 5. 指针失效阻断

- 安装版中指针存在但目标不可用（不存在、不可写、盘符未挂载）时，不再回落到 `userData/data`：主进程弹阻断对话框（重试／选择新目录／退出），未处理前不打开数据库、不写入任何新数据、不覆盖指针。
- 若同时存在通过守卫的安装意图，对话框增加“使用安装时指定目录”选项；仅当该目标已有可用数据（`easyui.db` 或 `storage-layout.json`）时可用，目标为空时禁用并说明“源数据不可用，无法迁移”。该选项优先于“选择新目录”，避免用户重复选择。
- 便携版保持现有回退行为（便携根不可写 → `userData/data`）。
- 校验指针时不得为探测而创建目标目录（避免在错误路径留下空目录）。

### 6. 契约与文案

- 新增 IPC：`getMigrationJournal`／`deleteOldDataDir`／`dismissMigration`（清除迁移失败提示）／`getCleanupState`／`runUpdaterCleanup`（策略：`pending` 或 `all`）；同步 `shared/types.ts`、`electron/preload.ts`、`src/bridge/mock.ts`。已提示版本、所选策略与待重试状态写入设置，保证每个版本只弹一次且失败后静默重试。
- 应用侧新增文案（迁移进度、失败说明、清理选项与警告条、加速文件说明、删除确认与结果）同时写入 `zh-CN`／`en-US`；安装器文案由 NSIS `LangString` 提供 zh_CN／en_US 两套，随系统语言选择，不进入应用 i18n。清理选项面向用户使用“下载残留／更新加速文件”表述，不暴露 `pending`、`installer.exe` 等技术名。
- 安装器契约 `docs/contracts/installer.md` 属于本需求交付物，内容与实现同步验收，见「交付物」。契约至少覆盖：`instFilesPre` 最终路径改写、意图写入实例与 UAC inner 守卫、意图生效守卫、marker-first 状态机、失败分类与错误码（含静默退出码）、卸载 shell 上下文、prerelease 版本比较、差量基线保留、`app-update.yml` 行解析与意图 BOM 处理。

### 7. 视觉与文档归属

- **不采用液态玻璃**：NSIS 是原生 Win32 向导，无法渲染 CSS／`backdrop-filter`／WebGPU；owner-draw 皮肤与 Electron bootstrapper 分别带来高维护成本与 100 MB 级体积、提权、签名及可达性风险。安装器保留系统原生控件与高对比度、DPI、键盘行为，仅使用与应用视觉语言一致的静态 sidebar／header 位图与图标。
- **文档归属**：决策记录在 `docs/adr/ADR-006-installer-assisted-and-data-handoff.md`；契约与行为快照按「交付物」执行。不新增 `docs/design/installer.md`：安装器无应用内界面，首启迁移与删除入口属于存储与设置行为。

## 交付物

以下文档属于本需求范围，随实现一起提交与验收：

| 文档 | 类型 | 必须包含 |
| --- | --- | --- |
| `docs/adr/ADR-006-installer-assisted-and-data-handoff.md` | 决策记录 | 安装器形态、意图交接、ASCII 规则、不采用玻璃等决策与备选方案 |
| `docs/contracts/installer.md` | 新增 | `/D=`、`/DATADIR=`、`/S`、`--updated` 语义与更新豁免；意图 schema、UTF-16LE+BOM 与生效守卫；`install-commit.ini` 完成凭据；`instFilesPre` 最终路径改写；页面侧写入与 UAC inner 守卫；marker-first 状态机与失败分类；NSIS／Node 校验对拍用例；错误码与静默退出码；卸载 shell 上下文；prerelease 比较；差量基线保留 |
| `docs/design/storage.md` | 更新 | 迁移状态机（marker-first、取消、重试、quick_check、原子写指针）、安装期意图与首启迁移、旧目录保留与显式删除、指针失效阻断、updater 缓存清理（首启与卸载）；与设置页迁移共用核心 |
| `docs/design/ux-guidelines.md` | 更新 | 迁移 splash（可取消、字节进度）与失败/重试提示频率；清理对话框的两个选项、默认项、警告条与关闭语义；下载残留／加速文件的用户表述；删除旧数据的二次确认与不可删除条件 |
| `docs/architecture.md` | 更新 | 引导式安装器、per-machine 支持与跨账户限制、`installer/installer.nsh` 归属、校验双实现对拍与构建门禁 |
| `docs/release.md` | 更新 | 安装矩阵（per-user／per-machine × 全新／覆盖／换目录 × 交互／静默 × 崩溃恢复）、差量与 beta 保留验证、发布资产检查 |
| `docs/changelog.md` 与 Release notes | 发布时更新 | 纯英文 Release notes；安装/迁移/清理行为变化与 per-machine 限制 |

## 风险与约束

1. **ASCII 规则与中文用户名冲突**：per-user 默认目录位于 `%LOCALAPPDATA%`，中文用户名下必然违规；用户必须手动改选，安装页提示与错误条需给出足够明确的指引，否则会卡在目录页。该可用性代价是为规避 Electron 中文路径兼容问题而接受的取舍。
2. **per-machine 提权与意图归属**：页面侧写意图解决“标准用户输入另一管理员凭据提权”导致意图落到管理员账户的问题；静默 per-machine 跨账户无法确定发起用户，按契约以专用错误码拒绝。数据仍按 Windows 用户隔离，卸载不清数据。
3. **NSIS 编码**：`FileWrite` 按 ANSI 落盘，意图文件必须 `FileWriteUTF16LE`；不得用 `reg.exe` 回读路径（stdout 为 OEM 代码页）。
4. **旧卸载器递归删除**：换目录安装会 `RMDir /r` 旧目录，因此数据目录绝不能位于安装目录内；≤0.1.0 版本 exe 旁 `data/` 的低概率场景需在 `customInit` 先探测转存或在发布说明中声明不支持。
5. **模板依赖**：自定义页依赖 `customPageAfterChangeDir`、`skipPageIfUpdated` 与 instfiles pre 的 `$INSTDIR` 改写；模板升级可能改变路径语义，需回归安装矩阵并同步契约。
6. **指针阻断**：阻断对话框引入启动期阻塞路径，需保证单实例锁、日志与退出路径不悬挂。
7. **清理策略与默认值**：默认仅清下载残留、保留约 134 MiB 加速文件；全清必须由用户显式选择并看到警告条。文案需说明加速文件的用途，避免被理解为“清理不彻底”；默认策略把省流量置于最大释放之上。
8. **目标目录前置条件**：迁移只接受空目录；无标记且非空、又不含 `easyui.db`／`storage-layout.json` 的目录一律拒绝，避免与用户文件混写。崩溃恢复的内容归属依赖 `.migrating` 标记。

## 验收标准

- [ ] 全新安装可自选安装目录；默认目录、快捷方式、卸载项、`InstallLocation` 一致且仅一条。
- [ ] per-user 与 per-machine 两种模式均可安装、升级、卸载；per-machine 正确提权，卸载后程序移除、各用户数据保留。
- [ ] 覆盖安装默认保持原目录与原数据目录；改目录后旧安装目录被完整删除，数据与设置在首启后完整可用（会话数、消息 parent 链、预设、密钥可解密）。
- [ ] 目录页输入 `D:\Apps` 或小写、不含产品名的路径后：最终安装路径、嵌套校验与意图 `installDir` 三者一致，注册表与快捷方式指向最终路径。
- [ ] 安装期更改数据目录：首启后新目录生效，旧目录保留，`storage-layout.json` 存在，无需重启；目标已有数据时采用而非覆盖；目标非空且无数据时拒绝且不写入。
- [ ] 迁移中途杀进程或断电后重启：不得把半截副本当作已有数据；按 `.migrating` 重新复制或清理，源目录始终完好。
- [ ] 迁移取消：目标无本次残留、意图删除、源完好；可重试失败每版本只提示一次，并可在设置页手动重试。
- [ ] 安装取消、失败或回滚但意图已写：因 `install-commit.ini` 缺失或早于意图，应用不执行迁移，仅删除意图并正常启动。
- [ ] 迁移后目标库 `PRAGMA quick_check` 通过；只复制主库与业务文件，未复制 `-wal`／`-shm`，`logs/` 未迁入。
- [ ] 数据目录与安装目录相等或互为父子、UNC、只读、超长路径均被阻断并有明确文案。
- [ ] 中文 UI 显示“安装路径需为纯英文”，英文 UI 不显示；两种 UI 下非 ASCII 路径均阻断且报错语言正确；中文用户名机器可完成安装。
- [ ] 默认路径自始非法时：路径文字为红色、错误条展开并说明原因、“下一步”不可交互；修正后错误条收起、按钮恢复；全程无弹窗，点击或回车无法绕过。
- [ ] 从历史非 ASCII 安装路径通过 `/S --updated` 升级成功且安装目录不变；新安装与显式改目录仍强制执行 ASCII 规则。
- [ ] `/DATADIR=` 与 `/D=` 在静默安装下生效；非法参数以非零码退出；静默 per-user 未给 `/D=` 且默认路径含非 ASCII 时失败而非静默降级；`/S --updated` 完全不改安装目录与数据指针。
- [ ] 标准用户用另一管理员凭据完成 per-machine 安装时，数据目录选择对发起用户生效；静默跨账户组合以契约定义的错误码退出。
- [ ] NSIS 与 Node 校验对拍用例全部通过（非 ASCII、非法字符、结尾空格或点、180 长度、UNC、嵌套）。
- [ ] 仅 `completed` 迁移记录提供删除旧数据入口；非 Easy WebUI 目录、当前目录、安装目录内路径均不可删除；确认后删除成功并清除记录。
- [ ] 首启清理对话框每个版本只弹一次；默认选中“仅清理下载残留”，执行后保留加速文件并记录释放／保留字节；直接关闭按默认项执行。
- [ ] 选择“全部清理”时显示警告条，并在执行前二次确认；执行后除更高版本待装包外，缓存目录为空。
- [ ] 存在更高版本待装包时，两种选项均保留该包（含 beta 段比较）；删除失败下次启动重试；便携版无该入口。
- [ ] 默认清理后首次在线更新仍走差量下载（日志或网络字节为证）；全清后回退全量为预期行为。
- [ ] 设置页可重复执行清理；卸载自动删除当前用户整个 updater 缓存（含加速文件）且不触碰数据目录；per-machine 仅清执行卸载的用户。
- [ ] 安装版指针失效时阻断启动并可重试／改目录／退出，不产生第二份数据；便携版行为不变。
- [ ] 安装器保持系统原生控件与高对比度、DPI、键盘可达性；仅静态品牌位图，无自绘玻璃皮肤。
- [ ] `docs/contracts/installer.md` 已建立，参数、意图 schema、校验错误码、静默退出码与实际安装器行为逐项一致。
- [ ] `docs/design/storage.md`、`ux-guidelines.md`、`architecture.md`、`release.md` 已按最终行为更新；不再保留“仅一键安装”“指针静默回退”等过期描述，文档链接无断链。
- [ ] 备份／恢复、密钥、窗口状态、日志轮转在迁移后行为不变；无 UI 性能回退（涉及渲染路径时按 `docs/release.md` 执行 A/B）。

## 验收记录

待实施。

