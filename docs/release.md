# 发布流程与规范

## 版本发布步骤

1. 版本号：`package.json` 的 `version`（tag 与 `v<version>` 一致）。
2. 构建与打包：`npm run build && npx electron-builder --win`（产物在 `release/`）。
3. 提交与合并：功能分支上简明提交（同类 UI 修复可合并描述），`--no-ff` 合入 `main` 并推送。
4. 打 tag：`git tag -a v<version> -m "Easy WebUI v<version>" && git push origin v<version>`。
5. 创建 Release（API/网页，tag = v<version>，target = main），上传 4 个资产：
   `EasyWebUI_<v>_Setup.exe`、`EasyWebUI_<v>_Setup.exe.blockmap`、
   `EasyWebUI_<v>_Portable.exe`、`latest.yml`。
   - `latest.yml` 必须上传：应用内在线升级（electron-updater）依赖它发现/校验新版本。

## Release 说明规范（v1.0.1 起）

- **纯英文**（规避编码问题），面向用户，写"这个版本带来了什么"，而非安装教程
  （安装方法仅一句话带过或指向 README）。
- 结构：一句话定位 → `## What's New`（按主题分组：设计 / 对话体验 / 修复 / 开发者）→
  末尾提示老用户可经 Settings → About 在线更新。
- 篇幅克制：每条一行，突出用户可感知的变化。

## 质量门槛（发布前）

- `npm test`（单元测试全绿）与 `node scripts/probe-verify-portal.mjs`（headless 布局/模糊/分支探针）通过。
- `node scripts/e2e-ui-polish.mjs` 走查通过；`npm run shot` 刷新 `docs/screenshots/`。
- 安装包人工冒烟（重点：玻璃模糊、窗口尺寸记忆、在线升级检查）。
