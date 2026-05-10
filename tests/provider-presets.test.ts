import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AgentSwitchApp } from "../src/core/app";
import { getProviderPreset, listProviderPresets } from "../src/providers/presets";

describe("provider presets", () => {
  test("lists common provider presets", () => {
    const ids = listProviderPresets().map((preset) => preset.id);
    expect(ids).toContain("openrouter");
    expect(ids).toContain("deepseek");
    expect(ids).toContain("ollama");
    expect(ids).toContain("lmstudio");
    expect(ids).toContain("agent-switch-proxy");
  });

  test("converts preset into provider profile with env key override", () => {
    const preset = getProviderPreset("openrouter");
    expect(preset?.toProvider({ apiKeyEnv: "OPENROUTER_API_KEY" })).toMatchObject({
      id: "openrouter",
      type: "openai-chat-compatible",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKeyEnv: "OPENROUTER_API_KEY",
    });
  });

  test("converts agent-switch-proxy preset into local OpenAI-compatible provider without api key", () => {
    const preset = getProviderPreset("agent-switch-proxy");
    expect(preset?.toProvider()).toMatchObject({
      id: "agent-switch-proxy",
      name: "agent-switch Proxy",
      type: "openai-chat-compatible",
      baseUrl: "http://127.0.0.1:17890/v1",
      models: [{ id: "agent-switch/default" }],
      defaultModel: "agent-switch/default",
    });
    expect(preset?.toProvider().apiKeyEnv).toBeUndefined();
  });

  test("adds a preset provider through app API", async () => {
    const home = await mkdtemp(join(tmpdir(), "agent-switch-preset-"));
    try {
      const app = new AgentSwitchApp({ homeDir: home, cwd: home });
      const provider = await app.addProviderPreset("deepseek", { apiKeyEnv: "DEEPSEEK_API_KEY" });

      expect(provider.id).toBe("deepseek");
      expect(provider.baseUrl).toBe("https://api.deepseek.com/v1");
      expect(provider.models.some((model) => model.id === "deepseek-chat")).toBe(true);
      expect((await app.listProviders(false))[0]?.apiKeyEnv).toBe("DEEPSEEK_API_KEY");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
