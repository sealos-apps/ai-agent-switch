import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createClientAdapters } from "../src/clients";
import type { ProviderProfile } from "../src/config/schema";

const provider: ProviderProfile = {
  id: "openrouter",
  name: "OpenRouter",
  type: "openai-compatible",
  baseUrl: "https://openrouter.ai/api/v1",
  apiKeyEnv: "OPENROUTER_API_KEY",
  models: [{ id: "qwen/qwen3-coder" }],
};

describe("client adapters", () => {
  test("qwen adapter patches settings.json without dropping unknown fields", async () => {
    const home = await mkdtemp(join(tmpdir(), "agent-switch-qwen-"));
    try {
      await mkdir(join(home, ".qwen"), { recursive: true });
      await writeFile(join(home, ".qwen/settings.json"), JSON.stringify({ keep: true }, null, 2));

      const adapters = createClientAdapters({ homeDir: home, cwd: home });
      const qwen = adapters.get("qwen");
      expect(qwen).toBeDefined();

      const plan = await qwen!.planApply({ provider, modelId: "qwen/qwen3-coder" });
      await qwen!.apply(plan);

      const text = await readFile(join(home, ".qwen/settings.json"), "utf8");
      const parsed = JSON.parse(text);
      expect(parsed.keep).toBe(true);
      expect(parsed.model.name).toBe("qwen/qwen3-coder");
      expect(parsed.security.auth.selectedType).toBe("openrouter");
      expect(parsed.modelProviders.openrouter.baseUrl).toBe("https://openrouter.ai/api/v1");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("codex adapter patches TOML provider and current model", async () => {
    const home = await mkdtemp(join(tmpdir(), "agent-switch-codex-"));
    try {
      await mkdir(join(home, ".codex"), { recursive: true });
      await writeFile(join(home, ".codex/config.toml"), `approval_policy = "never"\n`);

      const adapters = createClientAdapters({ homeDir: home, cwd: home });
      const codex = adapters.get("codex");
      const plan = await codex!.planApply({ provider, modelId: "qwen/qwen3-coder" });
      await codex!.apply(plan);

      const text = await readFile(join(home, ".codex/config.toml"), "utf8");
      expect(text).toContain('model = "qwen/qwen3-coder"');
      expect(text).toContain('model_provider = "openrouter"');
      expect(text).toContain("[model_providers.openrouter]");
      expect(text).toContain('env_key = "OPENROUTER_API_KEY"');
      expect(text).toContain('approval_policy = "never"');
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("hermes adapter writes config.yaml and .env separation", async () => {
    const home = await mkdtemp(join(tmpdir(), "agent-switch-hermes-"));
    try {
      await mkdir(join(home, ".hermes"), { recursive: true });
      await writeFile(join(home, ".hermes/config.yaml"), "theme: dark\n");

      const adapters = createClientAdapters({ homeDir: home, cwd: home });
      const hermes = adapters.get("hermes");
      const plan = await hermes!.planApply({ provider, modelId: "qwen/qwen3-coder" });
      await hermes!.apply(plan);

      const text = await readFile(join(home, ".hermes/config.yaml"), "utf8");
      expect(text).toContain("theme: dark");
      expect(text).toContain("current_provider: openrouter");
      expect(text).toContain("current_model: qwen/qwen3-coder");
      expect(text).toContain("base_url: https://openrouter.ai/api/v1");
      expect(text).toContain("api_key_env: OPENROUTER_API_KEY");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
