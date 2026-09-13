# contracts — 接口与可执行细节契约

> 适用范围：跨进程接口、共享类型、协议映射、数据库结构、备份格式等**两端必须严格一致**的可执行细节。
> 何时读取：改 `shared/`、`electron/ipc.ts`、`electron/gateway/`、`electron/db/`、`electron/backup/` 或 `src/bridge/` 之前；排查 IPC / 协议 / 存储层行为差异时。
> 关联需求：无（契约随需求变更，需求见 `../requirements/index.md`）。
> 最后更新：2026-09-13
> 来源：原 prd.md §6/§7、原 docs/impl-contract.md（2026-09-13 文档架构升级时拆分收敛）

## 文档索引

| 文档 | 内容 | 唯一权威范围 |
| --- | --- | --- |
| [impl-contract.md](./impl-contract.md) | 共享类型总览、`EasyUiApi` 桥接 API、事件通道、IPC 错误编码、预置供应商表、Mock 桥契约 | 跨进程接口细节（冲突时以本目录文档为准，代码 `shared/types.ts` 为最终事实） |
| [protocol-mapping.md](./protocol-mapping.md) | 三种 API 格式的 payload/SSE/Header/参数映射、joinUrl 规则、错误码 | 协议映射细节 |
| [db-schema.md](./db-schema.md) | SQLite 表结构（v1→v3 迁移）、索引、迁移与回填规则 | 数据库结构 |
| [backup-format.md](./backup-format.md) | 备份 zip 结构、manifest 字段、含密钥备份加密参数 | 备份格式 |

## 约定

- 行为规则（"为什么这样做、交互怎么走"）在 `../design/` 对应文档；本目录只放接口、字段、协议、格式。
- 与 `../prd.md`（产品定位/边界/非目标）冲突时以 prd.md 为准；本目录内部按上表"唯一权威范围"裁决。
- 改契约必须同步改代码（`shared/types.ts` 头部注释声明了两端镜像关系）与两端实现（Electron 主进程 + `src/bridge/mock.ts`）。
