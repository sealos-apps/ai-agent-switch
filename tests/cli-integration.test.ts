import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const cliPath = join(import.meta.dir, "..", "src", "cli", "main.ts");

describe("CLI integration", () => {
  test("provider model add/remove and client disable/enable work through CLI", async () => {
    const home = await mkdtemp(join(tmpdir(), "agent-switch-cli-"));
    try {
      await run(home, "provider", "add", "--id", "openrouter", "--name", "OpenRouter", "--type", "openai-compatible", "--base-url", "https://openrouter.ai/api/v1", "--model", "a");
      await run(home, "provider", "model-add", "openrouter", "b");
      await run(home, "provider", "model-remove", "openrouter", "a");
      await run(home, "client", "disable", "qwen");
      await run(home, "client", "enable", "qwen");

      const config = JSON.parse(stripJsonc(await readFile(join(home, ".agent-switch/config.jsonc"), "utf8")));
      expect(config.providers.openrouter.models.map((model: { id: string }) => model.id)).toEqual(["b"]);
      expect(config.clients.qwen.enabled).toBe(true);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("provider default model can be configured through CLI", async () => {
    const home = await mkdtemp(join(tmpdir(), "agent-switch-cli-default-model-"));
    try {
      await run(home, "provider", "add", "--id", "openrouter", "--name", "OpenRouter", "--type", "openai-compatible", "--base-url", "https://openrouter.ai/api/v1", "--model", "a", "--model", "b", "--default-model", "a");
      await run(home, "provider", "default-model", "openrouter", "b");

      const config = JSON.parse(stripJsonc(await readFile(join(home, ".agent-switch/config.jsonc"), "utf8")));
      expect(config.providers.openrouter.defaultModel).toBe("b");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("route commands configure default proxy fallback chain", async () => {
    const home = await mkdtemp(join(tmpdir(), "agent-switch-cli-route-"));
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
});

async function run(home: string, ...args: string[]): Promise<string> {
  const proc = Bun.spawn(["bun", cliPath, ...args], {
    env: { ...process.env, HOME: home, AGENT_SWITCH_HOME: join(home, ".agent-switch") },
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
