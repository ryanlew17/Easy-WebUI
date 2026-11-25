# ADR-006: 安装器改为引导式安装，数据迁移由应用首启完成

- Status: Accepted
- Date: 2026-11-25
- Deciders: project owner
- Supersedes: —
- Superseded by: —

## Context

现有 Windows 安装包是一键安装（`oneClick` 默认 true），安装目录固定为 electron-builder 计算的默认位置，用户无法选择；数据目录固定在 `%APPDATA%/easy-webui/data`（ADR-004），只能在应用内切换且必须重启；electron-updater 下载的安装包长期留在 `%LOCALAPPDATA%/easy-webui-updater/pending`，NSIS 又把安装器复制为差量基线，一轮更新后合计约 2×134 MiB，安装成功后不清理。需求要求安装时可改安装路径与数据路径，覆盖安装另选路径时执行完整迁移，并在首次启动提供可选择的 updater 清理。

约束与事实：

- 安装器是 NSIS 原生 Win32 向导，不能渲染 HTML/CSS，也不具备 Chromium 的 `backdrop-filter`／WebGPU 能力。
- electron-builder 的引导式安装器已内置旧版本卸载：`installSection.nsh` 在安装前调用旧卸载器，旧卸载器执行 `RMDir /r $INSTDIR`。因此换目录安装会递归删除旧安装目录，数据目录不能位于安装目录内。
- NSIS `FileWrite` 按 ANSI 代码页落盘，无法可靠输出 UTF-8；中文路径在 `FileRead`／`reg.exe` 回读时都会损坏。
- SQLite 数据库包含 `-wal`／`-shm`，在安装器中复制缺少一致性校验与失败恢复；`backups/` 可能达 GB 级。
- 安装器语言为 zh_CN／en_US；per-machine 安装需要 UAC 提权，而用户数据仍按 Windows 用户隔离。
- 应用启动顺序为 `resolveDataDir → migrateStorageDir → openDatabase`，迁移可在打开数据库前完成，因此不需要重启。

## Decision

1. **安装器形态**：改为引导式安装（`oneClick: false`、`allowToChangeInstallationDirectory: true`），保留安装模式页，per-machine 与 per-user 均可选。程序文件迁移完全交给 electron-builder 模板，不自写卸载/迁移逻辑。
2. **数据交接**：安装器不复制数据、不写指针，只写 UTF-16LE + BOM 的 `%APPDATA%/<APP_PACKAGE_NAME>/installer-intent.ini`。交互模式在自定义页离开时写入，静默模式在 `customInit` 由外层实例写入，`customInstall` 只复核；意图带 `installDir`（页面按模板规则预测、安装段复核的最终路径）与 `installerVersion` 守卫；安装段在 `$INSTDIR` 写 `install-commit.ini` 完成凭据，应用要求凭据存在、版本一致且不早于意图，避免安装取消或失败后仍执行迁移；目标与源同目录按 `noop` 处理。应用首启在 `openDatabase` 之前按 **marker-first** 判定目标：`.migrating` 存在即视为未完成副本并重迁，绝不进入 `switched`；否则已有 db／layout 采用、空目录迁移、非空目录拒绝。迁移先对源库 `wal_checkpoint(TRUNCATE)`，只复制主库与业务文件（不复制 `-wal`／`-shm`、不含 `logs/`），`PRAGMA quick_check` 通过后原子写指针。失败分为可重试与终态，源目录永不自动删除，splash 可取消。
3. **路径规则**：安装路径必须为纯 ASCII（U+0020–U+007E，排除 Windows 非法字符、结尾空格/点，长度 ≤180，按 `instFilesPre` 改写后的最终路径计算）；数据路径允许非 ASCII。默认值非法时就地显示红色路径、错误条并禁用“下一步”，不改写默认值、不自动换盘、不使用弹窗。静默安装支持 `/DATADIR=`，非法参数以非零码退出。规则以契约为唯一事实来源，NSIS 与 Node 各自实现并用边界用例对拍。纯 ASCII 是产品约束：Electron 在中文路径下的安装、更新与提权链路兼容问题多、维护成本高；接受中文用户名需手动改选的代价。`--updated` 静默更新沿用现有安装目录、不做该校验，避免历史非 ASCII 路径的安装无法升级。
4. **旧数据删除**：仅对 `status=completed` 的迁移记录提供显式删除入口，且仅允许删除可识别为 Easy WebUI 数据目录、不等于当前数据目录、不等于安装目录且不位于安装目录内的路径；二次确认，无自动删除。
5. **updater 清理**：安装版在安装或升级后的首次启动展示一次性清理对话框，把范围交给用户。默认选项仅删除 `%LOCALAPPDATA%/<updaterCacheDirName>/pending` 与陈旧文件，保留 `installer.exe` 与 `current.blockmap` 作为差量基线（约 134 MiB）；另一选项为全部清理，选中时显示警告条并二次确认，说明下次更新将重新下载完整安装包。直接关闭对话框按默认选项执行；版本高于当前的待装包在两种选项下都保留（比较含 prerelease）。卸载时在 current shell context 自动删除当前用户整个缓存，含基线。
6. **指针失效**：安装版指针存在但目标不可用时阻断启动并提供重试／改目录／退出，不再静默回落到 `userData/data`；若存在通过守卫的安装意图且其目标已有可用数据，对话框把该目标列为可用选项，目标为空时禁用。便携版保持现有回退。
7. **安装器视觉**：不采用液态玻璃。保留 NSIS 原生控件与系统行为，仅使用与应用视觉语言一致的静态位图（sidebar／header）与图标。理由：玻璃效果依赖 Chromium 合成能力，NSIS 无法实现；自定义 owner-draw 或 Electron bootstrapper 会引入大幅体积、提权、签名与维护成本，并破坏高对比度、DPI 与键盘可达性。
8. **文档归属**：本 ADR 记录上述决策；安装器契约（参数、意图文件 schema、校验规则、退出码）、`docs/design/storage.md` 与 `ux-guidelines.md` 的行为快照、`architecture.md` 与 `release.md` 的打包和验证门禁均为 [REQ-2026-007](../requirements/active/REQ-2026-007-installer-path-and-updater-cleanup.md) 的交付物，随实现同步提交与验收。不新增 `docs/design/installer.md`，安装器没有应用内界面，首启迁移与删除入口属于存储与设置行为。

## Consequences

- 安装体验从一键变为多页向导，新增安装模式页、目录页与数据目录页；per-machine 路径需要 UAC。
- 需要长期维护自定义 NSIS 脚本、意图文件契约与安装矩阵（per-user／per-machine × 全新／覆盖／换目录 × 交互／静默）。
- 中文用户名下 per-user 默认路径必然违反 ASCII 规则，用户需手动改选；这是规则本身的可用性代价，需要在错误条文案中给出明确指引。
- 安装期数据目录只对执行安装的 Windows 用户生效；per-machine 安装后其他用户各自使用默认数据目录，不提供机器级共享数据。
- 首次启动多了一条导入与清理路径，需覆盖指针失效、复制失败、半截副本恢复、待装更新包保留与 NSIS 进程占用等分支。
- 默认清理保留约 134 MiB 差量基线，磁盘未完全释放；用户可选全清，但需接受后续更新回退全量下载。两种策略都要求文案说明“加速文件”的用途。
- per-machine 静默跨账户安装无法确定发起用户，不支持 `/DATADIR=`；交互模式由页面侧写入覆盖。
- `instFilesPre` 会把 `$INSTDIR` 改写为含产品名的子目录，所有校验、嵌套判断与意图字段必须以最终路径为准。

## Alternatives Considered

- **安装器直接复制数据并写指针**：缺少 WAL 一致性与失败恢复，复制中断会让应用以空目录启动；NSIS 无法可靠处理 Unicode 路径，否决。
- **安装器写指针、应用只切换**：同样存在“指针已指向空目录”的失败窗口，否决。
- **保持一键安装，仅应用内换数据目录**：无法满足安装路径可选的诉求，否决。
- **Electron bootstrapper 承载安装 UI**：可获得完整视觉与交互控制，但体积增加 100 MB 以上或需联网下载，提权、签名与更新链复杂，否决。
- **自定义 NSIS owner-draw 皮肤实现玻璃观感**：工作量大、随 electron-builder／NSIS 升级易碎，且原生控件无法真正玻璃化，否决。
- **机器级共享数据目录**：多用户并发写同一 SQLite 有完整性风险，且与 ADR-004 的用户隔离冲突，否决。
- **迁移后自动删除旧数据**：不可逆且违背 ADR-004，改为显式操作。
- **清理时递归删除整个 updater 目录**：可多释放约 134 MiB，但会丢掉 NSIS 刚刷新的 `installer.exe` 基线，迫使后续更新回退全量下载；否决为默认策略，保留为用户显式选项。
- **首启按固定策略自动清理、不询问用户**：实现更简单，但磁盘释放与流量消耗的取舍因用户网络与磁盘状况而异；owner 要求把选择交给用户，否决。
- **在 `customInstall` 写意图**：提权后的 inner instance 可能把意图写到管理员配置目录，发起用户永远读不到；否决，改为页面侧／`customInit` 外层写入。
- **NSIS 与 Node 共用同一校验模块**：安装器不能执行 Node，无法共用代码；改为契约单一事实来源 + 双实现对拍。
