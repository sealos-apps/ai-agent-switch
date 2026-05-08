import { join } from "node:path";
import { BaseClientAdapter } from "./base";
import type { ApplyClientConfigInput, ClientCurrentState, ClientId, PatchPlan } from "./types";
import { parseJsonObject, readTextIfExists, recordAt, stringifyJson } from "./utils";

export class GeminiAdapter extends BaseClientAdapter {
  id: ClientId = "gemini";
  displayName = "Gemini CLI";
  configPath: string;
  protected override commandNames = ["gemini"];

  constructor(homeDir: string) {
    super();
    this.configPath = join(homeDir, ".gemini", "settings.json");
  }

  async readConfig(): Promise<unknown> {
    return parseJsonObject(await readTextIfExists(this.configPath));
  }

  async planApply(input: ApplyClientConfigInput): Promise<PatchPlan> {
    const before = await readTextIfExists(this.configPath);
    const config = parseJsonObject(before);
    const model = recordAt(config, "model");
    model.name = input.modelId;
    const auth = recordAt(config, "auth");
    auth.selectedType = input.provider.id;
    const providers = recordAt(config, "modelProviders");
    providers[input.provider.id] = {
      id: input.provider.id,
      name: input.provider.name,
      type: input.provider.type,
      baseUrl: input.provider.baseUrl,
      envKey: input.provider.apiKeyEnv ?? (input.provider.apiKey?.kind === "env" ? input.provider.apiKey.name : undefined),
    };
    const file = before === undefined
      ? { path: this.configPath, after: stringifyJson(config) }
      : { path: this.configPath, before, after: stringifyJson(config) };
    return { clientId: this.id, summary: `将 Gemini CLI 切换到 ${input.provider.id}/${input.modelId}`, files: [file] };
  }

  async getCurrent(): Promise<ClientCurrentState> {
    const config = parseJsonObject(await readTextIfExists(this.configPath));
    const model = config.model && typeof config.model === "object" ? config.model as Record<string, unknown> : {};
    const auth = config.auth && typeof config.auth === "object" ? config.auth as Record<string, unknown> : {};
    return {
      clientId: this.id,
      providerId: typeof auth.selectedType === "string" ? auth.selectedType : undefined,
      modelId: typeof model.name === "string" ? model.name : undefined,
      configPath: this.configPath,
    };
  }
}
