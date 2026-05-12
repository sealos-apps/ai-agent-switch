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
    const aiAgentSwitch = recordAt(config, "aiAgentSwitch");
    aiAgentSwitch.provider = input.provider.id;
    aiAgentSwitch.model = input.modelId;
    aiAgentSwitch.baseUrl = input.provider.baseUrl;
    aiAgentSwitch.apiKeyEnv = input.provider.apiKeyEnv ?? (input.provider.apiKey?.kind === "env" ? input.provider.apiKey.name : undefined);
    const file = before === undefined
      ? { path: this.configPath, after: stringifyJson(config) }
      : { path: this.configPath, before, after: stringifyJson(config) };
    return { clientId: this.id, summary: `Record Claude Code ai-agent-switch config ${input.provider.id}/${input.modelId}`, files: [file] };
  }

  async getCurrent(): Promise<ClientCurrentState> {
    const config = parseJsonObject(await readTextIfExists(this.configPath));
    const aiAgentSwitch = config.aiAgentSwitch && typeof config.aiAgentSwitch === "object" ? config.aiAgentSwitch as Record<string, unknown> : {};
    return {
      clientId: this.id,
      providerId: typeof aiAgentSwitch.provider === "string" ? aiAgentSwitch.provider : undefined,
      modelId: typeof aiAgentSwitch.model === "string" ? aiAgentSwitch.model : undefined,
      configPath: this.configPath,
    };
  }
}
