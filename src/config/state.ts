import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { parse } from "jsonc-parser";
import type { ClientId } from "../clients";
import { writeAtomic } from "../fs/atomic";

export type AiAgentSwitchState = {
  version: 1;
  lastSwitch?: {
    clientId: ClientId | "all";
    providerId: string;
    modelId: string;
    at: string;
  } | undefined;
  proxy?: {
    pid?: number | undefined;
    startedAt?: string | undefined;
    lastError?: string | undefined;
  } | undefined;
};

export class StateStore {
  constructor(readonly statePath: string) {}

  async load(): Promise<AiAgentSwitchState> {
    if (!existsSync(this.statePath)) return createDefaultState();
    const text = await readFile(this.statePath, "utf8");
    const parsed = parse(text) as unknown;
    if (!parsed || typeof parsed !== "object") return createDefaultState();
    return { ...createDefaultState(), ...(parsed as Partial<AiAgentSwitchState>) };
  }

  async update(mutator: (state: AiAgentSwitchState) => AiAgentSwitchState | void): Promise<AiAgentSwitchState> {
    const draft = await this.load();
    const next = mutator(draft) ?? draft;
    await writeAtomic(this.statePath, `${JSON.stringify(next, null, 2)}\n`);
    return next;
  }
}

export function createDefaultState(): AiAgentSwitchState {
  return { version: 1 };
}
