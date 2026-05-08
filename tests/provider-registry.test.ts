import { describe, expect, test } from "bun:test";
import { ProviderRegistry } from "../src/providers/registry";

describe("ProviderRegistry", () => {
  test("adds providers, masks secrets, and resolves provider/model refs", () => {
    const registry = new ProviderRegistry({
      version: 1,
      clients: {},
      providers: {},
      routes: {},
      proxy: {
        enabled: false,
        host: "127.0.0.1",
        port: 17890,
        upstreamProxy: "http://127.0.0.1:7890",
        retry: { enabled: true, maxAttempts: 3 },
        failover: { enabled: true, strategy: "ordered" },
      },
      ui: { theme: "default" },
    });

    registry.upsert({
      id: "openrouter",
      name: "OpenRouter",
      type: "openai-compatible",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: { kind: "inline", value: "sk-secret-value" },
      models: [{ id: "qwen/qwen3-coder" }],
    });

    expect(registry.resolveModelRef("openrouter/qwen/qwen3-coder")).toEqual({
      providerId: "openrouter",
      modelId: "qwen/qwen3-coder",
    });
    expect(registry.safeList()[0]?.apiKey).toEqual({ kind: "inline", value: "sk-s**********ue" });
  });

  test("rejects unknown provider/model refs", () => {
    const registry = ProviderRegistry.empty();
    expect(() => registry.resolveModelRef("missing/gpt-5")).toThrow("Provider not found");
  });
});
