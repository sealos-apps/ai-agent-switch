import { describe, expect, test } from "bun:test";
import { providerTypeLabels, selectableProviderTypes, type ProviderProfile, type ValidationResult } from "../src/config/schema";
import type { AppStatus, ModelTarget } from "../src/core/app";
import { keyToTuiAction } from "../src/tui/input";
import { createTuiState, reduceTuiState, selectedMainMenuItem, selectedModelTarget } from "../src/tui/state";
import { renderTuiFrame } from "../src/tui/render";
import { executeTuiCommand } from "../src/tui/controller";

describe("TUI menu state", () => {
  test("starts on a main menu with Clients, Providers, and Models", () => {
    const state = createTuiState();

    expect(state.view).toBe("menu");
    expect(selectedMainMenuItem(state)).toBe("clients");
  });

  test("uses arrow-key movement as the primary navigation", () => {
    let state = createTuiState();
    state = reduceTuiState(state, { type: "move", delta: 1 }, dataWithProviders());

    expect(selectedMainMenuItem(state)).toBe("providers");
    expect(keyToTuiAction("\u001b[B")).toEqual({ type: "move", delta: 1 });
    expect(keyToTuiAction("\u001b[A")).toEqual({ type: "move", delta: -1 });
    expect(keyToTuiAction("j")).toBeUndefined();
    expect(keyToTuiAction("h")).toEqual({ type: "help" });
  });

  test("selects a model target from the Models screen", () => {
    let state = createTuiState();
    state = reduceTuiState(state, { type: "open-view", view: "models" }, dataWithProviders());
    state = reduceTuiState(state, { type: "select-active-model" }, dataWithProviders());

    expect(state.activeTargetRef).toBe("openrouter/qwen/qwen3-coder");
    expect(selectedModelTarget(state, dataWithProviders())?.ref).toBe("openrouter/qwen/qwen3-coder");
  });
});

describe("TUI menu rendering", () => {
  test("renders the main menu and h help key", () => {
    const frame = renderTuiFrame({ state: createTuiState(), data: dataWithProviders() }, { rows: 24, cols: 100 });

    expect(frame).toContain("Main Menu");
    expect(frame).toContain("Clients");
    expect(frame).toContain("Providers");
    expect(frame).toContain("Models");
    expect(frame).toContain("↑/↓ 移动");
    expect(frame).toContain("h 帮助");
  });

  test("renders provider setup actions when no provider exists", () => {
    const state = reduceTuiState(createTuiState(), { type: "open-view", view: "providers" }, dataWithoutProviders());
    const frame = renderTuiFrame({ state, data: dataWithoutProviders() }, { rows: 24, cols: 100 });

    expect(frame).toContain("还没有 provider");
    expect(frame).toContain("Add from preset");
    expect(frame).toContain("Add custom provider");
  });

  test("renders Clients as a plain configurable client list", () => {
    const state = reduceTuiState(createTuiState(), { type: "open-view", view: "clients" }, dataWithProviders());
    const frame = renderTuiFrame({ state, data: dataWithProviders() }, { rows: 24, cols: 100 });

    expect(frame).toContain("OpenAI Codex");
    expect(frame).not.toContain("enabled");
    expect(frame).not.toContain("su8 / gpt-5.5");
    expect(frame).toContain("Enter 进入");
  });

  test("renders Client detail after a client is selected", () => {
    const state = {
      ...createTuiState(),
      view: "client-detail" as const,
      previousView: "clients" as const,
      clientDetail: { clientId: "codex" as const },
    };
    const frame = renderTuiFrame({ state, data: dataWithClientCurrent() }, { rows: 30, cols: 100 });

    expect(frame).toContain("Client / OpenAI Codex");
    expect(frame).toContain("su8 / gpt-5.5");
    expect(frame).toContain("Use current config");
    expect(frame).toContain("Use agent-switch proxy");
    expect(frame).toContain("sub2api/gpt-5.5 -> su8/gpt-5.4");
  });

  test("renders model management actions", () => {
    const state = reduceTuiState(createTuiState(), { type: "open-view", view: "models" }, dataWithProviders());
    const frame = renderTuiFrame({ state, data: dataWithProviders() }, { rows: 24, cols: 100 });

    expect(frame).toContain("a 添加模型");
    expect(frame).toContain("x 删除");
    expect(frame).toContain("* 默认");
  });

  test("renders provider type as selectable choices in the custom provider form", () => {
    const state = {
      ...createTuiState(),
      view: "custom-provider" as const,
      form: {
        kind: "custom-provider" as const,
        activeField: 2,
        fields: [
          { name: "id", label: "id", value: "", required: true },
          { name: "name", label: "name", value: "", required: true },
          {
            name: "type",
            label: "type",
            value: "openai-chat-compatible",
            required: true,
            options: selectableProviderTypes,
            optionLabels: providerTypeLabels,
          },
          { name: "baseUrl", label: "baseUrl", value: "", required: false },
          { name: "apiKeyEnv", label: "apiKeyEnv", value: "", required: false },
          { name: "models", label: "models", value: "", required: true },
        ],
      },
    };
    const frame = renderTuiFrame({ state, data: dataWithoutProviders() }, { rows: 40, cols: 80 });

    expect(frame).toContain("<openai-chat-compatible>");
    expect(frame).toContain("可选类型");
    expect(frame).toContain("OpenAI Responses API");
    expect(frame).toContain("Chat Completions compatible");
    for (const type of selectableProviderTypes) {
      expect(frame).toContain(type);
    }
    expect(frame).toContain("Space 切换选项");
  });
});

describe("TUI command execution", () => {
  test("adds a provider preset through the controller", async () => {
    const calls: string[] = [];
    const app = tuiApp({
      addProviderPreset: async (id: string) => {
        calls.push(id);
        return { id, name: id, type: "openai-compatible", models: [{ id: "model" }] };
      },
    });

    const result = await executeTuiCommand(app as never, { type: "add-provider-preset", presetId: "openrouter" });

    expect(calls).toEqual(["openrouter"]);
    expect(result.message.text).toContain("openrouter");
    expect(result.data.models[0]?.ref).toBe("openrouter/qwen/qwen3-coder");
  });

  test("applies the active model target to a client", async () => {
    const calls: string[] = [];
    const app = tuiApp({
      useClient: async (input: { clientId: string; target: string; yes: boolean }) => {
        calls.push(`${input.clientId}:${input.target}:${input.yes}`);
        return { applied: true, requiresConfirmation: false, plan: { clientId: input.clientId, summary: "ok", files: [] } };
      },
    });

    const result = await executeTuiCommand(app as never, {
      type: "apply-client",
      clientId: "codex",
      target: "openrouter/qwen/qwen3-coder",
    });

    expect(calls).toEqual(["codex:openrouter/qwen/qwen3-coder:true"]);
    expect(result.message.text).toContain("codex");
  });

  test("connects a selected client to the agent-switch proxy through the controller", async () => {
    const calls: string[] = [];
    const app = tuiApp({
      useClientProxy: async (input: { clientId: string; yes: boolean }) => {
        calls.push(`${input.clientId}:${input.yes}`);
        return { applied: true, requiresConfirmation: false, plan: { clientId: input.clientId, summary: "ok", files: [] } };
      },
      getClientCurrent: async () => ({ clientId: "codex", providerId: "agent-switch-proxy", modelId: "agent-switch/default", configPath: "/tmp/.codex/config.toml" }),
    });

    const result = await executeTuiCommand(app as never, {
      type: "use-agent-switch-proxy",
      clientId: "codex",
    });

    expect(calls).toEqual(["codex:true"]);
    expect(result.message.text).toContain("agent-switch proxy");
    expect(result.data.clientCurrent?.providerId).toBe("agent-switch-proxy");
  });

  test("adds a custom provider through the controller", async () => {
    const calls: string[] = [];
    const app = tuiApp({
      addProvider: async (provider: ProviderProfile) => {
        calls.push(`${provider.id}:${provider.models[0]?.id}`);
        return provider;
      },
    });

    const result = await executeTuiCommand(app as never, {
      type: "add-custom-provider",
      provider: {
        id: "local",
        name: "Local",
        type: "openai-compatible",
        baseUrl: "http://127.0.0.1:1234/v1",
        models: [{ id: "local-model" }],
        defaultModel: "local-model",
      },
    });

    expect(calls).toEqual(["local:local-model"]);
    expect(result.message.text).toContain("local");
  });

  test("manages provider and model commands", async () => {
    const calls: string[] = [];
    const app = tuiApp({
      addProviderModel: async (providerId: string, modelId: string) => {
        calls.push(`add-model:${providerId}:${modelId}`);
        return { id: providerId, name: providerId, type: "openai-compatible", models: [{ id: modelId }] };
      },
      removeProviderModel: async (providerId: string, modelId: string) => {
        calls.push(`remove-model:${providerId}:${modelId}`);
        return { id: providerId, name: providerId, type: "openai-compatible", models: [{ id: "remaining" }] };
      },
      setProviderDefaultModel: async (providerId: string, modelId: string) => {
        calls.push(`default:${providerId}:${modelId}`);
        return { id: providerId, name: providerId, type: "openai-compatible", models: [{ id: modelId }], defaultModel: modelId };
      },
      removeProvider: async (providerId: string) => {
        calls.push(`remove-provider:${providerId}`);
        return true;
      },
      testProvider: async (providerId: string): Promise<ValidationResult> => {
        calls.push(`test-provider:${providerId}`);
        return { ok: true, issues: [] };
      },
    });

    await executeTuiCommand(app as never, { type: "add-model", providerId: "openrouter", modelId: "new-model" });
    await executeTuiCommand(app as never, { type: "remove-model", providerId: "openrouter", modelId: "old-model" });
    await executeTuiCommand(app as never, { type: "set-provider-default-model", providerId: "openrouter", modelId: "new-model" });
    await executeTuiCommand(app as never, { type: "remove-provider", providerId: "openrouter" });
    await executeTuiCommand(app as never, { type: "test-provider", providerId: "openrouter" });

    expect(calls).toEqual([
      "add-model:openrouter:new-model",
      "remove-model:openrouter:old-model",
      "default:openrouter:new-model",
      "remove-provider:openrouter",
      "test-provider:openrouter",
    ]);
  });

  test("detects clients through the controller", async () => {
    const calls: string[] = [];
    const app = tuiApp({
      detectClients: async () => {
        calls.push("detect");
        return [
          { installed: true, executableAvailable: true, command: "codex", configPath: "/tmp/codex", configExists: true, details: [] },
          { installed: false, executableAvailable: false, configPath: "/tmp/qwen", configExists: false, details: [] },
        ];
      },
    });

    const result = await executeTuiCommand(app as never, { type: "detect-clients" });

    expect(calls).toEqual(["detect"]);
    expect(result.message.text).toContain("1 OK");
    expect(result.message.text).toContain("1 MISS");
  });

  test("shows selected client current state through the controller", async () => {
    const app = tuiApp();

    const result = await executeTuiCommand(app as never, { type: "show-client", clientId: "codex" });

    expect(result.message.text).toContain("codex");
    expect(result.message.text).toContain("su8/gpt-5.5");
  });
});

function dataWithoutProviders() {
  return {
    status: statusWithoutProviders(),
    clients: clients(),
    models: [] as ModelTarget[],
    presets: [{ id: "openrouter", name: "OpenRouter", models: ["qwen/qwen3-coder"] }],
  };
}

function dataWithProviders() {
  return {
    status: statusWithProviders(),
    clients: clients(),
    models: models(),
    presets: [{ id: "openrouter", name: "OpenRouter", models: ["qwen/qwen3-coder"] }],
  };
}

function dataWithClientCurrent() {
  return {
    ...dataWithProviders(),
    status: {
      ...statusWithProviders(),
      routes: {
        default: {
          candidates: [
            { providerId: "sub2api", modelId: "gpt-5.5" },
            { providerId: "su8", modelId: "gpt-5.4" },
          ],
        },
      },
    },
    clientCurrent: { clientId: "codex" as const, providerId: "su8", modelId: "gpt-5.5", configPath: "/tmp/.codex/config.toml" },
  };
}

function statusWithoutProviders(): AppStatus {
  return {
    configPath: "/tmp/config.jsonc",
    statePath: "/tmp/state.jsonc",
    providers: [],
    clients: [{ clientId: "codex", providerId: undefined, modelId: undefined, configPath: "/tmp/.codex/config.toml" }],
    proxy: {
      enabled: false,
      host: "127.0.0.1",
      port: 17890,
      upstreamProxy: "http://127.0.0.1:7890",
      retry: { enabled: true, maxAttempts: 3 },
      failover: { enabled: true, strategy: "ordered" },
    },
    routes: {},
    state: { version: 1 },
  };
}

function statusWithProviders(): AppStatus {
  return {
    ...statusWithoutProviders(),
    clients: [{ clientId: "codex", providerId: "su8", modelId: "gpt-5.5", configPath: "/tmp/.codex/config.toml" }],
    providers: [
      {
        id: "openrouter",
        name: "OpenRouter",
        type: "openai-compatible",
        baseUrl: "https://openrouter.ai/api/v1",
        models: [{ id: "qwen/qwen3-coder" }],
      },
    ],
  };
}

function configWithProviders() {
  return {
    version: 1 as const,
    clients: {},
    providers: {
      openrouter: {
        id: "openrouter",
        name: "OpenRouter",
        type: "openai-compatible" as const,
        baseUrl: "https://openrouter.ai/api/v1",
        models: [{ id: "qwen/qwen3-coder" }],
      },
    },
    routes: statusWithProviders().routes,
    proxy: statusWithProviders().proxy,
    ui: { theme: "default" },
  };
}

function clients() {
  return [{ id: "codex" as const, displayName: "OpenAI Codex", configPath: "/tmp/.codex/config.toml" }];
}

function tuiApp(overrides: Record<string, unknown> = {}) {
  return {
    configPath: async () => "/tmp/config.jsonc",
    loadConfig: async () => configWithProviders(),
    listProviders: async () => statusWithProviders().providers,
    listClients: async () => clients(),
    listModelTargets: async () => models(),
    getClientCurrent: async () => statusWithProviders().clients[0],
    ...overrides,
  };
}

function models(): ModelTarget[] {
  return [
    {
      providerId: "openrouter",
      providerName: "OpenRouter",
      providerType: "openai-compatible",
      modelId: "qwen/qwen3-coder",
      ref: "openrouter/qwen/qwen3-coder",
      isProviderDefault: false,
    },
  ];
}
