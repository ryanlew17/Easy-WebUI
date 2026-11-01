# REQ-2026-002：输入与协议安全跟进（zod 4 迁移）

状态：active（独立排期，不随 v1.0.2 实施大版本迁移）
来源：外部独立安全审查 `tmp/security-review-2026-11-01-v1.0.2.md`（F-2，兼顾 F-3/F-5/F-6）
影响模块：`shared/`、`electron/`、`src/bridge/`、测试与发布依赖

## 排期范围

- 将生产依赖 `zod` 从 3.x 迁移到包含 GHSA-mrhx-c7xc-m3w5 修复的版本（≥4.6.6），单独评估 zod 4 API 与错误格式变化。
- 审核全部 IPC、共享参数和设置 schema；保持有效/无效输入语义、错误脱敏与 `EASYUI_ERR` 编码兼容，Electron 与 mock 桥行为一致。
- 迁移必须独立提交并附全量回归，不与功能需求或其他依赖大版本升级混提。

## v1.0.2 已完成的支撑修复

- `updateProvider.models` 在主进程与 mock 桥统一限制为最多 2000 项，作为 zod 4 迁移前的内存放大缓解。
- openai-chat 流内 `error` 事件改为脱敏后抛出；后台生成尾部异常统一捕获并记录，不再产生未处理 Promise 拒绝。

## 验收标准

- 生产依赖审计不再包含 zod 该通告；全部 schema 与错误分支测试通过。
- `npm run typecheck`、`npm test`、`npm run build`、发布探针和真实打包冒烟通过。
- 1.0.2 的 models 上限、流错误与后台异常回归测试在迁移后保持通过。

## 非目标

- tailwindcss、vitest、electron-builder 等开发依赖链升级。
- safeStorage `shouldReEncrypt` 密文回写优化；该可选性能改动另行评估，不阻塞本需求。
