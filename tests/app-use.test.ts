import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AgentSwitchApp } from "../src/core/app";

describe("AgentSwitchApp.useClient", () => {
  test("-y applies a validated provider/model switch", async () => {
    const home = await mkdtemp(join(tmpdir(), "agent-switch-use-"));
    try {
      const app = new AgentSwitchApp({ homeDir: home, cwd: home });
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
    const home = await mkdtemp(join(tmpdir(), "agent-switch-use-dry-"));
    try {
      const app = new AgentSwitchApp({ homeDir: home, cwd: home });
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

  test("can connect a client to the local agent-switch proxy without selecting an upstream provider", async () => {
    const home = await mkdtemp(join(tmpdir(), "agent-switch-use-proxy-"));
    try {
      const app = new AgentSwitchApp({ homeDir: home, cwd: home });

      const result = await app.useClientProxy({
        clientId: "qwen",
        yes: true,
      });

      expect(result.applied).toBe(true);
      expect(result.requiresConfirmation).toBe(false);
      const settings = JSON.parse(await readFile(join(home, ".qwen/settings.json"), "utf8"));
      expect(settings.security.auth.selectedType).toBe("agent-switch-proxy");
      expect(settings.model.name).toBe("agent-switch/default");
      expect(settings.modelProviders["agent-switch-proxy"].baseUrl).toBe("http://127.0.0.1:17890/v1");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
