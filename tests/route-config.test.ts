import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AgentSwitchApp } from "../src/core/app";

describe("route config", () => {
  test("sets default route and manages fallback candidates", async () => {
    const home = await mkdtemp(join(tmpdir(), "agent-switch-routes-"));
    try {
      const app = new AgentSwitchApp({ homeDir: home, cwd: home });
      await app.addProvider({
        id: "openrouter",
        name: "OpenRouter",
        type: "openai-compatible",
        baseUrl: "https://openrouter.ai/api/v1",
        models: [{ id: "qwen/qwen3-coder" }, { id: "anthropic/claude-sonnet-4.5" }],
      });
      await app.addProvider({
        id: "deepseek",
        name: "DeepSeek",
        type: "openai-compatible",
        baseUrl: "https://api.deepseek.com/v1",
        models: [{ id: "deepseek-chat" }],
      });

      await app.setDefaultRoute("openrouter/qwen/qwen3-coder");
      await app.addRouteFallback("deepseek/deepseek-chat");
      await app.addRouteFallback("openrouter/anthropic/claude-sonnet-4.5");
      await app.removeRouteCandidate("deepseek/deepseek-chat");

      const config = await app.loadConfig();
      expect(config.routes.default?.candidates).toEqual([
        { providerId: "openrouter", modelId: "qwen/qwen3-coder" },
        { providerId: "openrouter", modelId: "anthropic/claude-sonnet-4.5" },
      ]);

      await app.clearDefaultRoute();
      expect((await app.loadConfig()).routes.default?.candidates ?? []).toEqual([]);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("rejects route refs that do not exist in provider registry", async () => {
    const home = await mkdtemp(join(tmpdir(), "agent-switch-routes-invalid-"));
    try {
      const app = new AgentSwitchApp({ homeDir: home, cwd: home });
      expect(app.setDefaultRoute("missing/model")).rejects.toThrow("Provider not found");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
