import type { PresetProvider } from './types';

/**
 * 预置供应商模板（契约 §4，端点已核实）。
 * 仅作为"新增平台"表单的快捷填充模板，不预写数据库。
 * 注意 base_url 均不含末尾 '/'；含版本段的（v4/v3/v1 等）由 joinUrl 识别、不再叠加 /v1。
 */
export const PRESETS: readonly PresetProvider[] = [
  { key: 'openai', label: 'OpenAI', base_url: 'https://api.openai.com', api_format: 'openai-chat', homepage: 'https://platform.openai.com' },
  { key: 'anthropic', label: 'Anthropic', base_url: 'https://api.anthropic.com', api_format: 'anthropic', homepage: 'https://console.anthropic.com' },
  { key: 'openrouter', label: 'OpenRouter', base_url: 'https://openrouter.ai/api', api_format: 'openai-chat', homepage: 'https://openrouter.ai' },
  { key: 'deepseek', label: 'DeepSeek', base_url: 'https://api.deepseek.com', api_format: 'openai-chat', homepage: 'https://platform.deepseek.com' },
  { key: 'kimi', label: 'Kimi (Moonshot AI)', base_url: 'https://api.moonshot.cn', api_format: 'openai-chat', homepage: 'https://platform.moonshot.cn' },
  { key: 'bigmodel', label: '智谱 (Bigmodel)', base_url: 'https://open.bigmodel.cn/api/paas/v4', api_format: 'openai-chat', homepage: 'https://open.bigmodel.cn' },
  { key: 'xiaomimimo', label: '小米 (Xiaomi MiMo)', base_url: 'https://api.xiaomimimo.com/v1', api_format: 'openai-chat', homepage: 'https://xiaomimimo.com' },
  { key: 'minimax', label: 'MiniMax', base_url: 'https://api.minimaxi.com/v1', api_format: 'openai-chat', homepage: 'https://www.minimaxi.com' },
  { key: 'siliconflow', label: '硅基流动 (SiliconFlow)', base_url: 'https://api.siliconflow.cn/v1', api_format: 'openai-chat', homepage: 'https://siliconflow.cn' },
  { key: 'modelscope', label: '魔搭 (ModelScope)', base_url: 'https://api-inference.modelscope.cn/v1', api_format: 'openai-chat', homepage: 'https://modelscope.cn' },
  { key: 'volcengine', label: '火山引擎 (Ark)', base_url: 'https://ark.cn-beijing.volces.com/api/v3', api_format: 'openai-chat', homepage: 'https://www.volcengine.com' },
  { key: 'alibailian', label: '阿里云百炼 (Alibaba Cloud Bailian)', base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', api_format: 'openai-chat', homepage: 'https://bailian.console.aliyun.com' },
];
