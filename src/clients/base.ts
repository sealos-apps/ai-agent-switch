import { existsSync } from "node:fs";
import type {
  ClientAdapter,
  ClientCurrentState,
  ClientDetection,
  CommandExists,
  DetectionOptions,
  PatchPlan,
} from "./types";
import { applyPatchPlan, commandExists } from "./utils";
import type { ValidationResult } from "../config/schema";

export abstract class BaseClientAdapter implements ClientAdapter {
  abstract id: ClientAdapter["id"];
  abstract displayName: string;
  abstract configPath: string;
  protected commandNames: string[] = [];
  private readonly commandExists: CommandExists;

  constructor(options: DetectionOptions = {}) {
    this.commandExists = options.commandExists ?? commandExists;
  }

  abstract readConfig(): Promise<unknown>;
  abstract planApply(input: Parameters<ClientAdapter["planApply"]>[0]): Promise<PatchPlan>;
  abstract getCurrent(): Promise<ClientCurrentState>;

  async detect(): Promise<ClientDetection> {
    const configExists = existsSync(this.configPath);
    const command = await this.findCommand();
    const executableAvailable = command !== undefined;
    const details = [
      executableAvailable ? `命令可用：${command}` : "未检测到命令",
      configExists ? "配置文件已存在" : "未找到配置文件，写入时会懒创建",
    ];

    return {
      installed: executableAvailable || configExists,
      executableAvailable,
      command,
      configPath: this.configPath,
      configExists,
      details,
    };
  }

  async apply(plan: PatchPlan): Promise<void> {
    await applyPatchPlan(plan);
  }

  async validate(): Promise<ValidationResult> {
    try {
      await this.readConfig();
      return { ok: true, issues: [] };
    } catch (error) {
      return { ok: false, issues: [(error as Error).message] };
    }
  }

  private async findCommand(): Promise<string | undefined> {
    for (const command of this.commandNames) {
      if (await this.commandExists(command)) return command;
    }
    return undefined;
  }
}
