import { join } from "node:path";
import { BaseClientAdapter } from "./base";
import type { ApplyClientConfigInput, ApplyClientSlotsInput, ClientCurrentState, ClientId, PatchPlan } from "./types";
import { parseJsonObject, readTextIfExists, recordAt, stringifyJson } from "./utils";
import { normalizeProviderType, resolveModelType, type ProviderProfile, type ProviderType } from "../config/schema";

type CowAgentProviderFields = {
  botType: string;
  apiBaseKey?: string | undefined;
  apiKeyKey?: string | undefined;
  expectedApiKeyEnv?: string | undefined;
};

type CowAgentCapabilityProvider =
  | "openai"
  | "gemini"
  | "dashscope"
  | "doubao"
  | "zhipu"
  | "moonshot"
  | "minimax"
  | "mimo"
  | "linkai";

type CowAgentCapabilityConfig = {
  provider: CowAgentCapabilityProvider;
  modelId: string;
  fields: CowAgentProviderFields;
};

export class CowAgentAdapter extends BaseClientAdapter {
  id: ClientId = "cowagent";
  displayName = "CowAgent";
  configPath: string;
  protected override commandNames = ["cow"];

  constructor(homeDir: string) {
    super();
    const cowAgentHome = process.env.COWAGENT_HOME ?? join(homeDir, "CowAgent");
    this.configPath = join(cowAgentHome, "config.json");
  }

  async readConfig(): Promise<unknown> {
    return parseJsonObject(await readTextIfExists(this.configPath));
  }

  async planApply(input: ApplyClientConfigInput): Promise<PatchPlan> {
    const before = await readTextIfExists(this.configPath);
    const config = parseJsonObject(before);
    applyCowAgentMain(config, input.provider, input.modelId);

    const aiAgentSwitch = recordAt(config, "ai_agent_switch");
    aiAgentSwitch.provider = input.provider.id;
    aiAgentSwitch.model = input.modelId;

    const file = before === undefined
      ? { path: this.configPath, after: stringifyJson(config) }
      : { path: this.configPath, before, after: stringifyJson(config) };
    return { clientId: this.id, summary: `Switch CowAgent to ${input.provider.id}/${input.modelId}`, files: [file] };
  }

  async planApplySlots(input: ApplyClientSlotsInput): Promise<PatchPlan> {
    const main = input.slots.find((slot) => slot.slot === "main");
    if (!main) throw new Error("CowAgent requires main slot");

    const before = await readTextIfExists(this.configPath);
    const config = parseJsonObject(before);
    applyCowAgentMain(config, main.provider, main.modelId);

    const aiAgentSwitch = recordAt(config, "ai_agent_switch");
    aiAgentSwitch.provider = main.provider.id;
    aiAgentSwitch.model = main.modelId;
    const slots = recordAt(aiAgentSwitch, "slots");
    for (const slot of input.slots) {
      slots[slot.slot] = {
        provider: slot.provider.id,
        model: slot.modelId,
      };
      applyCowAgentCapabilitySlot(config, slot.slot, slot.provider, slot.modelId);
    }

    const file = before === undefined
      ? { path: this.configPath, after: stringifyJson(config) }
      : { path: this.configPath, before, after: stringifyJson(config) };
    return { clientId: this.id, summary: `Configure CowAgent model slots for ${main.provider.id}/${main.modelId}`, files: [file] };
  }

  async getCurrent(): Promise<ClientCurrentState> {
    const config = parseJsonObject(await readTextIfExists(this.configPath));
    const aiAgentSwitch = config.ai_agent_switch && typeof config.ai_agent_switch === "object" && !Array.isArray(config.ai_agent_switch)
      ? config.ai_agent_switch as Record<string, unknown>
      : {};
    return {
      clientId: this.id,
      providerId: typeof aiAgentSwitch.provider === "string" ? aiAgentSwitch.provider : undefined,
      modelId: typeof aiAgentSwitch.model === "string" ? aiAgentSwitch.model : typeof config.model === "string" ? config.model : undefined,
      configPath: this.configPath,
    };
  }
}

function applyCowAgentMain(config: Record<string, unknown>, provider: ProviderProfile, modelId: string): void {
  const fields = cowAgentProviderFields(resolveModelType(provider, modelId));
  if (fields.apiBaseKey && !provider.baseUrl) {
    throw new Error(`CowAgent requires a baseUrl for provider ${provider.id}`);
  }

  config.model = modelId;
  config.bot_type = fields.botType;
  if (fields.apiBaseKey) config[fields.apiBaseKey] = provider.baseUrl;
  if (fields.apiKeyKey) {
    const apiKey = cowAgentApiKey(provider, fields);
    if (apiKey !== undefined) config[fields.apiKeyKey] = apiKey;
  }
}

function applyCowAgentCapabilitySlot(
  config: Record<string, unknown>,
  slot: string,
  provider: ProviderProfile,
  modelId: string,
): void {
  if (slot === "main") return;
  const capability = cowAgentCapabilityConfig(provider, modelId);

  if (slot === "vision") {
    assertCowAgentCapabilityProvider(slot, capability.provider, ["openai", "gemini", "dashscope", "doubao", "zhipu", "moonshot", "minimax", "mimo", "linkai"]);
    const vision = recordAt(recordAt(config, "tools"), "vision");
    vision.provider = capability.provider;
    vision.model = capability.modelId;
    applyCowAgentCapabilityCredential(config, provider, capability.fields);
    return;
  }

  if (slot === "image") {
    assertCowAgentCapabilityProvider(slot, capability.provider, ["openai", "gemini", "dashscope", "doubao", "minimax", "linkai"]);
    const image = recordAt(recordAt(config, "skills"), "image-generation");
    image.provider = capability.provider;
    image.model = capability.modelId;
    applyCowAgentCapabilityCredential(config, provider, capability.fields);
    return;
  }

  if (slot === "asr") {
    assertCowAgentCapabilityProvider(slot, capability.provider, ["openai", "dashscope", "zhipu", "linkai"]);
    config.voice_to_text = capability.provider;
    config.voice_to_text_model = capability.modelId;
    applyCowAgentCapabilityCredential(config, provider, capability.fields);
    return;
  }

  if (slot === "tts") {
    assertCowAgentCapabilityProvider(slot, capability.provider, ["openai", "dashscope", "zhipu", "minimax", "mimo", "linkai"]);
    config.text_to_voice = capability.provider;
    config.text_to_voice_model = capability.modelId;
    config.tts_voice_id = "";
    applyCowAgentCapabilityCredential(config, provider, capability.fields);
    return;
  }

  if (slot === "embedding") {
    assertCowAgentCapabilityProvider(slot, capability.provider, ["openai", "dashscope", "doubao", "zhipu", "linkai"]);
    config.embedding_provider = capability.provider;
    config.embedding_model = capability.modelId;
    applyCowAgentCapabilityCredential(config, provider, capability.fields);
  }
}

function cowAgentCapabilityConfig(provider: ProviderProfile, modelId: string): CowAgentCapabilityConfig {
  const providerFields = cowAgentProviderFields(resolveModelType(provider, modelId));
  if (providerFields.botType === "openai") {
    return {
      provider: "openai",
      modelId,
      fields: providerFields,
    };
  }
  const capabilityProvider = cowAgentCapabilityProvider(modelId);
  return {
    provider: capabilityProvider,
    modelId,
    fields: cowAgentCapabilityProviderFields(capabilityProvider),
  };
}

function cowAgentCapabilityProvider(modelId: string): CowAgentCapabilityProvider {
  const model = modelId.toLowerCase();
  if (model.startsWith("qwen") || model === "text-embedding-v4") return "dashscope";
  if (model.startsWith("gemini-") || model.startsWith("nano-banana")) return "gemini";
  if (model.startsWith("gpt-") || model.startsWith("o1-") || model.startsWith("o3-") || model.startsWith("o4-") || model.startsWith("chatgpt-") || model.startsWith("text-embedding-3-") || model.startsWith("whisper-")) return "openai";
  if (model.startsWith("glm-") || model === "embedding-3") return "zhipu";
  if (model.startsWith("kimi-") || model.startsWith("moonshot-")) return "moonshot";
  if (model.startsWith("doubao-") || model.startsWith("seedream")) return "doubao";
  if (model.startsWith("minimax") || model.startsWith("abab") || model === "image-01") return "minimax";
  if (model.startsWith("mimo-")) return "mimo";
  if (model.startsWith("linkai-")) return "linkai";
  throw new Error(`CowAgent cannot infer capability provider for model ${modelId}`);
}

function assertCowAgentCapabilityProvider(slot: string, provider: CowAgentCapabilityProvider, allowed: CowAgentCapabilityProvider[]): void {
  if (!allowed.includes(provider)) {
    throw new Error(`CowAgent slot ${slot} does not support ${provider} model providers`);
  }
}

function applyCowAgentCapabilityCredential(
  config: Record<string, unknown>,
  provider: ProviderProfile,
  fields: CowAgentProviderFields,
): void {
  if (fields.apiBaseKey && provider.baseUrl) config[fields.apiBaseKey] = provider.baseUrl;
  if (!fields.apiKeyKey) return;

  const apiKey = cowAgentApiKeyForCapability(provider, fields);
  if (apiKey !== undefined) config[fields.apiKeyKey] = apiKey;
}

function cowAgentCapabilityProviderFields(provider: CowAgentCapabilityProvider): CowAgentProviderFields {
  switch (provider) {
    case "openai":
      return { botType: "openai", apiBaseKey: "open_ai_api_base", apiKeyKey: "open_ai_api_key", expectedApiKeyEnv: "OPEN_AI_API_KEY" };
    case "gemini":
      return { botType: "gemini", apiBaseKey: "gemini_api_base", apiKeyKey: "gemini_api_key", expectedApiKeyEnv: "GEMINI_API_KEY" };
    case "dashscope":
      return { botType: "dashscope", apiBaseKey: "dashscope_api_base", apiKeyKey: "dashscope_api_key", expectedApiKeyEnv: "DASHSCOPE_API_KEY" };
    case "doubao":
      return { botType: "doubao", apiBaseKey: "ark_base_url", apiKeyKey: "ark_api_key", expectedApiKeyEnv: "ARK_API_KEY" };
    case "zhipu":
      return { botType: "zhipu", apiBaseKey: "zhipu_ai_api_base", apiKeyKey: "zhipu_ai_api_key", expectedApiKeyEnv: "ZHIPU_AI_API_KEY" };
    case "moonshot":
      return { botType: "moonshot", apiBaseKey: "moonshot_base_url", apiKeyKey: "moonshot_api_key", expectedApiKeyEnv: "MOONSHOT_API_KEY" };
    case "minimax":
      return { botType: "minimax", apiBaseKey: "minimax_api_base", apiKeyKey: "minimax_api_key", expectedApiKeyEnv: "MINIMAX_API_KEY" };
    case "mimo":
      return { botType: "mimo", apiBaseKey: "mimo_api_base", apiKeyKey: "mimo_api_key", expectedApiKeyEnv: "MIMO_API_KEY" };
    case "linkai":
      return { botType: "linkai", apiBaseKey: "linkai_api_base", apiKeyKey: "linkai_api_key", expectedApiKeyEnv: "LINKAI_API_KEY" };
  }
}

function cowAgentProviderFields(type: ProviderType): CowAgentProviderFields {
  switch (normalizeProviderType(type)) {
    case "anthropic":
      throw new Error("CowAgent requires an OpenAI Chat-compatible provider; Anthropic providers are not supported");
    case "gemini":
      return {
        botType: "gemini",
        apiBaseKey: "gemini_api_base",
        apiKeyKey: "gemini_api_key",
        expectedApiKeyEnv: "GEMINI_API_KEY",
      };
    case "deepseek":
      return {
        botType: "deepseek",
        apiBaseKey: "deepseek_api_base",
        apiKeyKey: "deepseek_api_key",
        expectedApiKeyEnv: "DEEPSEEK_API_KEY",
      };
    case "moonshot":
      return {
        botType: "moonshot",
        apiBaseKey: "moonshot_base_url",
        apiKeyKey: "moonshot_api_key",
        expectedApiKeyEnv: "MOONSHOT_API_KEY",
      };
    case "dashscope":
      return {
        botType: "dashscope",
        apiKeyKey: "dashscope_api_key",
        expectedApiKeyEnv: "DASHSCOPE_API_KEY",
      };
    case "openai-chat-compatible":
    case "openrouter":
    case "siliconflow":
    case "lmstudio":
    case "custom":
      return {
        botType: "openai",
        apiBaseKey: "open_ai_api_base",
        apiKeyKey: "open_ai_api_key",
        expectedApiKeyEnv: "OPEN_AI_API_KEY",
      };
    case "openai-responses":
      throw new Error("CowAgent requires an OpenAI Chat-compatible provider; OpenAI Responses providers are not supported");
    case "ollama":
      throw new Error("CowAgent does not support Ollama providers");
    default:
      throw new Error(`Unsupported CowAgent provider type: ${type}`);
  }
}

function cowAgentApiKeyForCapability(provider: ProviderProfile, fields: CowAgentProviderFields): string | undefined {
  if (provider.apiKey?.kind === "inline") return provider.apiKey.value;
  const envName = provider.apiKeyEnv ?? (provider.apiKey?.kind === "env" ? provider.apiKey.name : undefined);
  if (!envName) return undefined;
  if (envName === fields.expectedApiKeyEnv) return undefined;
  return process.env[envName] || undefined;
}

function cowAgentApiKey(provider: ProviderProfile, fields: CowAgentProviderFields): string | undefined {
  if (provider.apiKey?.kind === "inline") return provider.apiKey.value;
  const envName = provider.apiKeyEnv ?? (provider.apiKey?.kind === "env" ? provider.apiKey.name : undefined);
  if (!envName) return undefined;
  if (envName !== fields.expectedApiKeyEnv) {
    throw new Error(`CowAgent reads ${fields.expectedApiKeyEnv} for this provider type, but provider ${provider.id} uses ${envName}`);
  }
  return undefined;
}
