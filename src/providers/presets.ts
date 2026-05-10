import type { ProviderProfile, ProviderType } from "../config/schema";

export type ProviderPresetAddOptions = {
  apiKeyEnv?: string | undefined;
};

export type ProviderPreset = {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl?: string | undefined;
  apiKeyEnv?: string | undefined;
  models: string[];
  defaultModel?: string | undefined;
  description: string;
  toProvider(options?: ProviderPresetAddOptions): ProviderProfile;
};

type PresetDefinition = Omit<ProviderPreset, "toProvider">;

const presetDefinitions: PresetDefinition[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    type: "openai-chat-compatible",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKeyEnv: "OPENROUTER_API_KEY",
    models: ["qwen/qwen3-coder", "anthropic/claude-sonnet-4.5", "openai/gpt-5.1"],
    defaultModel: "qwen/qwen3-coder",
    description: "OpenRouter OpenAI-compatible endpoint.",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    type: "openai-chat-compatible",
    baseUrl: "https://api.deepseek.com/v1",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    models: ["deepseek-chat", "deepseek-reasoner"],
    defaultModel: "deepseek-chat",
    description: "DeepSeek OpenAI-compatible endpoint.",
  },
  {
    id: "dashscope",
    name: "DashScope",
    type: "openai-chat-compatible",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    apiKeyEnv: "DASHSCOPE_API_KEY",
    models: ["qwen3-coder-plus", "qwen-plus", "qwen-max"],
    defaultModel: "qwen3-coder-plus",
    description: "Alibaba DashScope OpenAI-compatible endpoint.",
  },
  {
    id: "moonshot",
    name: "Moonshot",
    type: "openai-chat-compatible",
    baseUrl: "https://api.moonshot.cn/v1",
    apiKeyEnv: "MOONSHOT_API_KEY",
    models: ["kimi-k2-0711-preview", "moonshot-v1-32k"],
    defaultModel: "kimi-k2-0711-preview",
    description: "Moonshot/Kimi OpenAI-compatible endpoint.",
  },
  {
    id: "siliconflow",
    name: "SiliconFlow",
    type: "openai-chat-compatible",
    baseUrl: "https://api.siliconflow.cn/v1",
    apiKeyEnv: "SILICONFLOW_API_KEY",
    models: ["Qwen/Qwen3-Coder-480B-A35B-Instruct", "deepseek-ai/DeepSeek-V3"],
    defaultModel: "Qwen/Qwen3-Coder-480B-A35B-Instruct",
    description: "SiliconFlow OpenAI-compatible endpoint.",
  },
  {
    id: "openai",
    name: "OpenAI",
    type: "openai-responses",
    baseUrl: "https://api.openai.com/v1",
    apiKeyEnv: "OPENAI_API_KEY",
    models: ["gpt-5.1", "gpt-5-mini"],
    defaultModel: "gpt-5.1",
    description: "OpenAI API.",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    type: "anthropic",
    baseUrl: "https://api.anthropic.com",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    models: ["claude-sonnet-4.5", "claude-haiku-4.5"],
    defaultModel: "claude-sonnet-4.5",
    description: "Anthropic API.",
  },
  {
    id: "gemini",
    name: "Gemini",
    type: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    apiKeyEnv: "GEMINI_API_KEY",
    models: ["gemini-3-pro", "gemini-2.5-pro"],
    defaultModel: "gemini-3-pro",
    description: "Google Gemini API.",
  },
  {
    id: "ollama",
    name: "Ollama",
    type: "ollama",
    baseUrl: "http://127.0.0.1:11434/v1",
    models: ["llama3.1", "qwen2.5-coder"],
    defaultModel: "llama3.1",
    description: "Local Ollama OpenAI-compatible endpoint.",
  },
  {
    id: "lmstudio",
    name: "LM Studio",
    type: "lmstudio",
    baseUrl: "http://127.0.0.1:1234/v1",
    models: ["local-model"],
    defaultModel: "local-model",
    description: "Local LM Studio OpenAI-compatible endpoint.",
  },
  {
    id: "agent-switch-proxy",
    name: "agent-switch Proxy",
    type: "openai-chat-compatible",
    baseUrl: "http://127.0.0.1:17890/v1",
    models: ["agent-switch/default"],
    defaultModel: "agent-switch/default",
    description: "Local agent-switch proxy endpoint.",
  },
];

export function listProviderPresets(): ProviderPreset[] {
  return presetDefinitions.map(toPreset);
}

export function getProviderPreset(id: string): ProviderPreset | undefined {
  return listProviderPresets().find((preset) => preset.id === id);
}

function toPreset(definition: PresetDefinition): ProviderPreset {
  return {
    ...definition,
    toProvider(options: ProviderPresetAddOptions = {}) {
      const provider: ProviderProfile = {
        id: definition.id,
        name: definition.name,
        type: definition.type,
        models: definition.models.map((id) => ({ id })),
      };
      if (definition.baseUrl) provider.baseUrl = definition.baseUrl;
      const apiKeyEnv = options.apiKeyEnv ?? definition.apiKeyEnv;
      if (apiKeyEnv) provider.apiKeyEnv = apiKeyEnv;
      if (definition.defaultModel) provider.defaultModel = definition.defaultModel;
      return provider;
    },
  };
}
