# 安全设计

> 适用范围：API 密钥加密存储、日志与错误脱敏、渲染进程安全（CSP/隔离/消毒）、隐私边界。
> 何时读取：改 `electron/crypto/`、CSP、日志、任何接触密钥或错误消息的代码之前——**接触密钥的改动必须先读本文件**。
> 关联需求：REQ-2026-001（2026-10 安全审计修复）。
> 最后更新：2026-10-22
> 来源：原 prd.md §8 + 原 docs/impl-contract.md §2（安全红线）

## 1. 密钥存储

- 首选 `safeStorage.encryptString` → Base64 存 `providers.api_key_cipher`，自描述前缀 `v1:ss:`。
- safeStorage 不可用时：机器指纹（hostname+username+platform 的 SHA-256）经 scrypt 派生密钥做 AES-256-GCM，前缀 `v1:mf:`，盐存 `data/keyring.bin`（权限 600），设置页常驻黄色提示（`EncryptionStatus.method = 'machine-fallback'`）。
  - **machine-fallback 威胁边界**：机器指纹熵低（hostname/username/platform/arch 可枚举），该模式的实际保密性 = keyring.bin 随机盐 + 文件系统 ACL。能读到 data 目录的本地攻击者可自行推导并解密密钥——相比 safeStorage/DPAPI 的"读文件 ≠ 能解密"是明确降级（Windows 上 chmod 600 为 no-op）。这是已接受的取舍，UI 常驻提示即为此服务。
- **密钥明文只允许存在于主进程内存的请求组装瞬间**，不出现在：日志、错误消息、IPC 返回、渲染进程、备份默认导出。
- `Provider` 类型无 `api_key_cipher` 字段，主进程 DAO 查询时剥离；渲染进程只见 `has_key`。
- **base_url 换 host 自动清密钥**（REQ-2026-001）：带密钥平台修改 base_url 且 host 变化、未同时提供新密钥 → 主进程自动清除已存密钥（`has_key=false`，需重新输入）。防"换址外发"：恶意调用（如渲染层 XSS）不能把解密后的 key 发往攻击者端点。mock 桥同规则。同 host 改端口/路径不清。
- `base_url` 仅允许 http/https 且禁止 userinfo（`https://key@host` 形态会让密钥随 URL 进入超时错误消息与日志）。

## 2. 日志与脱敏

- 主进程日志 `data/logs/app.log`（按日轮转 7 天）；网关不记请求日志（只记错误与生命周期事件，消息体一律过 redact）。
- 全部已知密钥注册进 `crypto/redact` 登记表，任何出口统一 `redact()`（保留前 3 位 + `***`，即 `key.slice(0,3) + '***'` 模式）：错误消息、IPC 错误、服务商 error message。
- 服务商可控的错误 `code`/`type` 经 `sanitizeErrorCode` 脱敏 + 截断（≤128 字符、白名单字符集）后才入库/广播。

## 3. 渲染进程安全

- CSP `default-src 'self'` + `object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'`；dev 由 Vite 插件剥离以支持 HMR。
- 防 FOUC 内联脚本（`index.html`）经 `script-src 'sha256-…'` 白名单放行（无 `unsafe-inline`）。**改该脚本（含任何空白）必须重算哈希**——用下面这条精确匹配"无属性 `<script>`"的命令（宽松正则可能误匹配注释中的文字）：

  ```bash
  node -e "const fs=require('fs'),c=require('crypto');const m=fs.readFileSync('index.html','utf8').match(/<script>(\(function[\s\S]*?)<\/script>/);console.log(c.createHash('sha256').update(m[1],'utf8').digest('base64'))"
  ```
- `nodeIntegration: false` + `contextIsolation: true` + 显式 `sandbox: true`；`contextBridge` 只暴露白名单 API（`window.easyui.*`，见 `../contracts/impl-contract.md` §2）。
- **导航与发送方闸门**（REQ-2026-001）：主窗口 `will-navigate` 白名单（dev=vite origin / prod 一律拦截）；`setWindowOpenHandler` 全部 deny、http(s) 转 `shell.openExternal`；所有 IPC handler 校验 `senderFrame.url` 必须是应用文档（`electron/webcontents-guard.ts` 纯函数）。
- 单实例锁：第二实例退出并聚焦既有窗口（防双实例并发写同一 sqlite）。
- 渲染进程代码不得 import `electron/` 下任何模块；跨进程共享类型与纯逻辑一律放 `shared/`。
- Markdown 渲染前经 DOMPurify 消毒（模型输出不可信）；不加载远程字体/脚本。
- 外链经 `system:open-external` 仅放行 http(s)（zod 校验）。
- Web 预览 mock 桥（`src/bridge/mock.ts`）：API key 仅存内存 Map，不落 localStorage；`openExternal` 复用同一 http(s) 白名单。

## 4. 隐私

- 零遥测、零自动上报。
- 出站请求仅两类：用户配置的服务商端点，与在线升级检查（GitHub Releases，`auto_update` 可关）。
