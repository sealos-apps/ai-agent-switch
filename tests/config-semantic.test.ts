import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ConfigStore } from "../src/config/store";
import { validateConfigSemantics } from "../src/config/semantic";
import { createDefaultConfig } from "../src/config/schema";
import { AiAgentSwitchApp } from "../src/core/app";

describe("semantic config validation", () => {
  test("rejects provider map key that differs from provider.id", () => {
    const config = createDefaultConfig();
    config.providers.openrouter = {
      id: "other",
      name: "Other",
      type: "openai-compatible",
      baseUrl: "https://example.com/v1",
      models: [{ id: "model" }],
    };

    const result = validateConfigSemantics(config);
    expect(result.ok).toBe(false);
    expect(result.issues[0]).toContain("providers.openrouter.id");
  });

  test("rejects defaultModel and route candidates that do not exist", () => {
    const config = createDefaultConfig();
    config.providers.openrouter = {
      id: "openrouter",
      name: "OpenRouter",
      type: "openai-compatible",
      baseUrl: "https://openrouter.ai/api/v1",
      defaultModel: "missing",
      models: [{ id: "qwen/qwen3-coder" }],
    };
    config.routes.default = {
      candidates: [{ providerId: "openrouter", modelId: "missing" }],
    };

    const result = validateConfigSemantics(config);
    expect(result.ok).toBe(false);
    expect(result.issues).toContain("providers.openrouter.defaultModel does not exist in provider models: missing");
    expect(result.issues).toContain("routes.default.candidates[0] model not found for provider openrouter: missing");
  });

  test("ConfigStore.validate includes semantic issues", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-semantic-store-"));
    try {
      const store = new ConfigStore({ homeDir: home });
      await store.ensure();
      const config = createDefaultConfig();
      config.providers.openrouter = {
        id: "openrouter",
        name: "OpenRouter",
        type: "openai-compatible",
        baseUrl: "https://openrouter.ai/api/v1",
        defaultModel: "missing",
        models: [{ id: "qwen/qwen3-coder" }],
      };
      await writeFile(store.configPath, JSON.stringify(config, null, 2));

      const result = await store.validate();
      expect(result.ok).toBe(false);
      expect(result.issues[0]).toContain("defaultModel");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("doctor reports semantic config failure", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-semantic-doctor-"));
    try {
      const app = new AiAgentSwitchApp({ homeDir: home, cwd: home });
      await app.store.ensure();
      const config = createDefaultConfig();
      config.routes.default = {
        candidates: [{ providerId: "missing", modelId: "model" }],
      };
      await writeFile(app.store.configPath, JSON.stringify(config, null, 2));

      const report = await app.doctor();
      expect(report.ok).toBe(false);
      expect(report.checks[0]?.detail).toContain("provider not found");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
