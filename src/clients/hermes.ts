import { join } from "node:path";
import { BaseClientAdapter } from "./base";
import type { ApplyClientConfigInput, ClientCurrentState, ClientId, PatchPlan, PatchFile } from "./types";
import { envKeyForProvider, parseYamlObject, readTextIfExists, recordAt, stringifyYamlObject, writeEnvValue } from "./utils";
import { writeAtomic } from "../fs/atomic";

export class HermesAdapter extends BaseClientAdapter {
  id: ClientId = "hermes";
  displayName = "Hermes Agent";
  configPath: string;
  protected override commandNames = ["hermes"];
  private readonly envPath: string;

  constructor(homeDir: string) {
    super();
    const hermesHome = process.env.HERMES_HOME ?? join(homeDir, ".hermes");
    this.configPath = join(hermesHome, "config.yaml");
    this.envPath = join(hermesHome, ".env");
  }

  async readConfig(): Promise<unknown> {
    return parseYamlObject(await readTextIfExists(this.configPath));
  }

  async planApply(input: ApplyClientConfigInput): Promise<PatchPlan> {
    const before = await readTextIfExists(this.configPath);
    const config = parseYamlObject(before);
    config.current_provider = input.provider.id;
    config.current_model = input.modelId;
    const providers = recordAt(config, "providers");
    providers[input.provider.id] = {
      name: input.provider.name,
      type: input.provider.type,
      base_url: input.provider.baseUrl,
      api_key_env: input.provider.apiKeyEnv ?? (input.provider.apiKey?.kind === "env" ? input.provider.apiKey.name : envKeyForProvider(input.provider.id)),
      models: input.provider.models.map((model) => model.id),
    };

    const files: PatchFile[] = [
      before === undefined
        ? { path: this.configPath, after: stringifyYamlObject(config) }
        : { path: this.configPath, before, after: stringifyYamlObject(config) },
    ];

    if (input.provider.apiKey?.kind === "inline") {
      const envBefore = await readTextIfExists(this.envPath);
      const key = input.provider.apiKeyEnv ?? envKeyForProvider(input.provider.id);
      const assignment = `${key}=${JSON.stringify(input.provider.apiKey.value)}\n`;
      const envAfter = envBefore ? mergeEnv(envBefore, key, assignment.trimEnd()) : assignment;
      files.push(envBefore === undefined ? { path: this.envPath, after: envAfter } : { path: this.envPath, before: envBefore, after: envAfter });
    }

    return { clientId: this.id, summary: `将 Hermes Agent 切换到 ${input.provider.id}/${input.modelId}`, files };
  }

  override async apply(plan: PatchPlan): Promise<void> {
    for (const file of plan.files) {
      if (file.path.endsWith(".env")) {
        const match = file.after.match(/^([^=]+)=(.*)$/m);
        if (match) {
          await writeEnvValue(file.path, match[1]!, JSON.parse(match[2]!));
          continue;
        }
      }
      await writeAtomic(file.path, file.after);
    }
  }

  async getCurrent(): Promise<ClientCurrentState> {
    const config = parseYamlObject(await readTextIfExists(this.configPath));
    return {
      clientId: this.id,
      providerId: typeof config.current_provider === "string" ? config.current_provider : undefined,
      modelId: typeof config.current_model === "string" ? config.current_model : undefined,
      configPath: this.configPath,
    };
  }
}

function mergeEnv(text: string, key: string, assignment: string): string {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const next = lines.some((line) => line.startsWith(`${key}=`))
    ? lines.map((line) => (line.startsWith(`${key}=`) ? assignment : line))
    : [...lines, assignment];
  return `${next.join("\n")}\n`;
}
