import type { ProviderProfile, ValidationResult } from "../config/schema";

export type ClientId =
  | "codex"
  | "gemini"
  | "qwen"
  | "openclaw"
  | "hermes"
  | "crush"
  | "opencode"
  | "cowagent"
  | "claude-code";

export type ClientDetection = {
  installed: boolean;
  executableAvailable: boolean;
  command?: string | undefined;
  configPath: string;
  configExists: boolean;
  details: string[];
};

export type ClientCurrentState = {
  clientId: ClientId;
  providerId?: string | undefined;
  modelId?: string | undefined;
  configPath: string;
};

export type ApplyClientConfigInput = {
  provider: ProviderProfile;
  modelId: string;
};

export type PatchFile = {
  path: string;
  before?: string | undefined;
  after: string;
};

export type PatchPlan = {
  clientId: ClientId;
  summary: string;
  files: PatchFile[];
};

export interface ClientAdapter {
  id: ClientId;
  displayName: string;
  configPath: string;
  detect(): Promise<ClientDetection>;
  readConfig(): Promise<unknown>;
  planApply(input: ApplyClientConfigInput): Promise<PatchPlan>;
  apply(plan: PatchPlan): Promise<void>;
  getCurrent(): Promise<ClientCurrentState>;
  validate(): Promise<ValidationResult>;
}

export type ClientAdapterOptions = {
  homeDir: string;
  cwd: string;
};

export type CommandExists = (command: string) => Promise<boolean>;

export type DetectionOptions = {
  commandExists?: CommandExists | undefined;
};
