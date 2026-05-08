import { join } from "node:path";
import { BaseClientAdapter } from "./base";
import type { ApplyClientConfigInput, ClientCurrentState, ClientId, PatchPlan } from "./types";
import { parseTomlObject, readTextIfExists, recordAt, stringifyTomlObject } from "./utils";

export class CodexAdapter extends BaseClientAdapter {
  id: ClientId = "codex";
  displayName = "OpenAI Codex";
  configPath: string;
  protected override commandNames = ["codex"];

  constructor(homeDir: string) {
    super();
    this.configPath = join(homeDir, ".codex", "config.toml");
  }

  async readConfig(): Promise<unknown> {
    return parseTomlObject(await readTextIfExists(this.configPath));
  }

  async planApply(input: ApplyClientConfigInput): Promise<PatchPlan> {
    const before = await readTextIfExists(this.configPath);
    const config = parseTomlObject(before);
    config.model = input.modelId;
    config.model_provider = input.provider.id;

    const providers = recordAt(config, "model_providers");
    providers[input.provider.id] = {
      name: input.provider.name,
      base_url: input.provider.baseUrl,
      env_key: input.provider.apiKeyEnv ?? (input.provider.apiKey?.kind === "env" ? input.provider.apiKey.name : undefined),
      wire_api: input.provider.type === "openai-compatible" || input.provider.type === "openrouter" ? "responses" : undefined,
    };

    const file = before === undefined
      ? { path: this.configPath, after: stringifyTomlObject(config) }
      : { path: this.configPath, before, after: stringifyTomlObject(config) };
    return { clientId: this.id, summary: `将 Codex 切换到 ${input.provider.id}/${input.modelId}`, files: [file] };
  }

  async getCurrent(): Promise<ClientCurrentState> {
    const config = parseTomlObject(await readTextIfExists(this.configPath));
    return {
      clientId: this.id,
      providerId: typeof config.model_provider === "string" ? config.model_provider : undefined,
      modelId: typeof config.model === "string" ? config.model : undefined,
      configPath: this.configPath,
    };
  }
}
