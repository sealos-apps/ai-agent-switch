import { join } from "node:path";
import { BaseClientAdapter } from "./base";
import type { ApplyClientConfigInput, ClientCurrentState, ClientId, PatchPlan } from "./types";
import { parseJsoncObject, readTextIfExists, recordAt, stringifyJson } from "./utils";

export class OpenClawAdapter extends BaseClientAdapter {
  id: ClientId = "openclaw";
  displayName = "OpenClaw";
  configPath: string;
  protected override commandNames = ["openclaw"];

  constructor(homeDir: string) {
    super();
    const openclawHome = process.env.OPENCLAW_HOME ?? join(homeDir, ".openclaw");
    this.configPath = process.env.OPENCLAW_CONFIG_PATH ?? join(openclawHome, "openclaw.json");
  }

  async readConfig(): Promise<unknown> {
    return parseJsoncObject(await readTextIfExists(this.configPath));
  }

  async planApply(input: ApplyClientConfigInput): Promise<PatchPlan> {
    const before = await readTextIfExists(this.configPath);
    const config = parseJsoncObject(before);
    const agents = recordAt(config, "agents");
    const defaults = recordAt(agents, "defaults");
    const model = recordAt(defaults, "model");
    model.primary = `${input.provider.id}/${input.modelId}`;
    const models = recordAt(config, "models");
    const providers = recordAt(models, "providers");
    providers[input.provider.id] = {
      baseUrl: input.provider.baseUrl,
      apiKey: input.provider.apiKeyEnv ? `$${input.provider.apiKeyEnv}` : undefined,
      api: input.provider.type,
      models: input.provider.models.map((item) => item.id),
    };
    const file = before === undefined
      ? { path: this.configPath, after: stringifyJson(config) }
      : { path: this.configPath, before, after: stringifyJson(config) };
    return { clientId: this.id, summary: `将 OpenClaw 默认模型切换到 ${input.provider.id}/${input.modelId}`, files: [file] };
  }

  async getCurrent(): Promise<ClientCurrentState> {
    const config = parseJsoncObject(await readTextIfExists(this.configPath));
    const agents = config.agents && typeof config.agents === "object" ? config.agents as Record<string, unknown> : {};
    const defaults = agents.defaults && typeof agents.defaults === "object" ? agents.defaults as Record<string, unknown> : {};
    const model = defaults.model && typeof defaults.model === "object" ? defaults.model as Record<string, unknown> : {};
    const primary = typeof model.primary === "string" ? model.primary : undefined;
    const slash = primary?.indexOf("/") ?? -1;
    return {
      clientId: this.id,
      providerId: slash > 0 ? primary?.slice(0, slash) : undefined,
      modelId: slash > 0 ? primary?.slice(slash + 1) : primary,
      configPath: this.configPath,
    };
  }
}
