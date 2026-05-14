import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AiAgentSwitchApp } from "../src/core/app";

describe("Agent Hub init", () => {
  test("uses selected model type when one AI Proxy provider serves multiple request formats", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-agent-hub-hermes-"));
    try {
      const app = new AiAgentSwitchApp({ homeDir: home, cwd: home });
      const result = await app.initAgentHub({
        clientId: "hermes",
        providerId: "aiproxy",
        providerName: "AI Proxy",
        baseUrl: "https://aiproxy.usw-1.sealos.io/v1",
        apiKeyEnv: "AIPROXY_API_KEY",
        modelId: "gpt-5.4",
        modelType: "openai-responses",
        availableModels: [
          { id: "gpt-5.4", type: "openai-responses" },
          { id: "glm-4.6", type: "openai-chat-compatible" },
        ],
        yes: true,
      });

      expect(result).toMatchObject({
        applied: true,
        clientId: "hermes",
        providerId: "aiproxy",
        modelId: "gpt-5.4",
        modelType: "openai-responses",
      });
      const config = await readFile(join(home, ".hermes/config.yaml"), "utf8");
      expect(config).toContain("provider: aiproxy");
      expect(config).toContain("key_env: AIPROXY_API_KEY");
      expect(config).toContain("transport: codex_responses");
      expect(config).toContain("glm-4.6");
      expect((await app.status()).state.lastSwitch).toMatchObject({
        clientId: "hermes",
        providerId: "aiproxy",
        modelId: "gpt-5.4",
      });
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("OpenClaw uses the selected model type instead of a provider-level type", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-agent-hub-openclaw-"));
    try {
      const app = new AiAgentSwitchApp({ homeDir: home, cwd: home });
      await app.initAgentHub({
        clientId: "openclaw",
        providerId: "aiproxy",
        providerName: "AI Proxy",
        baseUrl: "https://aiproxy.hzh.sealos.run/v1",
        apiKeyEnv: "AIPROXY_API_KEY",
        modelId: "glm-4.6",
        modelType: "openai-chat-compatible",
        availableModels: [
          { id: "gpt-5.4", type: "openai-responses" },
          { id: "glm-4.6", type: "openai-chat-compatible" },
        ],
        yes: true,
      });

      const parsed = JSON.parse(await readFile(join(home, ".openclaw/openclaw.json"), "utf8"));
      expect(parsed.agents.defaults.model.primary).toBe("aiproxy/glm-4.6");
      expect(parsed.models.providers.aiproxy.api).toBe("openai-completions");
      expect(parsed.models.providers.aiproxy.models).toEqual([
        { id: "gpt-5.4", name: "gpt-5.4" },
        { id: "glm-4.6", name: "glm-4.6" },
      ]);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("rejects a selected model that is not in the Agent Hub available model list", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-agent-hub-missing-model-"));
    try {
      const app = new AiAgentSwitchApp({ homeDir: home, cwd: home });

      await expect(app.initAgentHub({
        clientId: "hermes",
        providerId: "aiproxy",
        providerName: "AI Proxy",
        baseUrl: "https://aiproxy.usw-1.sealos.io/v1",
        apiKeyEnv: "AIPROXY_API_KEY",
        modelId: "claude-sonnet-4.6",
        modelType: "anthropic",
        availableModels: [{ id: "claude-sonnet-4.5", type: "anthropic" }],
        yes: true,
      })).rejects.toThrow("must be included in --available-model");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("rejects CowAgent Agent Hub init when AI Proxy key is not mapped to CowAgent runtime env", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-agent-hub-cowagent-"));
    try {
      const app = new AiAgentSwitchApp({ homeDir: home, cwd: home });
      await expect(app.initAgentHub({
        clientId: "cowagent",
        providerId: "aiproxy",
        providerName: "AI Proxy",
        baseUrl: "https://aiproxy.usw-1.sealos.io/v1",
        apiKeyEnv: "AIPROXY_API_KEY",
        modelId: "claude-sonnet-4.6",
        modelType: "anthropic",
        availableModels: [{ id: "claude-sonnet-4.6", type: "anthropic" }],
        yes: true,
      })).rejects.toThrow("CLAUDE_API_KEY");
      expect(existsSync(join(home, "CowAgent/config.json"))).toBe(false);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("dry-run plans Agent Hub init without writing ai-agent-switch store", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-agent-hub-dry-run-"));
    try {
      const app = new AiAgentSwitchApp({ homeDir: home, cwd: home });
      const result = await app.initAgentHub({
        clientId: "hermes",
        providerId: "aiproxy",
        providerName: "AI Proxy",
        baseUrl: "https://aiproxy.usw-1.sealos.io/v1",
        apiKeyEnv: "AIPROXY_API_KEY",
        modelId: "glm-4.6",
        modelType: "openai-chat-compatible",
        availableModels: [{ id: "glm-4.6", type: "openai-chat-compatible" }],
        yes: false,
      });

      expect(result).toMatchObject({ applied: false, requiresConfirmation: true });
      expect(existsSync(join(home, ".ai-agent-switch/config.jsonc"))).toBe(false);
      expect(existsSync(join(home, ".hermes/config.yaml"))).toBe(false);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
