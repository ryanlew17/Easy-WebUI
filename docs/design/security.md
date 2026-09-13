# 安全设计

> 适用范围：API 密钥加密存储、日志与错误脱敏、渲染进程安全（CSP/隔离/消毒）、隐私边界。
> 何时读取：改 `electron/crypto/`、CSP、日志、任何接触密钥或错误消息的代码之前——**接触密钥的改动必须先读本文件**。
> 关联需求：无（v1.0.1 现状快照）。
> 最后更新：2026-09-13
> 来源：原 prd.md §8 + 原 docs/impl-contract.md §2（安全红线）

## 1. 密钥存储

- 首选 `safeStorage.encryptString` → Base64 存 `providers.api_key_cipher`，自描述前缀 `v1:ss:`。
- safeStorage 不可用时：机器指纹（hostname+username+platform 的 SHA-256）经 scrypt 派生密钥做 AES-256-GCM，前缀 `v1:mf:`，盐存 `data/keyring.bin`（权限 600），设置页常驻黄色提示（`EncryptionStatus.method = 'machine-fallback'`）。
- **密钥明文只允许存在于主进程内存的请求组装瞬间**，不出现在：日志、错误消息、IPC 返回、渲染进程、备份默认导出。
- `Provider` 类型无 `api_key_cipher` 字段，主进程 DAO 查询时剥离；渲染进程只见 `has_key`。

## 2. 日志与脱敏

- 主进程日志 `data/logs/app.log`（按日轮转 7 天）；请求日志只记 URL 与状态码。
- 全部已知密钥注册进 `crypto/redact` 登记表，任何出口统一 `redact()`（保留前 3 位 + `***`，即 `key.slice(0,3) + '***'` 模式）：错误消息、IPC 错误、服务商 error message。

## 3. 渲染进程安全

- CSP `default-src 'self'`；防 FOUC 内联脚本经 sha256 白名单（改脚本必重算哈希，命令见 README「CSP hash」）；dev 由 Vite 插件剥离以支持 HMR。
- `nodeIntegration: false` + `contextIsolation: true`；`contextBridge` 只暴露白名单 API（`window.easyui.*`，见 `../contracts/impl-contract.md` §2）。
- 渲染进程代码不得 import `electron/` 下任何模块；跨进程共享类型与纯逻辑一律放 `shared/`。
- Markdown 渲染前经 DOMPurify 消毒（模型输出不可信）；不加载远程字体/脚本。
- 外链经 `system:open-external` 仅放行 http(s)（zod 校验）。

## 4. 隐私

- 零遥测、零自动上报。
- 出站请求仅两类：用户配置的服务商端点，与在线升级检查（GitHub Releases，`auto_update` 可关）。
