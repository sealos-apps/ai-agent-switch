import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AgentSwitchApp } from "../src/core/app";

describe("provider model management", () => {
  test("adds and removes models from an existing provider", async () => {
    const home = await mkdtemp(join(tmpdir(), "agent-switch-provider-models-"));
    try {
      const app = new AgentSwitchApp({ homeDir: home, cwd: home });
      await app.addProvider({
        id: "openrouter",
        name: "OpenRouter",
        type: "openai-compatible",
        baseUrl: "https://openrouter.ai/api/v1",
        models: [{ id: "qwen/qwen3-coder" }],
      });

      await app.addProviderModel("openrouter", "anthropic/claude-sonnet-4.5");
      await app.removeProviderModel("openrouter", "qwen/qwen3-coder");

      const provider = (await app.listProviders(false)).find((item) => item.id === "openrouter")!;
      expect(provider.models.map((model) => model.id)).toEqual(["anthropic/claude-sonnet-4.5"]);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("sets provider default model only when model exists", async () => {
    const home = await mkdtemp(join(tmpdir(), "agent-switch-provider-default-model-"));
    try {
      const app = new AgentSwitchApp({ homeDir: home, cwd: home });
      await app.addProvider({
        id: "openrouter",
        name: "OpenRouter",
        type: "openai-compatible",
        baseUrl: "https://openrouter.ai/api/v1",
        models: [{ id: "a" }, { id: "b" }],
      });

      const provider = await app.setProviderDefaultModel("openrouter", "b");

      expect(provider.defaultModel).toBe("b");
      expect(app.setProviderDefaultModel("openrouter", "missing")).rejects.toThrow("Model not found");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("removing a provider model removes matching route candidates", async () => {
    const home = await mkdtemp(join(tmpdir(), "agent-switch-provider-model-route-clean-"));
    try {
      const app = new AgentSwitchApp({ homeDir: home, cwd: home });
      await app.addProvider({
        id: "openrouter",
        name: "OpenRouter",
        type: "openai-compatible",
        baseUrl: "https://openrouter.ai/api/v1",
        models: [{ id: "a" }, { id: "b" }],
      });
      await app.setDefaultRoute("openrouter/a");
      await app.addRouteFallback("openrouter/b");

      await app.removeProviderModel("openrouter", "a");

      const config = await app.loadConfig();
      expect(config.routes.default?.candidates).toEqual([{ providerId: "openrouter", modelId: "b" }]);
      expect((await app.validateConfig()).ok).toBe(true);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("removing a provider removes matching route candidates", async () => {
    const home = await mkdtemp(join(tmpdir(), "agent-switch-provider-route-clean-"));
    try {
      const app = new AgentSwitchApp({ homeDir: home, cwd: home });
      await app.addProvider({
        id: "first",
        name: "First",
        type: "openai-compatible",
        baseUrl: "https://first.example.com/v1",
        models: [{ id: "a" }],
      });
      await app.addProvider({
        id: "second",
        name: "Second",
        type: "openai-compatible",
        baseUrl: "https://second.example.com/v1",
        models: [{ id: "b" }],
      });
      await app.setDefaultRoute("first/a");
      await app.addRouteFallback("second/b");

      await app.removeProvider("first");

      const config = await app.loadConfig();
      expect(config.routes.default?.candidates).toEqual([{ providerId: "second", modelId: "b" }]);
      expect((await app.validateConfig()).ok).toBe(true);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
