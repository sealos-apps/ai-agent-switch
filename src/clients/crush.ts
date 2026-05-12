import { join } from "node:path";
import { existsSync } from "node:fs";
import { BaseClientAdapter } from "./base";
import { normalizeProviderType, type ProviderType } from "../config/schema";
import type { ApplyClientConfigInput, ClientCurrentState, ClientId, PatchPlan } from "./types";
import { parseJsonObject, readTextIfExists, recordAt, stringifyJson } from "./utils";

export class CrushAdapter extends BaseClientAdapter {
  id: ClientId = "crush";
  displayName = "Crush";
  configPath: string;
  protected override commandNames = ["crush"];

  constructor(homeDir: string, cwd: string) {
    super();
    const candidates = [join(cwd, ".crush.json"), join(cwd, "crush.json"), join(homeDir, ".config", "crush", "crush.json")];
    this.configPath = candidates.find((path) => existsSync(path)) ?? candidates[2]!;
  }

  async readConfig(): Promise<unknown> {
    return parseJsonObject(await readTextIfExists(this.configPath));
  }

  async planApply(input: ApplyClientConfigInput): Promise<PatchPlan> {
    const before = await readTextIfExists(this.configPath);
    const config = parseJsonObject(before);
    const providers = recordAt(config, "providers");
    providers[input.provider.id] = {
      type: crushProviderType(input.provider.type),
      base_url: input.provider.baseUrl,
      api_key: input.provider.apiKeyEnv ? `$${input.provider.apiKeyEnv}` : undefined,
      models: input.provider.models.map((model) => ({ id: model.id, name: model.name ?? model.id })),
    };
    const models = recordAt(config, "models");
    models.large = { provider: input.provider.id, model: input.modelId };
    const file = before === undefined
      ? { path: this.configPath, after: stringifyJson(config) }
      : { path: this.configPath, before, after: stringifyJson(config) };
    return { clientId: this.id, summary: `Switch Crush to ${input.provider.id}/${input.modelId}`, files: [file] };
  }

  async getCurrent(): Promise<ClientCurrentState> {
    const config = parseJsonObject(await readTextIfExists(this.configPath));
    const models = config.models && typeof config.models === "object" ? config.models as Record<string, unknown> : {};
    const large = models.large && typeof models.large === "object" ? models.large as Record<string, unknown> : {};
    return {
      clientId: this.id,
      providerId: typeof large.provider === "string" ? large.provider : undefined,
      modelId: typeof large.model === "string" ? large.model : undefined,
      configPath: this.configPath,
    };
  }
}

function crushProviderType(type: ProviderType): string {
  const normalized = normalizeProviderType(type);
  if (normalized === "openai-chat-compatible") return "openai-compat";
  if (normalized === "openai-responses") return "openai";
  return normalized;
}
