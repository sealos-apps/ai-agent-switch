import { describe, expect, test } from "bun:test";
import { createDefaultConfig, type ProviderProfile } from "../src/config/schema";
import { forwardProviderRequest, resolveProxyRouteCandidates } from "../src/proxy/server";

const openrouter: ProviderProfile = {
  id: "openrouter",
  name: "OpenRouter",
  type: "openai-compatible",
  baseUrl: "https://openrouter.ai/api/v1",
  models: [{ id: "qwen/qwen3-coder" }],
};

const deepseek: ProviderProfile = {
  id: "deepseek",
  name: "DeepSeek",
  type: "openai-compatible",
  baseUrl: "https://api.deepseek.com/v1",
  models: [{ id: "deepseek-chat" }],
};

describe("proxy routes", () => {
  test("resolves configured route candidates in order", () => {
    const config = createDefaultConfig();
    config.providers.openrouter = openrouter;
    config.providers.deepseek = deepseek;
    config.routes.default = {
      candidates: [
        { providerId: "openrouter", modelId: "qwen/qwen3-coder" },
        { providerId: "deepseek", modelId: "deepseek-chat" },
      ],
    };

    expect(resolveProxyRouteCandidates(config).map((candidate) => `${candidate.provider.id}/${candidate.modelId}`)).toEqual([
      "openrouter/qwen/qwen3-coder",
      "deepseek/deepseek-chat",
    ]);
  });

  test("falls back to provider default or first model when no route is configured", () => {
    const config = createDefaultConfig();
    config.providers.openrouter = { ...openrouter, defaultModel: "qwen/qwen3-coder" };

    expect(resolveProxyRouteCandidates(config).map((candidate) => `${candidate.provider.id}/${candidate.modelId}`)).toEqual([
      "openrouter/qwen/qwen3-coder",
    ]);
  });

  test("rewrites JSON request body model to selected route model", async () => {
    let body = "";
    const response = await forwardProviderRequest(
      openrouter,
      new Request("http://127.0.0.1:17890/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "whatever", messages: [{ role: "user", content: "hi" }] }),
      }),
      undefined,
      async (_url, init) => {
        body = String(init.body);
        return new Response("ok");
      },
      "qwen/qwen3-coder",
    );

    expect(await response.text()).toBe("ok");
    expect(JSON.parse(body).model).toBe("qwen/qwen3-coder");
  });
});
