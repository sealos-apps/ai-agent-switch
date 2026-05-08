import { mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { applyEdits, format, modify, parse, ParseError, printParseErrorCode } from "jsonc-parser";
import {
  agentSwitchConfigSchema,
  createDefaultConfig,
  type AgentSwitchConfig,
  type ValidationResult,
} from "./schema";
import { validateConfigSemantics } from "./semantic";
import { withFileLock, writeAtomic } from "../fs/atomic";

export type ConfigStoreOptions = {
  homeDir?: string;
  configPath?: string;
};

const topLevelKeys = ["version", "clients", "providers", "routes", "proxy", "ui"] as const;

export class ConfigStore {
  readonly homeDir: string;
  readonly configDir: string;
  readonly configPath: string;
  readonly statePath: string;

  constructor(options: ConfigStoreOptions = {}) {
    this.homeDir = options.homeDir ?? homedir();
    this.configDir = process.env.AGENT_SWITCH_HOME ?? join(this.homeDir, ".agent-switch");
    this.configPath = options.configPath ?? join(this.configDir, "config.jsonc");
    this.statePath = join(this.configDir, "state.jsonc");
  }

  async ensure(): Promise<void> {
    await mkdir(dirname(this.configPath), { recursive: true });
    if (!existsSync(this.configPath)) {
      await writeAtomic(this.configPath, `${stringifyConfig(createDefaultConfig())}\n`);
    }
  }

  async load(): Promise<AgentSwitchConfig> {
    await this.ensure();
    const text = await readFile(this.configPath, "utf8");
    const errors: ParseError[] = [];
    const data = parse(text, errors, { allowTrailingComma: true });
    if (errors.length > 0) {
      const issue = errors.map((error) => printParseErrorCode(error.error)).join(", ");
      throw new Error(`Invalid JSONC config: ${issue}`);
    }
    return agentSwitchConfigSchema.parse(data);
  }

  async validate(): Promise<ValidationResult> {
    try {
      const config = await this.load();
      return validateConfigSemantics(config);
    } catch (error) {
      return { ok: false, issues: [(error as Error).message] };
    }
  }

  async update(mutator: (config: AgentSwitchConfig) => AgentSwitchConfig | void): Promise<AgentSwitchConfig> {
    return withFileLock(this.configPath, async () => {
      const current = await this.load();
      const draft = structuredClone(current);
      const next = mutator(draft) ?? draft;
      const parsed = agentSwitchConfigSchema.parse(next);
      const original = await readFile(this.configPath, "utf8");
      let text = original;

      for (const key of topLevelKeys) {
        text = applyEdits(
          text,
          modify(text, [key], parsed[key], {
            formattingOptions: { insertSpaces: true, tabSize: 2, eol: "\n" },
            getInsertionIndex: (properties) => properties.length,
          }),
        );
      }

      text = applyEdits(text, format(text, undefined, { insertSpaces: true, tabSize: 2, eol: "\n" }));
      await writeAtomic(this.configPath, text.endsWith("\n") ? text : `${text}\n`);
      return parsed;
    });
  }
}

export function stringifyConfig(config: AgentSwitchConfig): string {
  return `{
  // agent-switch user configuration. You can edit this file by hand.
  "version": ${config.version},
  "clients": ${JSON.stringify(config.clients, null, 2).replaceAll("\n", "\n  ")},
  "providers": ${JSON.stringify(config.providers, null, 2).replaceAll("\n", "\n  ")},
  "routes": ${JSON.stringify(config.routes, null, 2).replaceAll("\n", "\n  ")},
  "proxy": ${JSON.stringify(config.proxy, null, 2).replaceAll("\n", "\n  ")},
  "ui": ${JSON.stringify(config.ui, null, 2).replaceAll("\n", "\n  ")}
}`;
}
