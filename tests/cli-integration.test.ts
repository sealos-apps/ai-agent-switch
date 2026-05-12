import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const cliPath = join(import.meta.dir, "..", "src", "cli", "main.ts");

describe("CLI integration", () => {
  test("provider model add/remove work through CLI without client switch config", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-cli-"));
    try {
      await run(home, "provider", "add", "--id", "openrouter", "--name", "OpenRouter", "--type", "openai-compatible", "--base-url", "https://openrouter.ai/api/v1", "--model", "a");
      await run(home, "provider", "model-add", "openrouter", "b");
      await run(home, "provider", "model-remove", "openrouter", "a");

      const config = JSON.parse(stripJsonc(await readFile(join(home, ".ai-agent-switch/config.jsonc"), "utf8")));
      expect(config.providers.openrouter.models.map((model: { id: string }) => model.id)).toEqual(["b"]);
      expect(config.clients).toEqual({});
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("provider default model can be configured through CLI", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-cli-default-model-"));
    try {
      await run(home, "provider", "add", "--id", "openrouter", "--name", "OpenRouter", "--type", "openai-compatible", "--base-url", "https://openrouter.ai/api/v1", "--model", "a", "--model", "b", "--default-model", "a");
      await run(home, "provider", "default-model", "openrouter", "b");

      const config = JSON.parse(stripJsonc(await readFile(join(home, ".ai-agent-switch/config.jsonc"), "utf8")));
      expect(config.providers.openrouter.defaultModel).toBe("b");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("route commands configure default proxy fallback chain", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-cli-route-"));
    try {
      await run(home, "provider", "add", "--id", "openrouter", "--name", "OpenRouter", "--type", "openai-compatible", "--base-url", "https://openrouter.ai/api/v1", "--model", "a");
      await run(home, "provider", "model-add", "openrouter", "b");
      await run(home, "route", "set-default", "openrouter/a");
      await run(home, "route", "add-fallback", "openrouter/b");
      const output = await run(home, "route", "list");

      expect(output).toContain("primary openrouter/a");
      expect(output).toContain("fallback 1 openrouter/b");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("client use-proxy configures one client for the local ai-agent-switch proxy", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-cli-client-proxy-"));
    try {
      const preview = await run(home, "client", "use-proxy", "qwen", "--dry-run", "--json");
      const planned = JSON.parse(preview) as { applied: boolean; requiresConfirmation: boolean; plan: { summary: string } };
      expect(planned.applied).toBe(false);
      expect(planned.requiresConfirmation).toBe(true);
      expect(planned.plan.summary).toContain("ai-agent-switch-proxy/ai-agent-switch/default");

      await run(home, "client", "use-proxy", "qwen", "-y");

      const settings = JSON.parse(await readFile(join(home, ".qwen/settings.json"), "utf8"));
      expect(settings.security.auth.selectedType).toBe("ai-agent-switch-proxy");
      expect(settings.model.name).toBe("ai-agent-switch/default");
      expect(settings.modelProviders["ai-agent-switch-proxy"].baseUrl).toBe("http://127.0.0.1:17890/v1");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});

async function run(home: string, ...args: string[]): Promise<string> {
  const proc = Bun.spawn(["bun", cliPath, ...args], {
    env: { ...process.env, HOME: home, AI_AGENT_SWITCH_HOME: join(home, ".ai-agent-switch"), NO_COLOR: "1" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (exitCode !== 0) throw new Error(`Command failed: ${args.join(" ")}\n${stderr}`);
  return stdout;
}

function stripJsonc(text: string): string {
  return text.replace(/^\s*\/\/.*$/gm, "");
}
