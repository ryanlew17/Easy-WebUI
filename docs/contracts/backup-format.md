# 备份格式契约（zip 结构与加密参数）

> 适用范围：备份 zip 的文件组成、manifest 字段、含密钥备份的加密方案、恢复校验规则。实现位于 `electron/backup/`（纯函数核心，不依赖 sqlite/electron）。
> 何时读取：修改备份导出/导入逻辑、排查备份兼容性问题之前。
> 关联需求：无（格式变更需求先落 `../requirements/`）。
> 最后更新：2026-09-13
> 来源：原 prd.md §7.3 + 原 docs/impl-contract.md §1（BackupManifest 类型）

## 1. zip 结构

导出文件名 `easyui-backup-YYYYMMDD-HHmm.zip`，包含：

| 条目 | 内容 |
| --- | --- |
| `data.json` | providers / conversations / messages / presets / 设置的全量 JSON |
| `manifest.json` | 见 §2 |

## 2. manifest 字段（`BackupManifest`）

```ts
{
  app_version: string;      // 导出时应用版本
  schema_version: number;   // 导出时数据库 schema 版本
  includes_keys: boolean;   // 是否含（加密的）密钥
  kdf?: { algo: 'scrypt'; N: number; r: number; p: number; salt_b64: string }; // 仅 includes_keys 时
  created_at: number;
}
```

## 3. 密钥处理（两条路径）

- **不含密钥（默认）**：`data.json` 中 `api_key_cipher` 置 null；恢复后平台其余配置可用，仅需补填密钥。
- **含密钥**：需要独立备份密码（≥8 位，输入二次确认）；用 scrypt（N=2^15, r=8, p=1）从密码派生 32 字节密钥，AES-256-GCM 加密"解密后的密钥明文列表"；salt / nonce 入包（kdf 字段）。
- **绝不允许把 safeStorage 机器密文直接导出**（绑定本机，换机无法解密）。恢复时用本机加密服务重新加密入库。

## 4. 恢复规则

1. 选 zip → 解析 manifest → 含密钥则先验密码。
2. 校验 `schema_version ≤ 当前`（旧 schema 备份恢复后走 `backfillParentLinks` 等回填，见 [db-schema.md](./db-schema.md) §3）。
3. 事务内导入，两种模式：
   - **合并**（默认）：按 id 跳过已存在记录；
   - **覆盖**：清表重导，需二次确认 + 自动先做一份不含密钥的临时备份。
4. 完成后返回统计（平台/会话/消息/预设/跳过数，`ImportResult`）。

备份管理 UX（列表/打开目录/删除）见 `../design/storage.md`。
