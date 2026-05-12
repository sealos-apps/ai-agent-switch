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
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-qwen-"));
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
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-codex-"));
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
      expect(text).toContain('wire_api = "responses"');
      expect(text).toContain('approval_policy = "never"');
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("codex adapter writes responses wire api for explicit OpenAI Responses providers", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-codex-openai-"));
    try {
      await mkdir(join(home, ".codex"), { recursive: true });
      const codex = createClientAdapters({ homeDir: home, cwd: home }).get("codex")!;
      const openaiResponses: ProviderProfile = {
        id: "openai",
        name: "OpenAI",
        type: "openai-responses",
        baseUrl: "https://api.openai.com/v1",
        apiKeyEnv: "OPENAI_API_KEY",
        models: [{ id: "gpt-5.1" }],
      };

      await codex.apply(await codex.planApply({ provider: openaiResponses, modelId: "gpt-5.1" }));

      const text = await readFile(join(home, ".codex/config.toml"), "utf8");
      expect(text).toContain('model_provider = "openai"');
      expect(text).toContain('wire_api = "responses"');
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("hermes adapter writes config.yaml and .env separation", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-hermes-"));
    try {
      await mkdir(join(home, ".hermes"), { recursive: true });
      await writeFile(join(home, ".hermes/config.yaml"), "theme: dark\n");

      const adapters = createClientAdapters({ homeDir: home, cwd: home });
      const hermes = adapters.get("hermes");
      const plan = await hermes!.planApply({ provider, modelId: "qwen/qwen3-coder" });
      await hermes!.apply(plan);

      const text = await readFile(join(home, ".hermes/config.yaml"), "utf8");
      expect(text).toContain("theme: dark");
      expect(text).toContain("provider: openrouter");
      expect(text).toContain("default: qwen/qwen3-coder");
      expect(text).toContain("base_url: https://openrouter.ai/api/v1");
      expect(text).toContain("key_env: OPENROUTER_API_KEY");
      expect(text).toContain("transport: openai_chat");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("hermes adapter strips /v1 from anthropic base URL", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-hermes-anthropic-"));
    try {
      const adapters = createClientAdapters({ homeDir: home, cwd: home });
      const hermes = adapters.get("hermes")!;
      await hermes.apply(await hermes.planApply({
        provider: {
          ...provider,
          id: "aiproxy-anthropic",
          name: "Ai Proxy Anthropic",
          type: "anthropic",
          baseUrl: "https://aiproxy.hzh.sealos.run/v1",
          models: [{ id: "deepseek-v4-pro" }],
        },
        modelId: "deepseek-v4-pro",
      }));

      const text = await readFile(join(home, ".hermes/config.yaml"), "utf8");
      expect(text).toContain("provider: aiproxy-anthropic");
      expect(text).toContain("default: deepseek-v4-pro");
      expect(text).toContain("base_url: https://aiproxy.hzh.sealos.run");
      expect(text).toContain("transport: anthropic_messages");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
