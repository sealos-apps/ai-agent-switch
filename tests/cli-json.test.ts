import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const cliPath = join(import.meta.dir, "..", "src", "cli", "main.ts");

describe("CLI JSON output", () => {
  test("status --json returns parseable status", async () => {
    const home = await mkdtemp(join(tmpdir(), "agent-switch-json-"));
    try {
      const output = await run(home, "status", "--json");
      const parsed = JSON.parse(output) as { configPath: string; providers: unknown[] };
      expect(parsed.configPath).toContain(".agent-switch/config.jsonc");
      expect(parsed.providers).toEqual([]);
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
