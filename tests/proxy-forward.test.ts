import { describe, expect, test } from "bun:test";
import { forwardProviderRequest } from "../src/proxy/server";
import type { ProviderProfile } from "../src/config/schema";

describe("proxy forwarding", () => {
  test("forwards path, query, provider headers, auth, and upstream proxy option", async () => {
    const provider: ProviderProfile = {
      id: "local",
      name: "Local",
      type: "openai-compatible",
      baseUrl: "https://api.example.com/v1",
      apiKey: { kind: "inline", value: "secret" },
      headers: { "x-provider": "yes" },
      models: [{ id: "model" }],
    };
    let seenUrl = "";
    let seenProxy = "";
    let seenAuthorization = "";
    let seenProviderHeader = "";

    const response = await forwardProviderRequest(
      provider,
      new Request("http://127.0.0.1:17890/chat/completions?stream=true", {
        method: "POST",
        body: "{}",
      }),
      "http://127.0.0.1:7890",
      async (url, init) => {
        seenUrl = String(url);
        seenProxy = init.proxy ?? "";
        const headers = new Headers(init.headers);
        seenAuthorization = headers.get("authorization") ?? "";
        seenProviderHeader = headers.get("x-provider") ?? "";
        return new Response("ok");
      },
    );

    expect(await response.text()).toBe("ok");
    expect(seenUrl).toBe("https://api.example.com/v1/chat/completions?stream=true");
    expect(seenProxy).toBe("http://127.0.0.1:7890");
    expect(seenAuthorization).toBe("Bearer secret");
    expect(seenProviderHeader).toBe("yes");
  });
});
