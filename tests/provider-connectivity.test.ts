import { describe, expect, test } from "bun:test";
import { testProviderConnectivity } from "../src/providers/connectivity";
import type { ProviderProfile, ProxyConfig } from "../src/config/schema";

const provider: ProviderProfile = {
  id: "openrouter",
  name: "OpenRouter",
  type: "openai-compatible",
  baseUrl: "https://openrouter.ai/api/v1",
  models: [{ id: "qwen/qwen3-coder" }],
};

const proxy: ProxyConfig = {
  enabled: false,
  host: "127.0.0.1",
  port: 17890,
  upstreamProxy: "http://127.0.0.1:7890",
  retry: { enabled: true, maxAttempts: 3 },
  failover: { enabled: true, strategy: "ordered" },
};

describe("provider connectivity", () => {
  test("passes upstream proxy into Bun fetch options", async () => {
    let seenProxy: string | undefined;
    const result = await testProviderConnectivity(provider, proxy, async (_url, init) => {
      seenProxy = init.proxy;
      return new Response("not found", { status: 404 });
    });

    expect(result.ok).toBe(true);
    expect(seenProxy).toBe("http://127.0.0.1:7890");
  });

  test("fails provider without baseUrl before network calls", async () => {
    const result = await testProviderConnectivity({ ...provider, baseUrl: undefined }, proxy, async () => {
      throw new Error("should not fetch");
    });

    expect(result.ok).toBe(false);
    expect(result.issues[0]).toContain("baseUrl");
  });
});
