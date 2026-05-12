import { join } from "node:path";
import type { ProviderProfile } from "../config/schema";
import { BaseClientAdapter } from "./base";
import type { ApplyClientConfigInput, ClientCurrentState, ClientId, DetectionOptions, PatchPlan } from "./types";
import { parseJsonObject, readTextIfExists, recordAt, stringifyJson } from "./utils";

export class QwenAdapter extends BaseClientAdapter {
  id: ClientId = "qwen";
  displayName = "Qwen Code";
  configPath: string;
  protected override commandNames = ["qwen"];

  constructor(homeDir: string, options: DetectionOptions = {}) {
    super(options);
    this.configPath = join(homeDir, ".qwen", "settings.json");
  }

  async readConfig(): Promise<unknown> {
    return parseJsonObject(await readTextIfExists(this.configPath));
  }

  async planApply(input: ApplyClientConfigInput): Promise<PatchPlan> {
    const before = await readTextIfExists(this.configPath);
    const config = parseJsonObject(before);
    applyQwenSettings(config, input.provider, input.modelId);
    const file = before === undefined
      ? { path: this.configPath, after: stringifyJson(config) }
      : { path: this.configPath, before, after: stringifyJson(config) };
    return {
      clientId: this.id,
      summary: `Switch Qwen Code to ${input.provider.id}/${input.modelId}`,
      files: [file],
    };
  }

  async getCurrent(): Promise<ClientCurrentState> {
    const config = parseJsonObject(await readTextIfExists(this.configPath));
    const model = config.model && typeof config.model === "object" ? config.model as Record<string, unknown> : {};
    const security = config.security && typeof config.security === "object" ? config.security as Record<string, unknown> : {};
    const auth = security.auth && typeof security.auth === "object" ? security.auth as Record<string, unknown> : {};
    return {
      clientId: this.id,
      providerId: typeof auth.selectedType === "string" ? auth.selectedType : undefined,
      modelId: typeof model.name === "string" ? model.name : undefined,
      configPath: this.configPath,
    };
  }
}

function applyQwenSettings(config: Record<string, unknown>, provider: ProviderProfile, modelId: string): void {
  const model = recordAt(config, "model");
  model.name = modelId;

  const security = recordAt(config, "security");
  const auth = recordAt(security, "auth");
  auth.selectedType = provider.id;

  const providers = recordAt(config, "modelProviders");
  providers[provider.id] = {
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    envKey: provider.apiKeyEnv ?? (provider.apiKey?.kind === "env" ? provider.apiKey.name : undefined),
    description: `Managed by ai-agent-switch (${provider.type})`,
  };
}
