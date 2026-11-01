# REQ-2026-002：输入、工具链与升级摘要安全跟进

状态：done（2026-11-01）
来源：外部独立安全审查及范围扩展
关联设计：`docs/contracts/impl-contract.md`、`docs/contracts/protocol-mapping.md`、`docs/design/security.md`、`docs/design/ux-guidelines.md`
影响模块：`shared/`、`electron/`、`src/`、构建与发布链
非目标：REQ-2026-003 的性能改造、无需求驱动的框架大版本迁移及 PRD 已排除的功能

## 背景

生产与开发依赖存在可修复安全问题，升级摘要也只能显示纯文本。本需求在允许破坏性升级的窗口内完成必要更新，并补齐摘要的安全富文本展示。

## 方案要点

- 升级 zod、TypeScript、Tailwind、Vitest 和发布工具链，保持输入上限、协议错误与脱敏行为。
- 使用独立懒加载的 `ReleaseNotes` 渲染 GFM 和白名单 HTML，聊天消息继续禁止 raw HTML。
- 保留现有构建结构、工程规避项和发布安全边界。

## 验收标准

- 生产依赖审计清零，IPC schema、模型数量、备份和协议限制无回归。
- 摘要中的危险 HTML、URL 和远程图片被移除，XSS 不进入 DOM。
- 类型检查、测试、构建、UI/缩放检查及 Setup/Portable 冒烟通过。

## 验收记录

2026-11-01 独立验收通过。

- 实现：完成 zod 4、TypeScript 7、Tailwind 4、Vitest 5 和安全富文本摘要迁移。
- 验证：281 项测试及完整发布门槛通过；生产依赖审计为 0。
- 边界：15 项开发传递链 moderate 按 `docs/release.md` 记录处置，不强制降级或掩盖。
