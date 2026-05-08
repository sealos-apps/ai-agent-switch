import { describe, expect, test } from "bun:test";
import { routeWithFailover } from "../src/proxy/router";
import type { ProviderProfile } from "../src/config/schema";

function provider(id: string): ProviderProfile {
  return {
    id,
    name: id,
    type: "openai-compatible",
    baseUrl: `https://${id}.example.com/v1`,
    models: [{ id: "model" }],
  };
}

describe("proxy router", () => {
  test("retries a provider and then fails over to the next provider", async () => {
    const attempts: string[] = [];
    const result = await routeWithFailover({
      providers: [provider("a"), provider("b")],
      retry: { enabled: true, maxAttempts: 2 },
      failover: { enabled: true, strategy: "ordered" },
      request: async ({ provider }) => {
        attempts.push(provider.id);
        if (provider.id === "a") throw new Error("upstream failed");
        return new Response("ok", { status: 200 });
      },
    });

    expect(await result.response.text()).toBe("ok");
    expect(result.provider.id).toBe("b");
    expect(attempts).toEqual(["a", "a", "b"]);
  });
});
