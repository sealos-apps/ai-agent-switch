import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const cliPath = join(import.meta.dir, "..", "src", "cli", "main.ts");

describe("CLI model list", () => {
  test("model list --json returns flat provider/model refs with route metadata", async () => {
    const home = await mkdtemp(join(tmpdir(), "agent-switch-model-list-"));
    try {
      await run(
        home,
        "provider",
        "add",
        "--id",
        "openrouter",
        "--name",
        "OpenRouter",
        "--type",
        "openai-compatible",
        "--base-url",
        "https://openrouter.ai/api/v1",
        "--model",
        "qwen/qwen3-coder",
        "--model",
        "anthropic/claude-sonnet-4.5",
      );
      await run(home, "route", "set-default", "openrouter/qwen/qwen3-coder");

      const output = await run(home, "model", "list", "--json");
      const models = JSON.parse(output) as {
        providerId: string;
        providerName: string;
        providerType: string;
        modelId: string;
        ref: string;
        isProviderDefault: boolean;
        routeIndex?: number;
      }[];

      expect(models).toEqual([
        {
          providerId: "openrouter",
          providerName: "OpenRouter",
          providerType: "openai-compatible",
          modelId: "qwen/qwen3-coder",
          ref: "openrouter/qwen/qwen3-coder",
          isProviderDefault: false,
          routeIndex: 0,
        },
        {
          providerId: "openrouter",
          providerName: "OpenRouter",
          providerType: "openai-compatible",
          modelId: "anthropic/claude-sonnet-4.5",
          ref: "openrouter/anthropic/claude-sonnet-4.5",
          isProviderDefault: false,
        },
      ]);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("model list prints refs for humans", async () => {
    const home = await mkdtemp(join(tmpdir(), "agent-switch-model-list-human-"));
    try {
      await run(home, "provider", "preset-add", "openrouter", "--api-key-env", "OPENROUTER_API_KEY");

      const output = await run(home, "model", "list");

      expect(output).toContain("openrouter/qwen/qwen3-coder");
      expect(output).toContain("OpenRouter");
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
