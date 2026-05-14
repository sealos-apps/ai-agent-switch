import { existsSync } from "node:fs";
import { ConfigStore, type ConfigStoreOptions } from "../config/store";
import { StateStore, type AiAgentSwitchState } from "../config/state";
import {
  aiAgentSwitchConfigSchema,
  providerProfileSchema,
  type AiAgentSwitchConfig,
  type ModelProfile,
  type ProviderProfile,
  type ProviderType,
  type RouteCandidate,
  type ValidationResult,
} from "../config/schema";
import { createClientAdapters, type ClientAdapter, type ClientCurrentState, type ClientId, type PatchPlan } from "../clients";
import { ProviderRegistry, maskProvider } from "../providers/registry";
import { testProviderConnectivity } from "../providers/connectivity";
import { getProviderPreset, type ProviderPresetAddOptions } from "../providers/presets";

export type AiAgentSwitchAppOptions = ConfigStoreOptions & {
  cwd?: string;
};

export type UseClientInput = {
  clientId: ClientId;
  target: string;
  yes: boolean;
};

export type UseClientProxyInput = {
  clientId: ClientId;
  yes: boolean;
};

export type UseClientResult = {
  applied: boolean;
  requiresConfirmation: boolean;
  plan: PatchPlan;
};

export type UseAllClientsInput = {
  target: string;
  yes: boolean;
};

export type UseAllClientItem =
  | { clientId: ClientId; status: "planned" | "applied"; plan: PatchPlan }
  | { clientId: ClientId; status: "skipped"; reason: string }
  | { clientId: ClientId; status: "failed"; reason: string };

export type UseAllClientsResult = {
  applied: boolean;
  results: UseAllClientItem[];
};

export type AgentHubAvailableModel = {
  id: string;
  type: ProviderType;
};

export type InitAgentHubInput = {
  clientId: ClientId;
  providerId: string;
  providerName: string;
  baseUrl: string;
  apiKeyEnv: string;
  modelId: string;
  modelType: ProviderType;
  availableModels: AgentHubAvailableModel[];
  yes: boolean;
};

export type InitAgentHubResult = {
  clientId: ClientId;
  providerId: string;
  modelId: string;
  modelType: ProviderType;
  providerType: ProviderType;
  configPath: string;
  applied: boolean;
  requiresConfirmation: boolean;
  plan: PatchPlan;
};

export type ApplyAgentHubPlanInput = InitAgentHubInput & {
  providerType: ProviderType;
  plan: PatchPlan;
};

export type AppStatus = {
  configPath: string;
  statePath: string;
  providers: ProviderProfile[];
  clients: ClientCurrentState[];
  proxy: AiAgentSwitchConfig["proxy"];
  routes: AiAgentSwitchConfig["routes"];
  state: AiAgentSwitchState;
};

export type DoctorReport = {
  ok: boolean;
  checks: { name: string; ok: boolean; detail: string }[];
};

export type ModelTarget = {
  providerId: string;
  providerName: string;
  providerType: ProviderProfile["type"];
  modelType: ProviderType;
  modelId: string;
  ref: string;
  isProviderDefault: boolean;
  routeIndex?: number | undefined;
};

export type UpdateProxyConfigInput = {
  enabled?: boolean | undefined;
  host?: string | undefined;
  port?: number | undefined;
  upstreamProxy?: string | undefined;
  retryEnabled?: boolean | undefined;
  maxAttempts?: number | undefined;
  failoverEnabled?: boolean | undefined;
};

export class AiAgentSwitchApp {
  readonly store: ConfigStore;
  readonly stateStore: StateStore;
  readonly adapters: Map<ClientId, ClientAdapter>;

  constructor(options: AiAgentSwitchAppOptions = {}) {
    this.store = new ConfigStore(options);
    this.stateStore = new StateStore(this.store.statePath);
    this.adapters = createClientAdapters({ homeDir: this.store.homeDir, cwd: options.cwd ?? process.cwd() });
  }

  async configPath(): Promise<string> {
    await this.store.ensure();
    return this.store.configPath;
  }

  async loadConfig(): Promise<AiAgentSwitchConfig> {
    return this.store.load();
  }

  async validateConfig(): Promise<ValidationResult> {
    return this.store.validate();
  }

  async addProvider(provider: ProviderProfile): Promise<ProviderProfile> {
    const parsed = providerProfileSchema.parse(provider);
    await this.store.update((config) => {
      config.providers[parsed.id] = parsed;
      return config;
    });
    return parsed;
  }

  async addProviderPreset(id: string, options: ProviderPresetAddOptions = {}): Promise<ProviderProfile> {
    const preset = getProviderPreset(id);
    if (!preset) throw new Error(`Provider preset not found: ${id}`);
    return this.addProvider(preset.toProvider(options));
  }

  async removeProvider(id: string): Promise<boolean> {
    let removed = false;
    await this.store.update((config) => {
      removed = Boolean(config.providers[id]);
      delete config.providers[id];
      config.routes.default = {
        candidates: (config.routes.default?.candidates ?? []).filter((candidate) => candidate.providerId !== id),
      };
      return config;
    });
    return removed;
  }

  async addProviderModel(providerId: string, modelId: string): Promise<ProviderProfile> {
    let nextProvider: ProviderProfile | undefined;
    await this.store.update((config) => {
      const provider = config.providers[providerId];
      if (!provider) throw new Error(`Provider not found: ${providerId}`);
      if (!provider.models.some((model) => model.id === modelId)) {
        provider.models.push({ id: modelId });
      }
      nextProvider = provider;
      return config;
    });
    return nextProvider!;
  }

  async removeProviderModel(providerId: string, modelId: string): Promise<ProviderProfile> {
    let nextProvider: ProviderProfile | undefined;
    await this.store.update((config) => {
      const provider = config.providers[providerId];
      if (!provider) throw new Error(`Provider not found: ${providerId}`);
      provider.models = provider.models.filter((model) => model.id !== modelId);
      if (provider.models.length === 0) {
        throw new Error(`Provider ${providerId} must keep at least one model`);
      }
      if (provider.defaultModel === modelId) {
        provider.defaultModel = provider.models[0]?.id;
      }
      config.routes.default = {
        candidates: (config.routes.default?.candidates ?? []).filter(
          (candidate) => candidate.providerId !== providerId || candidate.modelId !== modelId,
        ),
      };
      nextProvider = provider;
      return config;
    });
    return nextProvider!;
  }

  async setProviderDefaultModel(providerId: string, modelId: string): Promise<ProviderProfile> {
    let nextProvider: ProviderProfile | undefined;
    await this.store.update((config) => {
      const provider = config.providers[providerId];
      if (!provider) throw new Error(`Provider not found: ${providerId}`);
      if (!provider.models.some((model) => model.id === modelId)) {
        throw new Error(`Model not found for provider ${providerId}: ${modelId}`);
      }
      provider.defaultModel = modelId;
      nextProvider = provider;
      return config;
    });
    return nextProvider!;
  }

  async setDefaultRoute(target: string): Promise<RouteCandidate[]> {
    const candidate = await this.resolveRouteCandidate(target);
    const config = await this.store.update((draft) => {
      draft.routes.default = { candidates: [candidate] };
      return draft;
    });
    return config.routes.default?.candidates ?? [];
  }

  async addRouteFallback(target: string): Promise<RouteCandidate[]> {
    const candidate = await this.resolveRouteCandidate(target);
    const config = await this.store.update((draft) => {
      const current = draft.routes.default?.candidates ?? [];
      const exists = current.some((item) => item.providerId === candidate.providerId && item.modelId === candidate.modelId);
      draft.routes.default = { candidates: exists ? current : [...current, candidate] };
      return draft;
    });
    return config.routes.default?.candidates ?? [];
  }

  async removeRouteCandidate(target: string): Promise<RouteCandidate[]> {
    const candidate = await this.resolveRouteCandidate(target);
    const config = await this.store.update((draft) => {
      const current = draft.routes.default?.candidates ?? [];
      draft.routes.default = {
        candidates: current.filter((item) => item.providerId !== candidate.providerId || item.modelId !== candidate.modelId),
      };
      return draft;
    });
    return config.routes.default?.candidates ?? [];
  }

  async clearDefaultRoute(): Promise<void> {
    await this.store.update((draft) => {
      draft.routes.default = { candidates: [] };
      return draft;
    });
  }

  private async resolveRouteCandidate(target: string): Promise<RouteCandidate> {
    const config = await this.store.load();
    const registry = new ProviderRegistry(config);
    const ref = registry.resolveModelRef(target);
    return { providerId: ref.providerId, modelId: ref.modelId };
  }

  async listProviders(safe = true): Promise<ProviderProfile[]> {
    const config = await this.store.load();
    const providers = Object.values(config.providers);
    return safe ? providers.map(maskProvider) : providers;
  }

  async testProvider(id: string): Promise<ValidationResult> {
    const config = await this.store.load();
    const provider = config.providers[id];
    if (!provider) return { ok: false, issues: [`Provider not found: ${id}`] };
    return testProviderConnectivity(provider, config.proxy);
  }

  async listModelTargets(): Promise<ModelTarget[]> {
    const config = await this.store.load();
    const routeKeys = new Map(
      (config.routes.default?.candidates ?? []).map((candidate, index) => [`${candidate.providerId}/${candidate.modelId}`, index]),
    );

    return Object.values(config.providers).flatMap((provider) =>
      provider.models.map((model) => {
        const ref = `${provider.id}/${model.id}`;
        return {
          providerId: provider.id,
          providerName: provider.name,
          providerType: provider.type,
          modelType: model.type ?? provider.type,
          modelId: model.id,
          ref,
          isProviderDefault: provider.defaultModel === model.id,
          routeIndex: routeKeys.get(ref),
        };
      }),
    );
  }

  async updateProxyConfig(input: UpdateProxyConfigInput): Promise<AiAgentSwitchConfig["proxy"]> {
    const config = await this.store.update((draft) => {
      if (input.enabled !== undefined) draft.proxy.enabled = input.enabled;
      if (input.host !== undefined) draft.proxy.host = input.host;
      if (input.port !== undefined) draft.proxy.port = input.port;
      if (input.upstreamProxy !== undefined) draft.proxy.upstreamProxy = input.upstreamProxy;
      if (input.retryEnabled !== undefined) draft.proxy.retry.enabled = input.retryEnabled;
      if (input.maxAttempts !== undefined) draft.proxy.retry.maxAttempts = input.maxAttempts;
      if (input.failoverEnabled !== undefined) draft.proxy.failover.enabled = input.failoverEnabled;
      return draft;
    });
    return config.proxy;
  }

  async listClients(): Promise<{ id: ClientId; displayName: string; configPath: string }[]> {
    return [...this.adapters.values()].map((adapter) => ({
      id: adapter.id,
      displayName: adapter.displayName,
      configPath: adapter.configPath,
    }));
  }

  async detectClients(): Promise<Awaited<ReturnType<ClientAdapter["detect"]>>[]> {
    return Promise.all([...this.adapters.values()].map((adapter) => adapter.detect()));
  }

  async detectClient(clientId: ClientId): Promise<Awaited<ReturnType<ClientAdapter["detect"]>>> {
    const adapter = this.adapters.get(clientId);
    if (!adapter) throw new Error(`Client not supported: ${clientId}`);
    return adapter.detect();
  }

  async getClientCurrent(clientId: ClientId): Promise<ClientCurrentState> {
    const adapter = this.adapters.get(clientId);
    if (!adapter) throw new Error(`Client not supported: ${clientId}`);
    return adapter.getCurrent();
  }

  async useClient(input: UseClientInput): Promise<UseClientResult> {
    const config = await this.store.load();
    aiAgentSwitchConfigSchema.parse(config);
    const registry = new ProviderRegistry(config);
    const ref = registry.resolveModelRef(input.target);
    const provider = registry.get(ref.providerId);
    if (!provider) throw new Error(`Provider not found: ${ref.providerId}`);

    const adapter = this.adapters.get(input.clientId);
    if (!adapter) throw new Error(`Client not supported: ${input.clientId}`);
    const validation = await adapter.validate();
    if (!validation.ok && existsSync(adapter.configPath)) {
      throw new Error(`Client config is invalid: ${validation.issues.join("; ")}`);
    }

    const plan = await adapter.planApply({ provider, modelId: ref.modelId });
    if (!input.yes) {
      return { applied: false, requiresConfirmation: true, plan };
    }

    await adapter.apply(plan);
    await this.stateStore.update((state) => {
      state.lastSwitch = {
        clientId: input.clientId,
        providerId: ref.providerId,
        modelId: ref.modelId,
        at: new Date().toISOString(),
      };
      return state;
    });
    return { applied: true, requiresConfirmation: false, plan };
  }

  async initAgentHub(input: InitAgentHubInput): Promise<InitAgentHubResult> {
    const existingProvider = existsSync(this.store.configPath)
      ? (await this.store.load()).providers[input.providerId]
      : undefined;
    const providerType = existingProvider?.type ?? "openai-chat-compatible";
    const models = normalizeAgentHubModels(input.modelId, input.availableModels);
    const provider = providerProfileSchema.parse({
      id: input.providerId,
      name: input.providerName,
      type: providerType,
      baseUrl: input.baseUrl,
      apiKeyEnv: input.apiKeyEnv,
      models,
      defaultModel: input.modelId,
    } satisfies ProviderProfile);

    const adapter = this.adapters.get(input.clientId);
    if (!adapter) throw new Error(`Client not supported: ${input.clientId}`);
    const validation = await adapter.validate();
    if (!validation.ok && existsSync(adapter.configPath)) {
      throw new Error(`Client config is invalid: ${validation.issues.join("; ")}`);
    }

    const plan = await adapter.planApply({ provider, modelId: input.modelId });

    if (!input.yes) {
      return {
        clientId: input.clientId,
        providerId: provider.id,
        modelId: input.modelId,
        modelType: input.modelType,
        providerType,
        configPath: adapter.configPath,
        applied: false,
        requiresConfirmation: true,
        plan,
      };
    }

    return this.applyAgentHubPlan({
      ...input,
      providerType,
      plan,
    });
  }

  async applyAgentHubPlan(input: ApplyAgentHubPlanInput): Promise<InitAgentHubResult> {
    const models = normalizeAgentHubModels(input.modelId, input.availableModels);
    const provider = providerProfileSchema.parse({
      id: input.providerId,
      name: input.providerName,
      type: input.providerType,
      baseUrl: input.baseUrl,
      apiKeyEnv: input.apiKeyEnv,
      models,
      defaultModel: input.modelId,
    } satisfies ProviderProfile);

    const adapter = this.adapters.get(input.clientId);
    if (!adapter) throw new Error(`Client not supported: ${input.clientId}`);

    await this.store.update((config) => {
      config.providers[provider.id] = provider;
      const currentCandidates = config.routes.default?.candidates ?? [];
      const nextCandidate = { providerId: provider.id, modelId: input.modelId };
      config.routes.default = {
        candidates: [
          nextCandidate,
          ...currentCandidates.filter((candidate) => candidate.providerId !== provider.id),
        ],
      };
      return config;
    });
    await adapter.apply(input.plan);
    await this.stateStore.update((state) => {
      state.lastSwitch = {
        clientId: input.clientId,
        providerId: provider.id,
        modelId: input.modelId,
        at: new Date().toISOString(),
      };
      return state;
    });
    return {
      clientId: input.clientId,
      providerId: provider.id,
      modelId: input.modelId,
      modelType: input.modelType,
      providerType: input.providerType,
      configPath: adapter.configPath,
      applied: true,
      requiresConfirmation: false,
      plan: input.plan,
    };
  }

  async useClientProxy(input: UseClientProxyInput): Promise<UseClientResult> {
    const config = await this.store.load();
    aiAgentSwitchConfigSchema.parse(config);
    const adapter = this.adapters.get(input.clientId);
    if (!adapter) throw new Error(`Client not supported: ${input.clientId}`);
    const validation = await adapter.validate();
    if (!validation.ok && existsSync(adapter.configPath)) {
      throw new Error(`Client config is invalid: ${validation.issues.join("; ")}`);
    }

    const modelId = "ai-agent-switch/default";
    const provider: ProviderProfile = {
      id: "ai-agent-switch-proxy",
      name: "AI Agent Switch Proxy",
      type: "openai-chat-compatible",
      baseUrl: proxyBaseUrl(config.proxy.host, config.proxy.port),
      models: [{ id: modelId }],
      defaultModel: modelId,
    };
    const plan = await adapter.planApply({ provider, modelId });
    if (!input.yes) {
      return { applied: false, requiresConfirmation: true, plan };
    }

    await adapter.apply(plan);
    await this.stateStore.update((state) => {
      state.lastSwitch = {
        clientId: input.clientId,
        providerId: provider.id,
        modelId,
        at: new Date().toISOString(),
      };
      return state;
    });
    return { applied: true, requiresConfirmation: false, plan };
  }

  async useAllClients(input: UseAllClientsInput): Promise<UseAllClientsResult> {
    const config = await this.store.load();
    aiAgentSwitchConfigSchema.parse(config);
    const registry = new ProviderRegistry(config);
    const ref = registry.resolveModelRef(input.target);
    const provider = registry.get(ref.providerId);
    if (!provider) throw new Error(`Provider not found: ${ref.providerId}`);

    const results: UseAllClientItem[] = [];
    for (const adapter of this.adapters.values()) {
      try {
        const validation = await adapter.validate();
        if (!validation.ok && existsSync(adapter.configPath)) {
          results.push({ clientId: adapter.id, status: "failed", reason: validation.issues.join("; ") });
          continue;
        }

        const plan = await adapter.planApply({ provider, modelId: ref.modelId });
        if (input.yes) {
          await adapter.apply(plan);
          results.push({ clientId: adapter.id, status: "applied", plan });
        } else {
          results.push({ clientId: adapter.id, status: "planned", plan });
        }
      } catch (error) {
        results.push({ clientId: adapter.id, status: "failed", reason: (error as Error).message });
      }
    }

    if (input.yes) {
      await this.stateStore.update((state) => {
        state.lastSwitch = {
          clientId: "all",
          providerId: ref.providerId,
          modelId: ref.modelId,
          at: new Date().toISOString(),
        };
        return state;
      });
    }

    return { applied: input.yes, results };
  }

  async applyPlan(plan: PatchPlan): Promise<void> {
    const adapter = this.adapters.get(plan.clientId);
    if (!adapter) throw new Error(`Client not supported: ${plan.clientId}`);
    await adapter.apply(plan);
  }

  async status(): Promise<AppStatus> {
    const config = await this.store.load();
    const clients = await Promise.all([...this.adapters.values()].map((adapter) => adapter.getCurrent()));
    return {
      configPath: this.store.configPath,
      statePath: this.store.statePath,
      providers: Object.values(config.providers).map(maskProvider),
      clients,
      proxy: config.proxy,
      routes: config.routes,
      state: await this.stateStore.load(),
    };
  }

  async doctor(): Promise<DoctorReport> {
    const checks: DoctorReport["checks"] = [];
    const configValidation = await this.store.validate();
    checks.push({
      name: "ai-agent-switch config",
      ok: configValidation.ok,
      detail: configValidation.ok ? this.store.configPath : configValidation.issues.join("; "),
    });

    for (const adapter of this.adapters.values()) {
      const validation = await adapter.validate();
      checks.push({
        name: `${adapter.displayName} config`,
        ok: validation.ok,
        detail: validation.ok ? adapter.configPath : validation.issues.join("; "),
      });
    }

    return {
      ok: checks.every((check) => check.ok),
      checks,
    };
  }
}

function proxyBaseUrl(host: string, port: number): string {
  const requestHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  return `http://${requestHost}:${port}/v1`;
}

function normalizeAgentHubModels(modelId: string, availableModels: AgentHubAvailableModel[]): ModelProfile[] {
  const seen = new Set<string>();
  const models = availableModels.flatMap((model) => {
    const id = model.id.trim();
    if (!id || seen.has(id)) return [];
    seen.add(id);
    return [{ id, type: model.type }];
  });
  if (!models.some((model) => model.id === modelId)) {
    throw new Error(`Model ${modelId} must be included in --available-model`);
  }
  return models;
}
