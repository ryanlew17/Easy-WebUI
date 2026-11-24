# 参数与预设

> 权威范围：参数分层合成、预设生命周期、覆盖修剪和协议差异提示。
> 何时读取：修改参数面板、预设管理或 `shared/params.ts` 之前。
> 代码事实来源：`shared/params.ts`、`shared/types.ts`、`src/components/params/ParamSections.tsx`。
> 最后更新：2026-11-22

## 1. 合成与预设

**生效参数 = 全局预设 ← 用户预设 ← 会话 overrides。**

- 会话只保存 overrides；与基线等值的键自动删除，`null` 表示删除该覆盖并回退基线。
- 全局预设 `id=global` 常驻，不可删除或改名，违规报 `global_preset_readonly`；可在设置页编辑或恢复出厂默认。
- 用户预设可在参数面板另存和套用；被引用预设删除后，会话 `preset_id` 回退为 `null`。
- 参数面板标识覆盖项并提供逐行重置；共享字段和控件的视觉规则见 `./ui-liquid-glass.md`。

## 2. 参数字段

| 参数 | 类型 / 范围 | 发送行为 |
| --- | --- | --- |
| `system_prompt` | 多行文本 | 非空才注入 |
| `temperature` | 0–2 | 总是发送 |
| `limit_response_length` + `max_tokens` | bool + 1–128000 | 开启才发送 `max_tokens` |
| `context_window` | int | 发送预算与本地计量的窗口上限 |
| `context_overflow` | rolling / truncate_middle / stop | 见 `./context-trim.md` |
| `stop_strings` | string[] | 非空才发送 |
| `top_k` | 0–500；0 不发送 | anthropic 与 OpenRouter 使用 |
| `repeat_penalty_enabled` + `repeat_penalty` | bool + 0–2 | openai 系映射为 `frequency_penalty=value−1`，仅大于 1 时传递 |
| `presence_penalty_enabled` + `presence_penalty` | bool + −2–2 | 开启才发送 |
| `top_p_enabled` + `top_p` | bool + 0–1 | 开启才发送 |
| `min_p_enabled` + `min_p` | bool + 0–1 | 仅 OpenRouter 支持 |
| `structured_output_enabled` + `structured_output_schema` | bool + JSON Schema | Schema 不可解析时报 `invalid_json_schema`，不发请求 |
| `stream` | bool | 控制流式请求 |

`FACTORY_DEFAULTS`：temperature 0.8、max_tokens 1000、context_overflow `truncate_middle`、top_k 64、top_p 1.0、repeat_penalty 1.0、context_window 128000、stream true，其余关闭或为空。

## 3. 协议差异

协议字段与支持范围由 `../contracts/protocol-mapping.md` 定义。适配层丢弃目标协议不支持的参数，UI 只提示“当前协议不生效”，不强制报错。
