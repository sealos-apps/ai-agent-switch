import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const cliPath = join(import.meta.dir, "..", "src", "cli", "main.ts");

describe("CLI automation output", () => {
  test("use --dry-run prints JSON patch plan and does not write client config", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-dry-run-"));
    try {
      await run(home, "provider", "add", "--id", "openrouter", "--name", "OpenRouter", "--type", "openai-compatible", "--base-url", "https://openrouter.ai/api/v1", "--model", "qwen/qwen3-coder");
      const output = await run(home, "use", "qwen", "openrouter/qwen/qwen3-coder", "--dry-run", "--json");
      const parsed = JSON.parse(output) as { applied: boolean; plan: { files: { path: string }[] } };

      expect(parsed.applied).toBe(false);
      expect(parsed.plan.files[0]?.path).toContain(".qwen/settings.json");
      expect(existsSync(join(home, ".qwen/settings.json"))).toBe(false);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("doctor, provider, client, and route commands support JSON output", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-json-commands-"));
    try {
      await run(home, "provider", "add", "--id", "openrouter", "--name", "OpenRouter", "--type", "openai-compatible", "--base-url", "https://openrouter.ai/api/v1", "--model", "a", "--model", "b");
      await run(home, "route", "set-default", "openrouter/a");

      const doctor = JSON.parse(await run(home, "doctor", "--json")) as { checks: unknown[] };
      const providers = JSON.parse(await run(home, "provider", "list", "--json")) as unknown[];
      const clients = JSON.parse(await run(home, "client", "list", "--json")) as unknown[];
      const route = JSON.parse(await run(home, "route", "list", "--json")) as { candidates: unknown[] };
      const proxy = JSON.parse(await run(home, "proxy", "status", "--json")) as { running: boolean; proxy: { port: number } };

      expect(doctor.checks.length).toBeGreaterThan(0);
      expect(providers).toHaveLength(1);
      expect(clients.length).toBeGreaterThan(1);
      expect(route.candidates).toHaveLength(1);
      expect(proxy.running).toBe(false);
      expect(proxy.proxy.port).toBe(17890);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("config schema prints a JSON schema-like document", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-schema-"));
    try {
      const output = await run(home, "config", "schema");
      const parsed = JSON.parse(output) as { title: string; properties: Record<string, unknown> };
      expect(parsed.title).toBe("AI Agent Switch config");
      expect(parsed.properties.providers).toBeDefined();
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("config validate --json returns semantic validation result", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-validate-json-"));
    try {
      const output = await run(home, "config", "validate", "--json");
      const parsed = JSON.parse(output) as { ok: boolean; issues: string[] };
      expect(parsed.ok).toBe(true);
      expect(parsed.issues).toEqual([]);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("completion zsh includes core commands", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-completion-"));
    try {
      const output = await run(home, "completion", "zsh");
      expect(output).toContain("#compdef ai-agent-switch as");
      expect(output).toContain("provider");
      expect(output).toContain("model");
      expect(output).toContain("route");
      expect(output).toContain("\"switch:switch\"");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("provider help documents init model api mode format", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-provider-help-"));
    try {
      const output = await run(home, "provider", "--help");
      expect(output).toContain("modelId:apiMode");
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
