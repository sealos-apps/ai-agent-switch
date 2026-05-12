import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const cliPath = join(import.meta.dir, "..", "src", "cli", "main.ts");

describe("CLI provider presets", () => {
  test("provider preset-list --json returns presets", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-cli-presets-"));
    try {
      const output = await run(home, "provider", "preset-list", "--json");
      const presets = JSON.parse(output) as { id: string }[];
      expect(presets.some((preset) => preset.id === "openrouter")).toBe(true);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("provider preset-add creates provider config", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-cli-preset-add-"));
    try {
      await run(home, "provider", "preset-add", "openrouter", "--api-key-env", "OPENROUTER_API_KEY");
      const output = await run(home, "provider", "show", "openrouter", "--json");
      const provider = JSON.parse(output) as { id: string; baseUrl: string; models: { id: string }[] };

      expect(provider.id).toBe("openrouter");
      expect(provider.baseUrl).toBe("https://openrouter.ai/api/v1");
      expect(provider.models.length).toBeGreaterThan(0);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("provider preset-add creates local ai-agent-switch proxy provider", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-cli-proxy-preset-add-"));
    try {
      await run(home, "provider", "preset-add", "ai-agent-switch-proxy");
      const output = await run(home, "provider", "show", "ai-agent-switch-proxy", "--json");
      const provider = JSON.parse(output) as { id: string; baseUrl: string; defaultModel: string; apiKeyEnv?: string };

      expect(provider.id).toBe("ai-agent-switch-proxy");
      expect(provider.baseUrl).toBe("http://127.0.0.1:17890/v1");
      expect(provider.defaultModel).toBe("ai-agent-switch/default");
      expect(provider.apiKeyEnv).toBeUndefined();
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});

async function run(home: string, ...args: string[]): Promise<string> {
  const proc = Bun.spawn(["bun", cliPath, ...args], {
    env: { ...process.env, HOME: home, AI_AGENT_SWITCH_HOME: join(home, ".ai-agent-switch") },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (exitCode !== 0) throw new Error(`Command failed: ${args.join(" ")}\n${stderr}`);
  return stdout;
}
