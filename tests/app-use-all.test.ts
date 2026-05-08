import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AgentSwitchApp } from "../src/core/app";

describe("AgentSwitchApp.useAllClients", () => {
  test("dry-run creates plans for enabled clients without writing configs", async () => {
    const home = await mkdtemp(join(tmpdir(), "agent-switch-use-all-dry-"));
    try {
      const app = await createApp(home);
      await app.setClientEnabled("openclaw", false);

      const result = await app.useAllClients({
        target: "openrouter/qwen/qwen3-coder",
        yes: false,
      });

      expect(result.applied).toBe(false);
      expect(result.results.some((item) => item.clientId === "qwen" && item.status === "planned")).toBe(true);
      expect(result.results.some((item) => item.clientId === "openclaw" && item.status === "skipped")).toBe(true);
      expect(existsSync(join(home, ".qwen/settings.json"))).toBe(false);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("-y applies plans for all enabled clients", async () => {
    const home = await mkdtemp(join(tmpdir(), "agent-switch-use-all-apply-"));
    try {
      const app = await createApp(home);
      await app.setClientEnabled("openclaw", false);

      const result = await app.useAllClients({
        target: "openrouter/qwen/qwen3-coder",
        yes: true,
      });

      expect(result.applied).toBe(true);
      expect(result.results.some((item) => item.clientId === "qwen" && item.status === "applied")).toBe(true);
      expect(result.results.some((item) => item.clientId === "openclaw" && item.status === "skipped")).toBe(true);
      const qwen = JSON.parse(await readFile(join(home, ".qwen/settings.json"), "utf8"));
      const codex = await readFile(join(home, ".codex/config.toml"), "utf8");
      expect(qwen.model.name).toBe("qwen/qwen3-coder");
      expect(codex).toContain('model = "qwen/qwen3-coder"');
      expect(existsSync(join(home, ".openclaw/openclaw.json"))).toBe(false);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});

async function createApp(home: string): Promise<AgentSwitchApp> {
  const app = new AgentSwitchApp({ homeDir: home, cwd: home });
  await app.addProvider({
    id: "openrouter",
    name: "OpenRouter",
    type: "openai-compatible",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKeyEnv: "OPENROUTER_API_KEY",
    models: [{ id: "qwen/qwen3-coder" }],
  });
  return app;
}
