import { describe, expect, test } from "bun:test";
import { createDefaultConfig, type ProviderProfile } from "../src/config/schema";
import { handleProxyRequest } from "../src/proxy/server";

const first: ProviderProfile = {
  id: "first",
  name: "First",
  type: "openai-compatible",
  baseUrl: "https://first.example.com/v1",
  models: [{ id: "first-model" }],
};

const second: ProviderProfile = {
  id: "second",
  name: "Second",
  type: "openai-compatible",
  baseUrl: "https://second.example.com/v1",
  models: [{ id: "second-model" }],
};

describe("proxy handler", () => {
  test("returns health JSON without requiring providers", async () => {
    const config = createDefaultConfig();
    const response = await handleProxyRequest(config, new Request("http://127.0.0.1:17890/health"));
    const body = await response.json() as { ok: boolean; proxy: { enabled: boolean } };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.proxy.enabled).toBe(false);
  });

  test("returns OpenAI-compatible models from configured route candidates without upstream fetch", async () => {
    const config = createDefaultConfig();
    config.providers.first = first;
    config.providers.second = second;
    config.routes.default = {
      candidates: [
        { providerId: "first", modelId: "first-model" },
        { providerId: "second", modelId: "second-model" },
      ],
    };

    const response = await handleProxyRequest(
      config,
      new Request("http://127.0.0.1:17890/v1/models"),
      async () => {
        throw new Error("models endpoint should not call upstream");
      },
    );
    const body = await response.json() as { object: string; data: { id: string; object: string; owned_by: string }[] };

    expect(response.status).toBe(200);
    expect(body).toEqual({
      object: "list",
      data: [
        { id: "first/first-model", object: "model", owned_by: "first" },
        { id: "second/second-model", object: "model", owned_by: "second" },
      ],
    });
  });

  test("returns all provider models when no route is configured", async () => {
    const config = createDefaultConfig();
    config.providers.first = {
      ...first,
      models: [{ id: "first-a" }, { id: "first-b" }],
    };
    config.providers.second = second;

    const response = await handleProxyRequest(config, new Request("http://127.0.0.1:17890/v1/models"));
    const body = await response.json() as { data: { id: string }[] };

    expect(body.data.map((model) => model.id)).toEqual(["first/first-a", "first/first-b", "second/second-model"]);
  });

  test("routes to provider/model selected by OpenAI-compatible request body", async () => {
    const config = createDefaultConfig();
    config.providers.first = first;
    config.providers.second = second;
    config.routes.default = {
      candidates: [
        { providerId: "first", modelId: "first-model" },
        { providerId: "second", modelId: "second-model" },
      ],
    };

    const urls: string[] = [];
    const models: string[] = [];
    const response = await handleProxyRequest(
      config,
      new Request("http://127.0.0.1:17890/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "second/second-model", messages: [] }),
      }),
      async (url, init) => {
        urls.push(String(url));
        models.push(JSON.parse(String(init.body)).model);
        return new Response("ok");
      },
    );

    expect(await response.text()).toBe("ok");
    expect(urls).toEqual(["https://second.example.com/v1/chat/completions"]);
    expect(models).toEqual(["second-model"]);
  });

  test("uses route candidates for real failover and rewrites model per attempt", async () => {
    const config = createDefaultConfig();
    config.providers.first = first;
    config.providers.second = second;
    config.routes.default = {
      candidates: [
        { providerId: "first", modelId: "first-model" },
        { providerId: "second", modelId: "second-model" },
      ],
    };
    config.proxy.retry.maxAttempts = 1;

    const urls: string[] = [];
    const models: string[] = [];
    const response = await handleProxyRequest(
      config,
      new Request("http://127.0.0.1:17890/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "client-model", messages: [] }),
      }),
      async (url, init) => {
        urls.push(String(url));
        models.push(JSON.parse(String(init.body)).model);
        return urls.length === 1 ? new Response("bad", { status: 500 }) : new Response("ok");
      },
    );

    expect(await response.text()).toBe("ok");
    expect(urls).toEqual([
      "https://first.example.com/v1/chat/completions",
      "https://second.example.com/v1/chat/completions",
    ]);
    expect(models).toEqual(["first-model", "second-model"]);
  });
});
