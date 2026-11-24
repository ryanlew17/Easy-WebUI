# 验证与发布

## 1. 每次改动

```bash
npm run typecheck   # Web + Electron 双配置
npm test            # Vitest 全量测试
npm run build       # dist/ + dist-electron/ + preload
```

测试覆盖协议流式/非流式与错误分支、上下文裁剪、脱敏、备份、消息树、窗口状态等。消息树或分支改动必须回归 `tests/db-messages.test.ts`；主进程行为修复同步 `src/bridge/mock.ts`。

Web 预览不依赖原生模块，必要时可 `npm install --ignore-scripts`。`npm run dev` 下应能走通：预置建平台 → 检测模型 → 建会话 → 流式对话 → 改参数 → 切主题/语言。

## 2. UI 常规门与发布前检查

涉及 UI 的改动必须通过本节的视觉令牌、焦点、Portal、截图和实际读图门禁，不能留到发布前才补验；发布前执行完整清单。先运行 `npm run build`，再执行：

```bash
node scripts/probe-visual-tokens.mjs    # 语义排版、对比度、squircle 与旧浏览器回退
node scripts/probe-focus.mjs           # 深浅主题焦点载体、胶囊避让、输入单环与高对比回退
node scripts/probe-verify-portal.mjs   # DOM、几何、浮层、模糊、双层缩放与临时表面生命周期
node scripts/e2e-ui-polish.mjs         # UI 走查
node scripts/e2e-chat-ux.mjs           # 分支、选择模式、Think、Generate 与上下文浮层
node scripts/e2e-preview-static.mjs    # 生产构建完整流程：平台、聊天、设置、双语言与缩放
node scripts/smoke-params.mjs          # 自起当前项目 Vite：参数覆盖、重置、预设保存与恢复默认
node scripts/e2e-ui-motion.mjs         # 动效、模态焦点、Toast、InfoTip 与双层缩放
node scripts/e2e-glass-electron.mjs    # 隔离生产 Electron + 真实 IPC/SQLite + 本机 SSE
npm run shot                           # 重生成 docs/screenshots/ 的 23 张状态、双主题与窄窗口截图
```

E2E 使用 puppeteer-core、系统 Edge 无头（默认 `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`，可用 `EASYUI_BROWSER_PATH` 指定其他 Chromium 可执行文件）和进程内 `dist/` 静态服务器。打包后还需真实应用冒烟：玻璃模糊、窗口尺寸记忆、SQLite 读写、密钥密文、在线升级检查，以及启动—关闭日志。文档须区分实际走查浏览器与构建目标，不得将某一浏览器结果外推为其他浏览器实测。

**截图后的实际视觉评审是独立必需门。** 截图流程和自动探针退出码只证明状态、脚本路径与计算样式正确；生成后必须由具备图像读取能力的审查者实际查看关键屏，检查形状一致性、层级、对齐、文字完整性、色彩和真实内容透底。未实际读图不得判定 UI 验收通过，玻璃可辨性也不得以 `backdrop-filter` 计算值非 `none` 代替。`09b` 须先通过真实内容/顶栏交叠断言，再作为材质证据。

`squircle` 回退使用独立旧浏览器验证；当前基线为 Chrome 138.0.7204.168，可用 `npx -y @puppeteer/browsers install chrome@138.0.7204.168 --path build/req006-browsers` 准备，或以 `EASYUI_FALLBACK_BROWSER_PATH` 指定。`e2e-chat-ux` 自 REQ-2026-006 起列入常规 UI 门禁，不能只在发布说明中引用而未实际运行。

REQ-2026-006 最终默认完整 CSS 材质。GPU 场景默认不启用，生产冒烟仍检查材质降级、动态 chunk/Worker 的懒加载边界、焦点、缩放、资源释放和流式功能。性能门槛执行 `npm run perf`、`npm run perf:gpu`、`npm run perf:glass`、`npm run perf:electron`；对照报告使用至少 5 次 A/B 交替。

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
