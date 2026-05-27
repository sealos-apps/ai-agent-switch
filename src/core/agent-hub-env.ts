import type { ProviderType } from "../config/schema";
import type { AgentHubAvailableModel } from "./app";

export type AgentHubEnvInput = Record<string, string | undefined>;

export type ResolvedAgentHubEnv = {
  providerId: string;
  providerName: string;
  modelType: ProviderType;
  baseUrl: string;
  apiKeyEnv: string;
  modelId: string;
  availableModels: AgentHubAvailableModel[];
};

export function resolveAgentHubEnv(env: AgentHubEnvInput): ResolvedAgentHubEnv {
  const provider = trim(env.AGENT_MODEL_PROVIDER);
  const baseUrl = trim(env.AGENT_MODEL_BASEURL);
  const apiKey = env.AGENT_MODEL_APIKEY ?? "";
  const modelId = trim(env.AGENT_MODEL);

  if (!provider || !baseUrl || !apiKey || !modelId) {
    throw new Error("AGENT_MODEL_PROVIDER, AGENT_MODEL_BASEURL, AGENT_MODEL_APIKEY, and AGENT_MODEL are required");
  }

  const modelType = resolveModelType(env.AGENT_MODEL_API_MODE);
  const providerId = resolveProviderId(provider);

  return {
    providerId,
    providerName: resolveProviderName(provider, providerId),
    modelType,
    baseUrl,
    apiKeyEnv: "AGENT_MODEL_APIKEY",
    modelId,
    availableModels: [{ id: modelId, type: modelType }],
  };
}

function resolveModelType(value: string | undefined): ProviderType {
  switch (trim(value)) {
    case "":
    case "chat_completions":
    case "openai_chat":
      return "openai-chat-compatible";
    case "codex_responses":
    case "openai-responses":
    case "responses":
    case "image_generation":
      return "openai-responses";
    case "anthropic_messages":
    case "anthropic":
      return "anthropic";
    default:
      throw new Error(`Unsupported AGENT_MODEL_API_MODE: ${value}`);
  }
}

function resolveProviderId(provider: string): string {
  const raw = provider.startsWith("custom:") ? provider.slice("custom:".length) : provider;
  return raw.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "agent-hub";
}

function resolveProviderName(provider: string, providerId: string): string {
  switch (provider) {
    case "custom:aiproxy-chat":
      return "AI Proxy Chat Completions";
    case "custom:aiproxy-responses":
      return "AI Proxy Responses";
    case "custom:aiproxy-anthropic":
      return "AI Proxy Anthropic Messages";
    default:
      return providerId;
  }
}

function trim(value: string | undefined): string {
  return value?.trim() ?? "";
}
