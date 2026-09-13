# 参数与预设系统（LM Studio 式，schema v2）

> 适用范围：生效参数的分层合成语义（全局预设 ← 用户预设 ← 会话 overrides）、`ParamValues` 全量字段行为、覆盖/修剪规则、协议差异提示原则。
> 何时读取：改参数面板、预设管理、`shared/params.ts` 合成逻辑之前。
> 关联需求：无（v1.0.1 现状快照）。
> 最后更新：2026-09-13
> 来源：原 prd.md §4.2；类型契约见 `../contracts/impl-contract.md` §1，协议映射见 `../contracts/protocol-mapping.md` §5

## 1. 合成语义

**生效参数 = 全局预设 ←(覆盖) 选中用户预设 ←(覆盖) 会话 overrides**。

- 会话只存 overrides（`Partial`），与基线等值的键自动删除（**等值修剪**）；`null` 显式删除某键（垃圾桶/重置语义）。
- 全局预设（id=`global`）常驻、不可删、不可改名（违反报 `global_preset_readonly`），在设置页编辑并可恢复出厂默认（`resetGlobalPreset`）；用户预设可在参数面板新建/套用。
- 引用被删预设的会话 `preset_id` 回落 null（= 全局预设）。
- 模型切换不回溯修改历史消息，`provider_id`/`model` 存会话顶层字段。
- 右栏参数面板：覆盖项高亮 + 一键回退预设。

## 2. `ParamValues` 全量字段

| 参数 | 类型 / 范围 | 说明 |
| --- | --- | --- |
| `system_prompt` | 多行文本 | 为空则不注入 |
| `temperature` | float 0–2 | 总是发送 |
| `limit_response_length` + `max_tokens` | bool + int 1–128000 | 开启才发送 `max_tokens` |
| `context_window` | int（token 数） | 上下文预算上限，也是计量环分母（`./context-trim.md`） |
| `context_overflow` | `rolling` / `truncate_middle` / `stop` | 溢出策略，见 `./context-trim.md` |
| `stop_strings` | string[] | 非空才发送 |
| `top_k` | int 0–500，0 = 不发送 | anthropic 与 OpenRouter 传递，其余协议 UI 提示不支持 |
| `repeat_penalty_enabled` + `repeat_penalty` | bool + float 0–2 | openai 系映射 `frequency_penalty = value − 1`（仅 >1 时传，近似语义） |
| `presence_penalty_enabled` + `presence_penalty` | bool + float −2–2 | |
| `top_p_enabled` + `top_p` | bool + float 0–1 | |
| `min_p_enabled` + `min_p` | bool + float 0–1 | 仅 OpenRouter 支持 |
| `structured_output_enabled` + `…_schema` | bool + JSON Schema 文本 | 不可解析发送前报 `invalid_json_schema`（请求不发出） |
| `stream` | bool，默认开 | |

工厂默认（`FACTORY_DEFAULTS`）：temperature 0.8、max_tokens 1000、context_overflow `truncate_middle`、top_k 64、top_p 1.0、repeat_penalty 1.0、context_window 128000、stream true，其余关闭/空。

## 3. 协议差异处理原则

适配层静默丢弃目标协议不支持的参数（明细见 `../contracts/protocol-mapping.md` §5），UI 仅做"当前协议不生效"提示，不强制报错。
