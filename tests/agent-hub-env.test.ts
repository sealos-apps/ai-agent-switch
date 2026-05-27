import { describe, expect, test } from "bun:test";
import { resolveAgentHubEnv } from "../src/core/agent-hub-env";
import type { ProviderType } from "../src/config/schema";

describe("Agent Hub env resolver", () => {
  test("maps AI Proxy chat env to Agent Hub init input", () => {
    expect(resolveAgentHubEnv({
      AGENT_MODEL_PROVIDER: "custom:aiproxy-chat",
      AGENT_MODEL_BASEURL: "https://api.example.test/v1",
      AGENT_MODEL_APIKEY: "sk-test",
      AGENT_MODEL: "glm-5.1",
      AGENT_MODEL_API_MODE: "chat_completions",
    })).toEqual({
      providerId: "aiproxy-chat",
      providerName: "AI Proxy Chat Completions",
      modelType: "openai-chat-compatible",
      baseUrl: "https://api.example.test/v1",
      apiKeyEnv: "AGENT_MODEL_APIKEY",
      modelId: "glm-5.1",
      availableModels: [{ id: "glm-5.1", type: "openai-chat-compatible" }],
    });
  });

  const apiModeCases: [string, string, string, string, ProviderType][] = [
    ["custom:aiproxy-responses", "codex_responses", "aiproxy-responses", "AI Proxy Responses", "openai-responses"],
    ["custom:aiproxy-responses", "openai-responses", "aiproxy-responses", "AI Proxy Responses", "openai-responses"],
    ["custom:aiproxy-anthropic", "anthropic_messages", "aiproxy-anthropic", "AI Proxy Anthropic Messages", "anthropic"],
    ["custom:aiproxy-anthropic", "anthropic", "aiproxy-anthropic", "AI Proxy Anthropic Messages", "anthropic"],
  ];

  test.each(apiModeCases)("maps %s with %s", (provider, apiMode, providerId, providerName, modelType) => {
    const result = resolveAgentHubEnv({
      AGENT_MODEL_PROVIDER: provider,
      AGENT_MODEL_BASEURL: "https://api.example.test/v1",
      AGENT_MODEL_APIKEY: "sk-test",
      AGENT_MODEL: "gpt-5.5",
      AGENT_MODEL_API_MODE: apiMode,
    });

    expect(result.providerId).toBe(providerId);
    expect(result.providerName).toBe(providerName);
    expect(result.modelType).toBe(modelType);
    expect(result.availableModels).toEqual([{ id: "gpt-5.5", type: modelType }]);
  });

  test("maps a custom provider without AI Proxy naming", () => {
    expect(resolveAgentHubEnv({
      AGENT_MODEL_PROVIDER: "custom:my-provider/team",
      AGENT_MODEL_BASEURL: "https://llm.example.test/v1",
      AGENT_MODEL_APIKEY: "sk-test",
      AGENT_MODEL: "my-model",
      AGENT_MODEL_API_MODE: "chat_completions",
    })).toMatchObject({
      providerId: "my-provider-team",
      providerName: "my-provider-team",
      apiKeyEnv: "AGENT_MODEL_APIKEY",
      modelType: "openai-chat-compatible",
    });
  });

  test("rejects missing required env instead of silently skipping", () => {
    expect(() => resolveAgentHubEnv({
      AGENT_MODEL_PROVIDER: "custom:aiproxy-chat",
      AGENT_MODEL_BASEURL: "https://api.example.test/v1",
      AGENT_MODEL_APIKEY: "",
      AGENT_MODEL: "glm-5.1",
    })).toThrow("AGENT_MODEL_PROVIDER, AGENT_MODEL_BASEURL, AGENT_MODEL_APIKEY, and AGENT_MODEL are required");
  });
});
