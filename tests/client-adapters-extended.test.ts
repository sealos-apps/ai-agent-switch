import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createClientAdapters } from "../src/clients";
import type { ProviderProfile } from "../src/config/schema";

const provider: ProviderProfile = {
  id: "openrouter",
  name: "OpenRouter",
  type: "openai-compatible",
  baseUrl: "https://openrouter.ai/api/v1",
  apiKeyEnv: "OPENROUTER_API_KEY",
  models: [{ id: "qwen/qwen3-coder" }],
};

describe("extended client adapters", () => {
  test("gemini adapter patches model provider settings", async () => {
    const home = await mkdtemp(join(tmpdir(), "agent-switch-gemini-"));
    try {
      await mkdir(join(home, ".gemini"), { recursive: true });
      await writeFile(join(home, ".gemini/settings.json"), JSON.stringify({ keep: true }, null, 2));
      const gemini = createClientAdapters({ homeDir: home, cwd: home }).get("gemini")!;

      const plan = await gemini.planApply({ provider, modelId: "qwen/qwen3-coder" });
      await gemini.apply(plan);

      const parsed = JSON.parse(await readFile(join(home, ".gemini/settings.json"), "utf8"));
      expect(parsed.keep).toBe(true);
      expect(parsed.model.name).toBe("qwen/qwen3-coder");
      expect(parsed.auth.selectedType).toBe("openrouter");
      expect(parsed.modelProviders.openrouter.envKey).toBe("OPENROUTER_API_KEY");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("openclaw adapter preserves provider/model/runtime separation", async () => {
    const home = await mkdtemp(join(tmpdir(), "agent-switch-openclaw-"));
    try {
      await mkdir(join(home, ".openclaw"), { recursive: true });
      await writeFile(join(home, ".openclaw/openclaw.json"), `{"agents":{"defaults":{"agentRuntime":{"id":"codex"}}}}`);
      const openclaw = createClientAdapters({ homeDir: home, cwd: home }).get("openclaw")!;

      await openclaw.apply(await openclaw.planApply({ provider, modelId: "qwen/qwen3-coder" }));

      const parsed = JSON.parse(await readFile(join(home, ".openclaw/openclaw.json"), "utf8"));
      expect(parsed.agents.defaults.agentRuntime.id).toBe("codex");
      expect(parsed.agents.defaults.model.primary).toBe("openrouter/qwen/qwen3-coder");
      expect(parsed.models.providers.openrouter.api).toBe("openai-completions");
      expect(parsed.models.providers.openrouter.apiKey).toEqual({ source: "env", provider: "default", id: "OPENROUTER_API_KEY" });
      expect(parsed.models.providers.openrouter.models).toEqual([{ id: "qwen/qwen3-coder", name: "qwen/qwen3-coder" }]);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("openclaw adapter maps Anthropic providers to messages transport", async () => {
    const home = await mkdtemp(join(tmpdir(), "agent-switch-openclaw-anthropic-"));
    try {
      await mkdir(join(home, ".openclaw"), { recursive: true });
      const openclaw = createClientAdapters({ homeDir: home, cwd: home }).get("openclaw")!;
      const anthropicProvider: ProviderProfile = {
        id: "aiproxy-anthropic",
        name: "Ai Proxy Anthropic",
        type: "anthropic",
        baseUrl: "https://aiproxy.hzh.sealos.run/v1",
        apiKeyEnv: "AIPROXY_API_KEY",
        models: [{ id: "deepseek-v4-pro", name: "DeepSeek V4 Pro" }],
      };

      await openclaw.apply(await openclaw.planApply({ provider: anthropicProvider, modelId: "deepseek-v4-pro" }));

      const parsed = JSON.parse(await readFile(join(home, ".openclaw/openclaw.json"), "utf8"));
      expect(parsed.agents.defaults.model.primary).toBe("aiproxy-anthropic/deepseek-v4-pro");
      expect(parsed.models.providers["aiproxy-anthropic"].api).toBe("anthropic-messages");
      expect(parsed.models.providers["aiproxy-anthropic"].apiKey).toEqual({ source: "env", provider: "default", id: "AIPROXY_API_KEY" });
      expect(parsed.models.providers["aiproxy-anthropic"].models).toEqual([{ id: "deepseek-v4-pro", name: "DeepSeek V4 Pro" }]);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("crush adapter patches large model without touching sessions", async () => {
    const home = await mkdtemp(join(tmpdir(), "agent-switch-crush-"));
    try {
      await mkdir(join(home, ".config/crush"), { recursive: true });
      await writeFile(join(home, ".config/crush/crush.json"), JSON.stringify({ session_dir: "keep" }, null, 2));
      const crush = createClientAdapters({ homeDir: home, cwd: home }).get("crush")!;

      await crush.apply(await crush.planApply({ provider, modelId: "qwen/qwen3-coder" }));

      const parsed = JSON.parse(await readFile(join(home, ".config/crush/crush.json"), "utf8"));
      expect(parsed.session_dir).toBe("keep");
      expect(parsed.models.large).toEqual({ provider: "openrouter", model: "qwen/qwen3-coder" });
      expect(parsed.providers.openrouter.type).toBe("openai-compat");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("crush adapter maps explicit OpenAI Chat-compatible providers to openai-compat", async () => {
    const home = await mkdtemp(join(tmpdir(), "agent-switch-crush-chat-"));
    try {
      await mkdir(join(home, ".config/crush"), { recursive: true });
      const crush = createClientAdapters({ homeDir: home, cwd: home }).get("crush")!;
      const chatProvider: ProviderProfile = {
        ...provider,
        type: "openai-chat-compatible",
      };

      await crush.apply(await crush.planApply({ provider: chatProvider, modelId: "qwen/qwen3-coder" }));

      const parsed = JSON.parse(await readFile(join(home, ".config/crush/crush.json"), "utf8"));
      expect(parsed.providers.openrouter.type).toBe("openai-compat");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("opencode adapter patches coder agent provider/model", async () => {
    const home = await mkdtemp(join(tmpdir(), "agent-switch-opencode-"));
    try {
      await writeFile(join(home, ".opencode.json"), JSON.stringify({ keep: true }, null, 2));
      const opencode = createClientAdapters({ homeDir: home, cwd: home }).get("opencode")!;

      await opencode.apply(await opencode.planApply({ provider, modelId: "qwen/qwen3-coder" }));

      const parsed = JSON.parse(await readFile(join(home, ".opencode.json"), "utf8"));
      expect(parsed.keep).toBe(true);
      expect(parsed.agents.coder.provider).toBe("openrouter");
      expect(parsed.agents.coder.model).toBe("qwen/qwen3-coder");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("cowagent adapter patches global config without dropping unknown fields", async () => {
    const home = await mkdtemp(join(tmpdir(), "agent-switch-cowagent-"));
    try {
      await mkdir(join(home, "CowAgent"), { recursive: true });
      await writeFile(join(home, "CowAgent/config.json"), JSON.stringify({ channel_type: "feishu", agent: true }, null, 2));
      const cowagent = createClientAdapters({ homeDir: home, cwd: home }).get("cowagent")!;
      const compatibleProvider: ProviderProfile = {
        id: "aiproxy-openai",
        name: "Ai Proxy OpenAI",
        type: "openai-chat-compatible",
        baseUrl: "https://aiproxy.hzh.sealos.run/v1",
        apiKey: { kind: "inline", value: "sk-test" },
        models: [{ id: "deepseek-v4-flash" }],
      };

      await cowagent.apply(await cowagent.planApply({ provider: compatibleProvider, modelId: "deepseek-v4-flash" }));

      const parsed = JSON.parse(await readFile(join(home, "CowAgent/config.json"), "utf8"));
      expect(parsed.channel_type).toBe("feishu");
      expect(parsed.agent).toBe(true);
      expect(parsed.model).toBe("deepseek-v4-flash");
      expect(parsed.bot_type).toBe("openai");
      expect(parsed.open_ai_api_base).toBe("https://aiproxy.hzh.sealos.run/v1");
      expect(parsed.open_ai_api_key).toBe("sk-test");
      expect(parsed.agent_switch).toEqual({ provider: "aiproxy-openai", model: "deepseek-v4-flash" });
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("cowagent adapter maps Anthropic providers to claudeAPI", async () => {
    const home = await mkdtemp(join(tmpdir(), "agent-switch-cowagent-anthropic-"));
    try {
      const cowagent = createClientAdapters({ homeDir: home, cwd: home }).get("cowagent")!;
      const anthropicProvider: ProviderProfile = {
        id: "aiproxy-anthropic",
        name: "Ai Proxy Anthropic",
        type: "anthropic",
        baseUrl: "https://aiproxy.hzh.sealos.run/v1",
        apiKeyEnv: "CLAUDE_API_KEY",
        models: [{ id: "deepseek-v4-pro", name: "DeepSeek V4 Pro" }],
      };

      await cowagent.apply(await cowagent.planApply({ provider: anthropicProvider, modelId: "deepseek-v4-pro" }));

      const parsed = JSON.parse(await readFile(join(home, "CowAgent/config.json"), "utf8"));
      expect(parsed.model).toBe("deepseek-v4-pro");
      expect(parsed.bot_type).toBe("claudeAPI");
      expect(parsed.claude_api_base).toBe("https://aiproxy.hzh.sealos.run/v1");
      expect(parsed.claude_api_key).toBeUndefined();
      expect(parsed.agent_switch.provider).toBe("aiproxy-anthropic");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  const cowAgentProviderCases = [
    {
      type: "gemini",
      modelId: "gemini-3-pro-preview",
      baseUrl: "https://generativelanguage.googleapis.com",
      botType: "gemini",
      baseKey: "gemini_api_base",
      keyKey: "gemini_api_key",
    },
    {
      type: "deepseek",
      modelId: "deepseek-v4-flash",
      baseUrl: "https://api.deepseek.com/v1",
      botType: "deepseek",
      baseKey: "deepseek_api_base",
      keyKey: "deepseek_api_key",
    },
    {
      type: "moonshot",
      modelId: "moonshot-v1-32k",
      baseUrl: "https://api.moonshot.cn/v1",
      botType: "moonshot",
      baseKey: "moonshot_base_url",
      keyKey: "moonshot_api_key",
    },
    {
      type: "dashscope",
      modelId: "qwen3-max",
      botType: "dashscope",
      keyKey: "dashscope_api_key",
    },
  ] as const;

  for (const item of cowAgentProviderCases) {
    test(`cowagent adapter maps ${item.type} provider fields`, async () => {
      const home = await mkdtemp(join(tmpdir(), `agent-switch-cowagent-${item.type}-`));
      try {
        const cowagent = createClientAdapters({ homeDir: home, cwd: home }).get("cowagent")!;
        const mappedProvider: ProviderProfile = {
          id: `cowagent-${item.type}`,
          name: `CowAgent ${item.type}`,
          type: item.type,
          baseUrl: "baseUrl" in item ? item.baseUrl : undefined,
          apiKey: { kind: "inline", value: `${item.type}-key` },
          models: [{ id: item.modelId }],
        };

        await cowagent.apply(await cowagent.planApply({ provider: mappedProvider, modelId: item.modelId }));

        const parsed = JSON.parse(await readFile(join(home, "CowAgent/config.json"), "utf8"));
        expect(parsed.model).toBe(item.modelId);
        expect(parsed.bot_type).toBe(item.botType);
        if ("baseKey" in item) expect(parsed[item.baseKey]).toBe(item.baseUrl);
        expect(parsed[item.keyKey]).toBe(`${item.type}-key`);
        expect(parsed.agent_switch).toEqual({ provider: `cowagent-${item.type}`, model: item.modelId });
      } finally {
        await rm(home, { recursive: true, force: true });
      }
    });
  }

  test("cowagent adapter does not report bot_type as provider id", async () => {
    const home = await mkdtemp(join(tmpdir(), "agent-switch-cowagent-current-"));
    try {
      await mkdir(join(home, "CowAgent"), { recursive: true });
      await writeFile(join(home, "CowAgent/config.json"), JSON.stringify({ bot_type: "openai", model: "deepseek-v4-flash" }, null, 2));
      const cowagent = createClientAdapters({ homeDir: home, cwd: home }).get("cowagent")!;

      await expect(cowagent.getCurrent()).resolves.toMatchObject({
        clientId: "cowagent",
        providerId: undefined,
        modelId: "deepseek-v4-flash",
      });
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("cowagent adapter rejects unsupported env key names instead of copying secrets", async () => {
    const home = await mkdtemp(join(tmpdir(), "agent-switch-cowagent-env-"));
    try {
      const cowagent = createClientAdapters({ homeDir: home, cwd: home }).get("cowagent")!;

      await expect(cowagent.planApply({ provider, modelId: "qwen/qwen3-coder" })).rejects.toThrow("OPEN_AI_API_KEY");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("claude-code adapter writes only agentSwitch namespace", async () => {
    const home = await mkdtemp(join(tmpdir(), "agent-switch-claude-"));
    try {
      await mkdir(join(home, ".claude"), { recursive: true });
      await writeFile(join(home, ".claude/settings.json"), JSON.stringify({ existing: true }, null, 2));
      const claude = createClientAdapters({ homeDir: home, cwd: home }).get("claude-code")!;

      await claude.apply(await claude.planApply({ provider, modelId: "qwen/qwen3-coder" }));

      const parsed = JSON.parse(await readFile(join(home, ".claude/settings.json"), "utf8"));
      expect(parsed.existing).toBe(true);
      expect(parsed.agentSwitch.provider).toBe("openrouter");
      expect(parsed.agentSwitch.model).toBe("qwen/qwen3-coder");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
