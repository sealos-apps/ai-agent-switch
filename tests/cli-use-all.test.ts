import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const cliPath = join(import.meta.dir, "..", "src", "cli", "main.ts");

describe("CLI use-all", () => {
  test("use-all --dry-run --json returns batch plan", async () => {
    const home = await mkdtemp(join(tmpdir(), "agent-switch-cli-use-all-"));
    try {
      await run(home, "provider", "add", "--id", "openrouter", "--name", "OpenRouter", "--type", "openai-compatible", "--base-url", "https://openrouter.ai/api/v1", "--model", "qwen/qwen3-coder");
      await run(home, "client", "disable", "openclaw");
      const output = await run(home, "use-all", "openrouter/qwen/qwen3-coder", "--dry-run", "--json");
      const parsed = JSON.parse(output) as { applied: boolean; results: { clientId: string; status: string }[] };

      expect(parsed.applied).toBe(false);
      expect(parsed.results.some((item) => item.clientId === "qwen" && item.status === "planned")).toBe(true);
      expect(parsed.results.some((item) => item.clientId === "openclaw" && item.status === "skipped")).toBe(true);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("use-all -y applies enabled client configs", async () => {
    const home = await mkdtemp(join(tmpdir(), "agent-switch-cli-use-all-apply-"));
    try {
      await run(home, "provider", "add", "--id", "openrouter", "--name", "OpenRouter", "--type", "openai-compatible", "--base-url", "https://openrouter.ai/api/v1", "--model", "qwen/qwen3-coder");
      await run(home, "client", "disable", "openclaw");
      await run(home, "use-all", "openrouter/qwen/qwen3-coder", "-y");

      const qwen = JSON.parse(await readFile(join(home, ".qwen/settings.json"), "utf8"));
      expect(qwen.model.name).toBe("qwen/qwen3-coder");
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
