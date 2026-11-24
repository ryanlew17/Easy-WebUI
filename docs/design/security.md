# 安全与隐私

> 权威范围：密钥生命周期、脱敏、CSP、渲染隔离、内容消毒和出站隐私。
> 何时读取：接触密钥、日志、错误消息、CSP、导航或外部内容的代码之前；密钥改动必读。
> 代码事实来源：`electron/crypto/`、`electron/main.ts`、`electron/webcontents-guard.ts`、`shared/errors.ts`。
> 最后更新：2026-11-25

## 1. 密钥生命周期

- 首选 `safeStorage.encryptStringAsync`，Base64 密文使用 `v1:ss:` 前缀。启动时判断异步加密可用性，旧格式仍可解密。
- 需要重加密时，先成功取得明文，再以旧密文未变化为条件回写；失败不影响本次解密，也不得覆盖并发换钥或恢复已清除密钥。不缓存明文。
- safeStorage 不可用时，以机器指纹经 scrypt 派生密钥并执行 AES-256-GCM，使用 `v1:mf:` 前缀；随机盐存于 `data/keyring.bin`。
- machine-fallback 的保密性依赖随机盐和文件系统 ACL。能读取数据目录的本地攻击者可能推导并解密密钥；Windows chmod 600 不提供实际隔离，因此设置页必须持续提示该降级。
- 密钥明文只存在于主进程请求组装瞬间，不进入渲染进程、IPC 返回、日志、错误或默认备份。
- 带密钥平台修改 `base_url` 且 host 变化、又未提供新密钥时，主进程自动清除旧密钥；同 host 改端口或路径不清除。Mock 遵守同一规则。
- `base_url` 仅允许 http/https 且禁止 userinfo，避免凭据进入 URL、错误和日志。

## 2. 脱敏与错误出口

- 已知密钥注册到 `crypto/redact`；错误、IPC 和服务商消息统一经过 `redact()`，保留前三位并以 `***` 替代其余部分。
- 服务商可控的 `code/type` 经 `sanitizeErrorCode` 限制为白名单字符且最多 128 字符；`message` 经 `sanitizeErrorMessage` 先脱敏再截断到 2000 字符，之后才可入库或广播。
- 网关不记录请求体；只记录脱敏后的错误与生命周期事件。日志文件和保留规则见 `./storage.md`。

## 3. 渲染与导航安全

- CSP 使用 `default-src 'self'`，并设置 `object-src 'none'`、`base-uri 'none'`、`frame-src 'none'`、`form-action 'none'`；开发环境由 Vite 插件剥离 meta CSP 以支持 HMR。
- `index.html` 的 meta CSP 与 `electron/main.ts` 的响应头 CSP 使用相同的 `script-src 'self' 'sha256-…'`，只放行对应哈希的防 FOUC 内联脚本，不为 script 启用 `unsafe-inline`。响应头与 meta 取交集，两处必须保持一致。
- 修改内联脚本（包括空白）后必须重算并同步两处哈希。`tests/webcontents-guard.test.ts` 直接计算实际脚本哈希并检查两处策略；策略调整后还必须执行真实 Electron 验证：

  ```bash
  node -e "const fs=require('fs'),c=require('crypto');const m=fs.readFileSync('index.html','utf8').match(/<script>(\(function[\s\S]*?)<\/script>/);console.log(c.createHash('sha256').update(m[1],'utf8').digest('base64'))"
  ```

- 使用 `nodeIntegration:false`、`contextIsolation:true`、`sandbox:true`；`contextBridge` 只暴露 `window.easyui.*` 白名单。
- 主窗口导航实行白名单，生产导航一律拦截；新窗口全部拒绝，http(s) 外链转 `shell.openExternal`。每个 IPC handler 校验 `senderFrame.url`。
- 单实例锁阻止多个进程并发写同一数据库。
- 聊天 Markdown 禁止 raw HTML；highlight.js 输出必须经 DOMPurify 消毒。不得加载远程字体或脚本。
- GitHub ReleaseNotes 是独立例外：按需加载，使用 rehype-raw + rehype-sanitize 白名单支持 GFM 和安全 HTML，移除脚本、样式、iframe、表单、事件属性、危险 URL 与远程图片。该例外不得扩散到聊天。
- 外链 IPC 仅放行 http(s)；Web Mock 的 API key 只存内存，不写 localStorage。

## 4. 隐私

零遥测、零自动上报。出站仅包括用户配置的服务商端点和可关闭的 GitHub 在线升级检查。
