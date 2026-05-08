import { homedir } from "node:os";
import { CodexAdapter } from "./codex";
import { GeminiAdapter } from "./gemini";
import { QwenAdapter } from "./qwen";
import { OpenClawAdapter } from "./openclaw";
import { HermesAdapter } from "./hermes";
import { CrushAdapter } from "./crush";
import { OpenCodeAdapter } from "./opencode";
import { ClaudeCodeAdapter } from "./claude-code";
import type { ClientAdapter, ClientAdapterOptions, ClientId } from "./types";

export function createClientAdapters(options: Partial<ClientAdapterOptions> = {}): Map<ClientId, ClientAdapter> {
  const homeDir = options.homeDir ?? homedir();
  const cwd = options.cwd ?? process.cwd();
  const adapters: ClientAdapter[] = [
    new CodexAdapter(homeDir),
    new GeminiAdapter(homeDir),
    new QwenAdapter(homeDir),
    new OpenClawAdapter(homeDir),
    new HermesAdapter(homeDir),
    new CrushAdapter(homeDir, cwd),
    new OpenCodeAdapter(homeDir, cwd),
    new ClaudeCodeAdapter(homeDir),
  ];
  return new Map(adapters.map((adapter) => [adapter.id, adapter]));
}

export type {
  ApplyClientConfigInput,
  ClientAdapter,
  ClientCurrentState,
  ClientDetection,
  ClientId,
  PatchFile,
  PatchPlan,
} from "./types";
