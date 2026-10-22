# REQ-2026-001: 安全审计修复（Node RCE 响应 + 全量代码审查问题）

状态: active
来源: 内部（2026-10-22 安全审计：Node.js 2026-10-21 安全公告 CVE-2026-111497 响应 + 三方向代码审查）
关联设计: docs/design/security.md、docs/design/gateway.md、docs/contracts/protocol-mapping.md
影响模块: shared/、electron/（ipc/main/gateway/backup/db/updater/paths）、src/（bridge/pages/i18n/lib）、index.html
非目标: Electron 内嵌 Node 24.22.1 升级（上游未发布，见 AGENTS.md 安全待办）；tailwindcss@4 / vitest@5 / electron-builder 链破坏性升级；release/ 重打包时机

## 背景

Node.js 2026-10-21 安全公告修复 10 个 CVE（含 Brotli 解码器 RCE CVE-2026-111497，修复版本 24.22.1）。本项目 Electron 内嵌 Node 独立于此修复。同期全量代码审查发现：带密钥 provider 换 base_url 可致密钥外发（C1）；网关用 Node 全局 fetch 自动解码 Brotli 且无大小上限（C2，正属 CVE 暴露面）；主窗口缺 will-navigate/setWindowOpenHandler/sender 校验（I1-I3）；备份 KDF 参数未校验、subtreeIds 缺环守卫、mock 桥密钥明文落 localStorage 等。

## 方案要点

- C1：带密钥 provider 的 base_url host 变更 → 自动清除已存密钥（需重输），mock 桥同步；UI 前置提示。
- C2/I4/I7：网关切换 Electron net.fetch（与 gateway.md 文档对齐），redirect: 'manual' 拒 3xx，非流式 body / SSE 单事件 / 流式累计三级大小上限。
- I1/I2/I3：will-navigate 白名单 + setWindowOpenHandler deny→openExternal + IPC handle() 校验 senderFrame.url（纯函数 electron/webcontents-guard.ts）。
- I5/I6：恢复时校验 manifest.kdf 与 BACKUP_KDF 恒等 + salt 长度；subtreeIds 补 visited 集合；备份导入 parent_id 成环节点降级挂根。
- I8：mock 桥 api_key 仅存内存 Map，不落 localStorage；mock openExternal 补 http(s) 白名单。
- Minors：base_url 拒绝 userinfo、restoreBackup 路径校验、provider 错误 code 脱敏截断、updater mock 仅限非打包、CSP 硬化（object-src/base-uri/frame-src/form-action）、prefs 2KB 上限、TEMP 迁移目录要求 layout 标记、显式 sandbox:true、单实例锁、getApi 降级告警。
- 所有新 UI 字符串双语 i18n；主进程行为修复同步 mock 桥。

## 第二轮复审跟进（F1–F4，同日）

复审（排除上述非目标待办）确认首轮修复全部落实，未发现高危/中危；新发现 4 项低危，当日修复（实现细节见 commit）：

- F1 deleteBackup 未校验文件名模式 → 删除与列表共用 `^easyui-backup-.*\.zip$` 同一规则。
- F2 网关错误 message 只脱敏不截断 → 统一整形为脱敏 + 截断 ≤2000 字符（先脱敏后截断，防密钥截半漏出）。
- F3 restoreBackup 接受任意绝对 .zip 路径 → 仅放行 backups 目录内文件或本会话 pickBackupFile 对话框选择过的文件。
- F4 备份密码无长度上限 → 定为 8–32 位（schema / 纯函数 / UI maxLength + 双语提示，mock 桥同规则）。兼容性：此前密码 >32 位的旧备份将无法恢复。

## 验收标准

- npm run typecheck 双配置通过；npm test 全绿（含新增：url 纯函数、redirect_rejected/response_too_large、流式上限、KDF 篡改、parent 环删除回归、webcontents-guard 分支）。
- npm run build 通过；node scripts/probe-verify-portal.mjs 通过。
- 恶意场景人工核对：换 host 后 has_key=false；3xx 端点报 redirect_rejected；超大/无限流响应报 response_too_large 且已收内容落库 partial。
- 第二轮（F1–F4）：npm test 全绿（含新增单测）；中英文 UI 实测密码提示与输入上限通过（截图 `gui-test-screenshots/`）。

## 变更记录

- 2026-10-22 创建
- 2026-10-22 第二轮复审：修复 F1–F4 四项低危，单测与中英文 UI 实测通过
