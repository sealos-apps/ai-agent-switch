import { join } from "node:path";
import { existsSync } from "node:fs";
import { BaseClientAdapter } from "./base";
import type { ApplyClientConfigInput, ClientCurrentState, ClientId, PatchPlan } from "./types";
import { parseJsonObject, readTextIfExists, recordAt, stringifyJson } from "./utils";

export class OpenCodeAdapter extends BaseClientAdapter {
  id: ClientId = "opencode";
  displayName = "OpenCode";
  configPath: string;
  protected override commandNames = ["opencode"];

  constructor(homeDir: string, cwd: string) {
    super();
    const candidates = [
      join(cwd, ".opencode.json"),
      join(homeDir, ".opencode.json"),
      join(homeDir, ".config", "opencode", ".opencode.json"),
    ];
    this.configPath = candidates.find((path) => existsSync(path)) ?? candidates[1]!;
  }

  async readConfig(): Promise<unknown> {
    return parseJsonObject(await readTextIfExists(this.configPath));
  }

  async planApply(input: ApplyClientConfigInput): Promise<PatchPlan> {
    const before = await readTextIfExists(this.configPath);
    const config = parseJsonObject(before);
    const providers = recordAt(config, "providers");
    providers[input.provider.id] = {
      apiKey: input.provider.apiKeyEnv ? `$${input.provider.apiKeyEnv}` : undefined,
      baseUrl: input.provider.baseUrl,
      disabled: false,
    };
    const agents = recordAt(config, "agents");
    agents.coder = { model: input.modelId, provider: input.provider.id };
    const file = before === undefined
      ? { path: this.configPath, after: stringifyJson(config) }
      : { path: this.configPath, before, after: stringifyJson(config) };
    return { clientId: this.id, summary: `Switch OpenCode to ${input.provider.id}/${input.modelId}`, files: [file] };
  }

  async getCurrent(): Promise<ClientCurrentState> {
    const config = parseJsonObject(await readTextIfExists(this.configPath));
    const agents = config.agents && typeof config.agents === "object" ? config.agents as Record<string, unknown> : {};
    const coder = agents.coder && typeof agents.coder === "object" ? agents.coder as Record<string, unknown> : {};
    return {
      clientId: this.id,
      providerId: typeof coder.provider === "string" ? coder.provider : undefined,
      modelId: typeof coder.model === "string" ? coder.model : undefined,
      configPath: this.configPath,
    };
  }
}
