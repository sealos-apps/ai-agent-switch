import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parse } from "jsonc-parser";

const cliPath = join(import.meta.dir, "..", "src", "cli", "main.ts");

describe("agent-hub CLI", () => {
  test("init applies and returns JSON state", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-cli-agent-hub-"));
    try {
      const output = await run(
        home,
        "agent-hub",
        "init",
        "--client",
        "hermes",
        "--provider-id",
        "aiproxy",
        "--provider-name",
        "AI Proxy",
        "--model-type",
        "openai-chat-compatible",
        "--base-url",
        "https://aiproxy.hzh.sealos.run/v1",
        "--api-key-env",
        "AIPROXY_API_KEY",
        "--model",
        "glm-4.6",
        "--available-model",
        "glm-4.6",
        "-y",
        "--json",
      );
      const parsed = JSON.parse(output) as { clientId: string; providerId: string; modelType: string; applied: boolean };
      expect(parsed).toMatchObject({
        clientId: "hermes",
        providerId: "aiproxy",
        modelType: "openai-chat-compatible",
        applied: true,
      });
      const config = await readFile(join(home, ".hermes/config.yaml"), "utf8");
      expect(config).toContain("provider: aiproxy");
      expect(config).toContain("default: glm-4.6");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("init stores per-model request formats from available models", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-cli-agent-hub-model-types-"));
    try {
      await run(
        home,
        "agent-hub",
        "init",
        "--client",
        "hermes",
        "--provider-id",
        "aiproxy",
        "--provider-name",
        "AI Proxy",
        "--model-type",
        "openai-responses",
        "--base-url",
        "https://aiproxy.hzh.sealos.run/v1",
        "--api-key-env",
        "AIPROXY_API_KEY",
        "--model",
        "gpt-5.4",
        "--available-model",
        "gpt-5.4:openai-responses",
        "--available-model",
        "glm-4.6:openai-chat-compatible",
        "-y",
        "--json",
      );

      const store = parse(await readFile(join(home, ".ai-agent-switch/config.jsonc"), "utf8"));
      expect(store.providers.aiproxy.type).toBe("openai-chat-compatible");
      expect(store.providers.aiproxy.models).toEqual([
        { id: "gpt-5.4", type: "openai-responses" },
        { id: "glm-4.6", type: "openai-chat-compatible" },
      ]);
      const modelList = JSON.parse(await run(home, "model", "list", "--json")) as { modelId: string; modelType: string }[];
      expect(modelList.map((model) => [model.modelId, model.modelType])).toEqual([
        ["gpt-5.4", "openai-responses"],
        ["glm-4.6", "openai-chat-compatible"],
      ]);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("init dry-run returns JSON without writing config files", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-cli-agent-hub-dry-run-"));
    try {
      const output = await run(
        home,
        "agent-hub",
        "init",
        "--client",
        "hermes",
        "--provider-id",
        "aiproxy",
        "--provider-name",
        "AI Proxy",
        "--model-type",
        "openai-chat-compatible",
        "--base-url",
        "https://aiproxy.hzh.sealos.run/v1",
        "--api-key-env",
        "AIPROXY_API_KEY",
        "--model",
        "glm-4.6",
        "--available-model",
        "glm-4.6",
        "--dry-run",
        "--json",
      );
      const parsed = JSON.parse(output) as { applied: boolean; requiresConfirmation: boolean };
      expect(parsed).toMatchObject({ applied: false, requiresConfirmation: true });
      expect(existsSync(join(home, ".ai-agent-switch/config.jsonc"))).toBe(false);
      expect(existsSync(join(home, ".hermes/config.yaml"))).toBe(false);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("sync reads Agent Hub env and applies client config", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-cli-agent-hub-sync-"));
    try {
      const output = await run(
        home,
        {
          AGENT_MODEL_PROVIDER: "custom:aiproxy-chat",
          AGENT_MODEL_BASEURL: "https://aiproxy.example.test/v1",
          AGENT_MODEL_APIKEY: "sk-test",
          AGENT_MODEL: "glm-5.1",
          AGENT_MODEL_API_MODE: "chat_completions",
        },
        "agent-hub",
        "sync",
        "--client",
        "hermes",
        "--from-env",
        "-y",
        "--json",
      );
      const parsed = JSON.parse(output) as { clientId: string; providerId: string; modelId: string; applied: boolean };
      expect(parsed).toMatchObject({
        clientId: "hermes",
        providerId: "aiproxy-chat",
        modelId: "glm-5.1",
        applied: true,
      });
      const config = await readFile(join(home, ".hermes/config.yaml"), "utf8");
      expect(config).toContain("provider: aiproxy-chat");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});

async function run(home: string, ...args: string[]): Promise<string>;
async function run(home: string, env: Record<string, string>, ...args: string[]): Promise<string>;
async function run(home: string, envOrArg: Record<string, string> | string, ...rest: string[]): Promise<string> {
  const env = typeof envOrArg === "string" ? {} : envOrArg;
  const args = typeof envOrArg === "string" ? [envOrArg, ...rest] : rest;
  const proc = Bun.spawn(["bun", cliPath, ...args], {
    env: { ...process.env, ...env, HOME: home, AI_AGENT_SWITCH_HOME: join(home, ".ai-agent-switch") },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (exitCode !== 0) throw new Error(`Command failed: ${args.join(" ")}\n${stderr}`);
  return stdout;
}
