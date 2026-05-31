import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ProviderProfile } from "../src/config/schema";
import type { ApplyClientSlotsInput, ClientCurrentSlotState, ClientSlotConfig, ClientSlotTarget } from "../src/clients/types";

const cliPath = join(import.meta.dir, "..", "src", "cli", "main.ts");

const provider: ProviderProfile = {
  id: "aiproxy",
  name: "AI Proxy",
  type: "openai-chat-compatible",
  models: [{ id: "glm-5.1" }],
};

describe("client slot targets", () => {
  test("represents named provider/model slots", () => {
    const target: ClientSlotTarget = {
      slot: "main",
      providerId: "aiproxy",
      modelId: "glm-5.1",
    };

    expect(target.slot).toBe("main");
    expect(target.providerId).toBe("aiproxy");
    expect(target.modelId).toBe("glm-5.1");
  });

  test("represents apply slot input with provider profiles", () => {
    const slot: ClientSlotConfig = {
      slot: "main",
      provider,
      modelId: "glm-5.1",
    };
    const input: ApplyClientSlotsInput = {
      slots: [slot],
    };

    expect(input.slots[0]?.slot).toBe("main");
    expect(input.slots[0]?.provider.id).toBe("aiproxy");
    expect(input.slots[0]?.modelId).toBe("glm-5.1");
  });

  test("represents current slot state with config path", () => {
    const current: ClientCurrentSlotState = {
      slot: "main",
      providerId: "aiproxy",
      modelId: "glm-5.1",
      configPath: "/tmp/client-config.json",
    };

    expect(current.slot).toBe("main");
    expect(current.providerId).toBe("aiproxy");
    expect(current.modelId).toBe("glm-5.1");
    expect(current.configPath).toBe("/tmp/client-config.json");
  });
});

describe("client configure CLI", () => {
  test("requires at least one slot", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-client-configure-"));
    try {
      const result = await runExpectingFailure(home, "client", "configure", "cowagent", "--json");

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("Missing --slot");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("plans a single main slot in dry-run json mode", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-client-configure-dry-"));
    try {
      await run(
        home,
        "provider",
        "add",
        "--id",
        "aiproxy",
        "--name",
        "AIProxy",
        "--type",
        "openai-chat-compatible",
        "--base-url",
        "https://aiproxy.usw-1.sealos.io/v1",
        "--model",
        "glm-5.1",
      );

      const output = await run(home, "client", "configure", "cowagent", "--slot", "main=aiproxy/glm-5.1", "--dry-run", "--json");
      const parsed = JSON.parse(output) as { applied: boolean; requiresConfirmation: boolean; plan: { summary: string } };

      expect(parsed.applied).toBe(false);
      expect(parsed.requiresConfirmation).toBe(true);
      expect(parsed.plan.summary).toContain("aiproxy/glm-5.1");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("requires main slot before planning multi-slot clients", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-client-configure-main-"));
    try {
      await run(
        home,
        "provider",
        "add",
        "--id",
        "aiproxy",
        "--name",
        "AIProxy",
        "--type",
        "openai-chat-compatible",
        "--base-url",
        "https://aiproxy.usw-1.sealos.io/v1",
        "--model",
        "glm-4.6v",
      );

      const result = await runExpectingFailure(
        home,
        "client",
        "configure",
        "cowagent",
        "--slot",
        "vision=aiproxy/glm-4.6v",
        "--dry-run",
        "--json",
      );

      expect(result.stderr).toContain("Missing main slot");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("rejects unsafe slot names", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-client-configure-unsafe-"));
    try {
      await run(
        home,
        "provider",
        "add",
        "--id",
        "aiproxy",
        "--name",
        "AIProxy",
        "--type",
        "openai-chat-compatible",
        "--base-url",
        "https://aiproxy.usw-1.sealos.io/v1",
        "--model",
        "glm-5.1",
      );

      for (const slotName of ["__proto__", "main slot"]) {
        const result = await runExpectingFailure(
          home,
          "client",
          "configure",
          "cowagent",
          "--slot",
          `${slotName}=aiproxy/glm-5.1`,
          "--dry-run",
          "--json",
        );

        expect(result.stderr).toContain(`Invalid slot name: ${slotName}`);
      }
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("accepts --client for client show and use-proxy", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-client-option-"));
    try {
      const showOutput = await run(home, "client", "show", "--client", "hermes", "--json");
      const show = JSON.parse(showOutput) as { clientId: string };

      expect(show.clientId).toBe("hermes");

      const proxyOutput = await run(home, "client", "use-proxy", "--client", "hermes", "--dry-run", "--json");
      const proxy = JSON.parse(proxyOutput) as { applied: boolean; plan: { clientId: string } };

      expect(proxy.applied).toBe(false);
      expect(proxy.plan.clientId).toBe("hermes");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("cowagent configure writes multiple slots atomically", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-client-configure-multi-"));
    try {
      await run(
        home,
        "provider",
        "init",
        "--id",
        "aiproxy",
        "--name",
        "AIProxy",
        "--type",
        "openai-chat-compatible",
        "--base-url",
        "https://aiproxy.usw-1.sealos.io/v1",
        "--api-key-env",
        "OPEN_AI_API_KEY",
        "--model",
        "glm-5.1:chat_completions:llm",
        "--model",
        "glm-4.6v:chat_completions:llm",
        "--default-model",
        "glm-5.1",
      );

      const output = await run(
        home,
        "client",
        "configure",
        "cowagent",
        "--slot",
        "main=aiproxy/glm-5.1",
        "--slot",
        "vision=aiproxy/glm-4.6v",
        "--dry-run",
        "--json",
      );
      const parsed = JSON.parse(output) as {
        applied: boolean;
        requiresConfirmation: boolean;
        plan: { files: Array<{ path: string; after: string }> };
      };
      const configPatch = parsed.plan.files.find((file) => file.path.endsWith("config.json"));
      expect(configPatch).toBeDefined();
      const config = JSON.parse(configPatch!.after);

      expect(parsed.applied).toBe(false);
      expect(parsed.requiresConfirmation).toBe(true);
      expect(parsed.plan.files).toHaveLength(1);
      expect(config.ai_agent_switch.slots.main).toEqual({ provider: "aiproxy", model: "glm-5.1" });
      expect(config.ai_agent_switch.slots.vision).toEqual({ provider: "aiproxy", model: "glm-4.6v" });
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("cowagent configure applies multiple slots to config file", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-client-configure-apply-"));
    try {
      await run(
        home,
        "provider",
        "init",
        "--id",
        "aiproxy",
        "--name",
        "AIProxy",
        "--type",
        "openai-chat-compatible",
        "--base-url",
        "https://aiproxy.usw-1.sealos.io/v1",
        "--api-key-env",
        "OPEN_AI_API_KEY",
        "--model",
        "glm-5.1:chat_completions:llm",
        "--model",
        "qwen3.6-plus:chat_completions:llm",
        "--model",
        "qwen-image-2.0-pro:image_generation:image_generation",
        "--model",
        "qwen3-asr-flash:audio_transcriptions:asr",
        "--model",
        "qwen3-tts-flash:audio_speech:tts",
        "--model",
        "text-embedding-v4:embeddings:embedding",
        "--default-model",
        "glm-5.1",
      );

      const output = await run(
        home,
        "client",
        "configure",
        "cowagent",
        "--slot",
        "main=aiproxy/glm-5.1",
        "--slot",
        "vision=aiproxy/qwen3.6-plus",
        "--slot",
        "image=aiproxy/qwen-image-2.0-pro",
        "--slot",
        "asr=aiproxy/qwen3-asr-flash",
        "--slot",
        "tts=aiproxy/qwen3-tts-flash",
        "--slot",
        "embedding=aiproxy/text-embedding-v4",
        "--yes",
        "--json",
      );
      const parsed = JSON.parse(output) as {
        applied: boolean;
        requiresConfirmation: boolean;
        plan: { files: Array<{ path: string; after: string }> };
      };
      const configPath = join(home, "CowAgent", "config.json");
      const config = JSON.parse(await readFile(configPath, "utf8"));

      expect(parsed.applied).toBe(true);
      expect(parsed.requiresConfirmation).toBe(false);
      expect(parsed.plan.files).toHaveLength(1);
      expect(parsed.plan.files[0]?.path).toBe(configPath);
      expect(config.model).toBe("glm-5.1");
      expect(config.bot_type).toBe("openai");
      expect(config.open_ai_api_base).toBe("https://aiproxy.usw-1.sealos.io/v1");
      expect(config.tools.vision).toEqual({ provider: "openai", model: "qwen3.6-plus" });
      expect(config.skills["image-generation"]).toEqual({ provider: "openai", model: "qwen-image-2.0-pro" });
      expect(config.voice_to_text).toBe("openai");
      expect(config.voice_to_text_model).toBe("qwen3-asr-flash");
      expect(config.text_to_voice).toBe("openai");
      expect(config.text_to_voice_model).toBe("qwen3-tts-flash");
      expect(config.embedding_provider).toBe("openai");
      expect(config.embedding_model).toBe("text-embedding-v4");
      expect(config.ai_agent_switch.slots.main).toEqual({ provider: "aiproxy", model: "glm-5.1" });
      expect(config.ai_agent_switch.slots.vision).toEqual({ provider: "aiproxy", model: "qwen3.6-plus" });
      expect(config.ai_agent_switch.slots.image).toEqual({ provider: "aiproxy", model: "qwen-image-2.0-pro" });
      expect(config.ai_agent_switch.slots.asr).toEqual({ provider: "aiproxy", model: "qwen3-asr-flash" });
      expect(config.ai_agent_switch.slots.tts).toEqual({ provider: "aiproxy", model: "qwen3-tts-flash" });
      expect(config.ai_agent_switch.slots.embedding).toEqual({ provider: "aiproxy", model: "text-embedding-v4" });
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("cowagent configure uses model kind metadata for non-LLM slots", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-client-configure-kind-"));
    try {
      await run(
        home,
        "provider",
        "init",
        "--id",
        "aiproxy",
        "--name",
        "AIProxy",
        "--type",
        "openai-chat-compatible",
        "--base-url",
        "https://aiproxy.usw-1.sealos.io/v1",
        "--api-key-env",
        "OPEN_AI_API_KEY",
        "--model",
        "glm-5.1:chat_completions:llm",
        "--model",
        "gpt-image-2:image_generation:image_generation",
        "--model",
        "qwen3-asr-flash:audio_transcriptions:asr",
        "--model",
        "qwen3-tts-flash:audio_speech:tts",
        "--model",
        "text-embedding-v4:embeddings:embedding",
        "--default-model",
        "glm-5.1",
      );

      await run(
        home,
        "client",
        "configure",
        "cowagent",
        "--slot",
        "main=aiproxy/glm-5.1",
        "--slot",
        "image=aiproxy/gpt-image-2",
        "--slot",
        "asr=aiproxy/qwen3-asr-flash",
        "--slot",
        "tts=aiproxy/qwen3-tts-flash",
        "--slot",
        "embedding=aiproxy/text-embedding-v4",
        "--yes",
        "--json",
      );

      const config = JSON.parse(await readFile(join(home, "CowAgent", "config.json"), "utf8"));
      expect(config.skills["image-generation"]).toEqual({ provider: "openai", model: "gpt-image-2" });
      expect(config.voice_to_text).toBe("openai");
      expect(config.voice_to_text_model).toBe("qwen3-asr-flash");
      expect(config.text_to_voice).toBe("openai");
      expect(config.text_to_voice_model).toBe("qwen3-tts-flash");
      expect(config.embedding_provider).toBe("openai");
      expect(config.embedding_model).toBe("text-embedding-v4");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("cowagent configure rejects incompatible model kind for slot", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-client-configure-kind-invalid-"));
    try {
      await run(
        home,
        "provider",
        "init",
        "--id",
        "aiproxy",
        "--name",
        "AIProxy",
        "--type",
        "openai-chat-compatible",
        "--base-url",
        "https://aiproxy.usw-1.sealos.io/v1",
        "--api-key-env",
        "OPEN_AI_API_KEY",
        "--model",
        "glm-5.1:chat_completions:llm",
        "--model",
        "qwen3-tts-flash:audio_speech:tts",
        "--default-model",
        "glm-5.1",
      );

      const result = await runExpectingFailure(
        home,
        "client",
        "configure",
        "cowagent",
        "--slot",
        "main=aiproxy/glm-5.1",
        "--slot",
        "image=aiproxy/qwen3-tts-flash",
        "--dry-run",
        "--json",
      );

      expect(result.stderr).toContain("CowAgent slot image requires model kind image_generation");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("cowagent configure rejects non-main slot models without kind metadata", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-client-configure-kind-missing-"));
    try {
      await run(
        home,
        "provider",
        "add",
        "--id",
        "aiproxy",
        "--name",
        "AIProxy",
        "--type",
        "openai-chat-compatible",
        "--base-url",
        "https://aiproxy.usw-1.sealos.io/v1",
        "--model",
        "glm-5.1",
        "--model",
        "qwen-image-2.0-pro",
      );

      const result = await runExpectingFailure(
        home,
        "client",
        "configure",
        "cowagent",
        "--slot",
        "main=aiproxy/glm-5.1",
        "--slot",
        "image=aiproxy/qwen-image-2.0-pro",
        "--dry-run",
        "--json",
      );

      expect(result.stderr).toContain("CowAgent slot image requires explicit model kind image_generation");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("validates provider models across multiple slots", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-client-configure-multi-model-"));
    try {
      await run(
        home,
        "provider",
        "add",
        "--id",
        "aiproxy",
        "--name",
        "AIProxy",
        "--type",
        "openai-chat-compatible",
        "--base-url",
        "https://aiproxy.usw-1.sealos.io/v1",
        "--model",
        "glm-5.1",
      );

      const result = await runExpectingFailure(
        home,
        "client",
        "configure",
        "cowagent",
        "--slot",
        "main=aiproxy/glm-5.1",
        "--slot",
        "assistant=aiproxy/missing-model",
        "--dry-run",
        "--json",
      );

      expect(result.stderr).toContain("Model not found for provider aiproxy: missing-model");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});

async function run(home: string, ...args: string[]): Promise<string> {
  const proc = Bun.spawn(["bun", cliPath, ...args], {
    env: testEnv(home),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (exitCode !== 0) throw new Error(`Command failed: ${args.join(" ")}\n${stderr}`);
  return stdout;
}

async function runExpectingFailure(home: string, ...args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bun", cliPath, ...args], {
    env: testEnv(home),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (exitCode === 0) throw new Error(`Command unexpectedly succeeded: ${args.join(" ")}\n${stdout}`);
  return { exitCode, stdout, stderr };
}

function testEnv(home: string): Record<string, string | undefined> {
  return {
    ...process.env,
    HOME: home,
    AI_AGENT_SWITCH_HOME: join(home, ".ai-agent-switch"),
    COWAGENT_HOME: join(home, "CowAgent"),
    HERMES_HOME: join(home, ".hermes"),
    OPENCLAW_HOME: join(home, ".openclaw"),
    OPENCLAW_CONFIG_PATH: join(home, ".openclaw", "openclaw.json"),
    NO_COLOR: "1",
  };
}
