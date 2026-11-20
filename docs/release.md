# 验证与发布

## 1. 每次改动

```bash
npm run typecheck   # Web + Electron 双配置
npm test            # Vitest 全量测试
npm run build       # dist/ + dist-electron/ + preload
```

测试覆盖协议流式/非流式与错误分支、上下文裁剪、脱敏、备份、消息树、窗口状态等。消息树或分支改动必须回归 `tests/db-messages.test.ts`；主进程行为修复同步 `src/bridge/mock.ts`。

Web 预览不依赖原生模块，必要时可 `npm install --ignore-scripts`。`npm run dev` 下应能走通：预置建平台 → 检测模型 → 建会话 → 流式对话 → 改参数 → 切主题/语言。

## 2. UI 与发布前检查

先运行 `npm run build`，再执行：

```bash
node scripts/probe-verify-portal.mjs   # DOM、几何、浮层与模糊断言
node scripts/e2e-ui-polish.mjs         # UI 走查
npm run shot                           # 重生成 docs/screenshots/ 的 8 张截图
```

E2E 使用 puppeteer-core、系统 Edge 无头（默认 `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`，可用 `EASYUI_BROWSER_PATH` 指定其他 Chromium 可执行文件）和进程内 `dist/` 静态服务器。打包后还需真实应用冒烟：玻璃模糊、窗口尺寸记忆、SQLite 读写、密钥密文、在线升级检查，以及启动—关闭日志。文档须区分实际走查浏览器与构建目标，不得将某一浏览器结果外推为其他浏览器实测。

## 3. 打包

```bash
npx electron-builder --win portable nsis --publish never
```

产物写入 `release/`。最终保留 Setup、Portable、Setup blockmap 与 `latest.yml`；`win-unpacked/`、走查截图和 builder 调试文件属于可再生产物，不作为发布资产。

## 4. 发布前依赖审计

当前 `npm audit --omit=dev` 与全量 `npm audit` 均为 0。`package.json` 以两条版本键限定 override（`minimatch@^9.0.0`、`minimatch@^10.0.0` → `^11.0.1`）修复 electron-builder 开发链，实际解析至 11.0.9；glob@7、dir-compare、filelist 的 3.x／5.x 实例保持不变。不得使用裸 override 或会向整棵子树传播的嵌套对象形式。干净 `npm ci`、全量测试、类型检查、构建及真实 Setup／Portable 打包均已验证。

后续升级应先检查上游是否已内置 minimatch ≥11.0.1；有则直接升级并移除不再需要的 override。不得使用裸 override、强制降级、`npm audit fix --force` 或审计／警告抑制。若未来只能保留 moderate，必须同时记录上游无补丁和 override 实测破坏功能的证据，仅“已审查”不构成保留理由。

## 5. 发布步骤

1. 确认 `package.json` 的 `version`，tag 使用 `v<version>`，并完成上述质量门槛。
2. 功能分支提交，`--no-ff` 合入 `main` 并推送。
3. `git tag -a v<version> -m "Easy WebUI v<version>" && git push origin v<version>`。
4. 创建 GitHub Release（tag = `v<version>`，target = `main`），上传：
   `EasyWebUI_<v>_Setup.exe`、`EasyWebUI_<v>_Setup.exe.blockmap`、
   `EasyWebUI_<v>_Portable.exe`、`latest.yml`。
5. 必须上传 `latest.yml`，应用内更新依赖它发现并校验新版本。使用 GitHub API 时，凭据只存入变量，绝不打印或回显。

## 6. Release 说明

- 使用纯英文，面向用户说明本版本带来的变化；安装说明至多一句或链接 README。
- 结构：一句话定位 → `## What's New`（按主题分组）→ 提示老用户可经 Settings → About 更新。
- 每条一行，突出用户可感知的变化，避免堆砌内部实现细节。
