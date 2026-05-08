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

describe("extended client adapters", () => {
  test("gemini adapter patches model provider settings", async () => {
    const home = await mkdtemp(join(tmpdir(), "agent-switch-gemini-"));
    try {
      await mkdir(join(home, ".gemini"), { recursive: true });
      await writeFile(join(home, ".gemini/settings.json"), JSON.stringify({ keep: true }, null, 2));
      const gemini = createClientAdapters({ homeDir: home, cwd: home }).get("gemini")!;

      const plan = await gemini.planApply({ provider, modelId: "qwen/qwen3-coder" });
      await gemini.apply(plan);

      const parsed = JSON.parse(await readFile(join(home, ".gemini/settings.json"), "utf8"));
      expect(parsed.keep).toBe(true);
      expect(parsed.model.name).toBe("qwen/qwen3-coder");
      expect(parsed.auth.selectedType).toBe("openrouter");
      expect(parsed.modelProviders.openrouter.envKey).toBe("OPENROUTER_API_KEY");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("openclaw adapter preserves provider/model/runtime separation", async () => {
    const home = await mkdtemp(join(tmpdir(), "agent-switch-openclaw-"));
    try {
      await mkdir(join(home, ".openclaw"), { recursive: true });
      await writeFile(join(home, ".openclaw/openclaw.json"), `{"agents":{"defaults":{"agentRuntime":{"id":"codex"}}}}`);
      const openclaw = createClientAdapters({ homeDir: home, cwd: home }).get("openclaw")!;

      await openclaw.apply(await openclaw.planApply({ provider, modelId: "qwen/qwen3-coder" }));

      const parsed = JSON.parse(await readFile(join(home, ".openclaw/openclaw.json"), "utf8"));
      expect(parsed.agents.defaults.agentRuntime.id).toBe("codex");
      expect(parsed.agents.defaults.model.primary).toBe("openrouter/qwen/qwen3-coder");
      expect(parsed.models.providers.openrouter.apiKey).toBe("$OPENROUTER_API_KEY");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("crush adapter patches large model without touching sessions", async () => {
    const home = await mkdtemp(join(tmpdir(), "agent-switch-crush-"));
    try {
      await mkdir(join(home, ".config/crush"), { recursive: true });
      await writeFile(join(home, ".config/crush/crush.json"), JSON.stringify({ session_dir: "keep" }, null, 2));
      const crush = createClientAdapters({ homeDir: home, cwd: home }).get("crush")!;

      await crush.apply(await crush.planApply({ provider, modelId: "qwen/qwen3-coder" }));

      const parsed = JSON.parse(await readFile(join(home, ".config/crush/crush.json"), "utf8"));
      expect(parsed.session_dir).toBe("keep");
      expect(parsed.models.large).toEqual({ provider: "openrouter", model: "qwen/qwen3-coder" });
      expect(parsed.providers.openrouter.type).toBe("openai-compat");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("opencode adapter patches coder agent provider/model", async () => {
    const home = await mkdtemp(join(tmpdir(), "agent-switch-opencode-"));
    try {
      await writeFile(join(home, ".opencode.json"), JSON.stringify({ keep: true }, null, 2));
      const opencode = createClientAdapters({ homeDir: home, cwd: home }).get("opencode")!;

      await opencode.apply(await opencode.planApply({ provider, modelId: "qwen/qwen3-coder" }));

      const parsed = JSON.parse(await readFile(join(home, ".opencode.json"), "utf8"));
      expect(parsed.keep).toBe(true);
      expect(parsed.agents.coder.provider).toBe("openrouter");
      expect(parsed.agents.coder.model).toBe("qwen/qwen3-coder");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("claude-code adapter writes only agentSwitch namespace", async () => {
    const home = await mkdtemp(join(tmpdir(), "agent-switch-claude-"));
    try {
      await mkdir(join(home, ".claude"), { recursive: true });
      await writeFile(join(home, ".claude/settings.json"), JSON.stringify({ existing: true }, null, 2));
      const claude = createClientAdapters({ homeDir: home, cwd: home }).get("claude-code")!;

      await claude.apply(await claude.planApply({ provider, modelId: "qwen/qwen3-coder" }));

      const parsed = JSON.parse(await readFile(join(home, ".claude/settings.json"), "utf8"));
      expect(parsed.existing).toBe(true);
      expect(parsed.agentSwitch.provider).toBe("openrouter");
      expect(parsed.agentSwitch.model).toBe("qwen/qwen3-coder");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
