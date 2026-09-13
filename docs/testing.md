# 测试与验证门槛

> 适用范围：提交/发布前的质量门槛——单元测试、类型检查、headless 探针、走查截图、人工冒烟。
> 何时读取：写完代码准备验证时；发布前。
> 关联需求：无（门槛本身的需求变更走 `requirements/`）。
> 最后更新：2026-09-13
> 来源：原 prd.md §9（测试与验证门槛）+ 原 docs/impl-contract.md §8

## 1. 单元测试与类型检查（每次改动）

```bash
npm run typecheck   # tsconfig.web + tsconfig.electron —— 两个都必须过
npm test            # vitest（tests/）
```

vitest 覆盖面：三协议流式/非流式/错误分支（mock fetch）、上下文裁剪（trim）、redact 脱敏、备份含密钥/不含密钥 roundtrip、分支删除路径恢复（db-messages）、窗口状态校验等。**消息树/分支行为改动必须回归 `tests/db-messages.test.ts`**。

Web 预览不依赖原生模块：`npm install --ignore-scripts` 保底可用。

## 2. 构建

```bash
npm run build       # web typecheck → vite build → dist/ + tsc → dist-electron/ + esbuild preload
```

## 3. Headless 探针与走查（UI 改动 / 发布前）

E2E 脚本用 puppeteer-core + 系统 Edge 无头（`C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`，硬编码路径）+ 进程内静态服务器托管 `dist/` —— **先 `npm run build` 再跑**：

```bash
node scripts/probe-verify-portal.mjs   # headless DOM/几何断言（浮层 portal、布局、模糊）
node scripts/e2e-ui-polish.mjs         # 走查截图
npm run shot                           # 重生成 8 张 README 截图 → docs/screenshots/
```

## 4. 安装包人工冒烟（发布前）

打包后人工验证重点：玻璃模糊、窗口尺寸记忆、在线升级检查。

## 5. 发布门槛

发布前全绿（流程见 `./release.md`）：typecheck + test + probe + e2e + shot + 安装包冒烟。

## 6. Web 预览验收（mock 桥）

`npm run dev` 浏览器打开即三栏 UI，mock 下可完整走通：预设建平台 → 检测模型 → 建会话 → 流式对话 → 改参数 → 切主题/语言。主进程行为修复须同步修 mock 桥（`contracts/impl-contract.md` §6）。
