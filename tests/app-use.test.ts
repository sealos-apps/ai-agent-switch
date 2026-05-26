import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AiAgentSwitchApp } from "../src/core/app";

describe("AiAgentSwitchApp.useClient", () => {
  test("-y applies a validated provider/model switch", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-use-"));
    try {
      const app = new AiAgentSwitchApp({ homeDir: home, cwd: home });
      await app.addProvider({
        id: "openrouter",
        name: "OpenRouter",
        type: "openai-compatible",
        baseUrl: "https://openrouter.ai/api/v1",
        apiKeyEnv: "OPENROUTER_API_KEY",
        models: [{ id: "qwen/qwen3-coder" }],
      });

      const result = await app.useClient({
        clientId: "qwen",
        target: "openrouter/qwen/qwen3-coder",
        yes: true,
      });

      expect(result.applied).toBe(true);
      expect(result.requiresConfirmation).toBe(false);
      const settings = JSON.parse(await readFile(join(home, ".qwen/settings.json"), "utf8"));
      expect(settings.model.name).toBe("qwen/qwen3-coder");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("without -y returns a patch plan and does not write client config", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-use-dry-"));
    try {
      const app = new AiAgentSwitchApp({ homeDir: home, cwd: home });
      await app.addProvider({
        id: "openrouter",
        name: "OpenRouter",
        type: "openai-compatible",
        baseUrl: "https://openrouter.ai/api/v1",
        models: [{ id: "qwen/qwen3-coder" }],
      });

      const result = await app.useClient({
        clientId: "qwen",
        target: "openrouter/qwen/qwen3-coder",
        yes: false,
      });

      expect(result.applied).toBe(false);
      expect(result.requiresConfirmation).toBe(true);
      expect(result.plan.files[0]?.path).toContain(".qwen/settings.json");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("switchClient uses provider default model when model is omitted", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-switch-default-"));
    try {
      const app = new AiAgentSwitchApp({ homeDir: home, cwd: home });
      await app.addProvider({
        id: "aiproxy",
        name: "AIProxy",
        type: "openai-chat-compatible",
        baseUrl: "https://aiproxy.usw-1.sealos.io/v1",
        apiKeyEnv: "AIPROXY_API_KEY",
        models: [
          { id: "glm-5.1", type: "openai-chat-compatible" },
          { id: "gpt-5.4-mini", type: "openai-responses" },
        ],
        defaultModel: "gpt-5.4-mini",
      });

      const result = await app.switchClient({
        clientId: "openclaw",
        providerId: "aiproxy",
        yes: true,
      });

      expect(result.applied).toBe(true);
      expect(result.requiresConfirmation).toBe(false);
      const config = JSON.parse(await readFile(join(home, ".openclaw/openclaw.json"), "utf8"));
      expect(config.agents.defaults.model.primary).toBe("aiproxy/gpt-5.4-mini");
      expect(config.models.providers.aiproxy.api).toBe("openai-responses");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("switchClient requires a model when provider has no default model", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-switch-no-default-"));
    try {
      const app = new AiAgentSwitchApp({ homeDir: home, cwd: home });
      await app.addProvider({
        id: "aiproxy",
        name: "AIProxy",
        type: "openai-chat-compatible",
        models: [{ id: "glm-5.1" }],
      });

      await expect(app.switchClient({
        clientId: "openclaw",
        providerId: "aiproxy",
        yes: true,
      })).rejects.toThrow("Missing --model");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("can connect a client to the local ai-agent-switch proxy without selecting an upstream provider", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-use-proxy-"));
    try {
      const app = new AiAgentSwitchApp({ homeDir: home, cwd: home });

      const result = await app.useClientProxy({
        clientId: "qwen",
        yes: true,
      });

      expect(result.applied).toBe(true);
      expect(result.requiresConfirmation).toBe(false);
      const settings = JSON.parse(await readFile(join(home, ".qwen/settings.json"), "utf8"));
      expect(settings.security.auth.selectedType).toBe("ai-agent-switch-proxy");
      expect(settings.model.name).toBe("ai-agent-switch/default");
      expect(settings.modelProviders["ai-agent-switch-proxy"].baseUrl).toBe("http://127.0.0.1:17890/v1");
      expect(settings.modelProviders["ai-agent-switch-proxy"].description).toContain("openai-chat-compatible");
      expect((await app.status()).state.lastSwitch).toMatchObject({
        clientId: "qwen",
        providerId: "ai-agent-switch-proxy",
        modelId: "ai-agent-switch/default",
      });
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("maps 0.0.0.0 proxy host to localhost in generated client config", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-use-proxy-host-"));
    try {
      const app = new AiAgentSwitchApp({ homeDir: home, cwd: home });
      await app.updateProxyConfig({ host: "0.0.0.0" });

      await app.useClientProxy({
        clientId: "qwen",
        yes: true,
      });

      const settings = JSON.parse(await readFile(join(home, ".qwen/settings.json"), "utf8"));
      expect(settings.modelProviders["ai-agent-switch-proxy"].baseUrl).toBe("http://127.0.0.1:17890/v1");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
