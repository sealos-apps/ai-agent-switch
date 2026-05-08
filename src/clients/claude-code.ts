import { join } from "node:path";
import { BaseClientAdapter } from "./base";
import type { ApplyClientConfigInput, ClientCurrentState, ClientId, PatchPlan } from "./types";
import { parseJsonObject, readTextIfExists, recordAt, stringifyJson } from "./utils";

export class ClaudeCodeAdapter extends BaseClientAdapter {
  id: ClientId = "claude-code";
  displayName = "Claude Code";
  configPath: string;
  protected override commandNames = ["claude"];

  constructor(homeDir: string) {
    super();
    this.configPath = join(homeDir, ".claude", "settings.json");
  }

  async readConfig(): Promise<unknown> {
    return parseJsonObject(await readTextIfExists(this.configPath));
  }

  async planApply(input: ApplyClientConfigInput): Promise<PatchPlan> {
    const before = await readTextIfExists(this.configPath);
    const config = parseJsonObject(before);
    const agentSwitch = recordAt(config, "agentSwitch");
    agentSwitch.provider = input.provider.id;
    agentSwitch.model = input.modelId;
    agentSwitch.baseUrl = input.provider.baseUrl;
    agentSwitch.apiKeyEnv = input.provider.apiKeyEnv ?? (input.provider.apiKey?.kind === "env" ? input.provider.apiKey.name : undefined);
    const file = before === undefined
      ? { path: this.configPath, after: stringifyJson(config) }
      : { path: this.configPath, before, after: stringifyJson(config) };
    return { clientId: this.id, summary: `记录 Claude Code agent-switch 配置 ${input.provider.id}/${input.modelId}`, files: [file] };
  }

  async getCurrent(): Promise<ClientCurrentState> {
    const config = parseJsonObject(await readTextIfExists(this.configPath));
    const agentSwitch = config.agentSwitch && typeof config.agentSwitch === "object" ? config.agentSwitch as Record<string, unknown> : {};
    return {
      clientId: this.id,
      providerId: typeof agentSwitch.provider === "string" ? agentSwitch.provider : undefined,
      modelId: typeof agentSwitch.model === "string" ? agentSwitch.model : undefined,
      configPath: this.configPath,
    };
  }
}
