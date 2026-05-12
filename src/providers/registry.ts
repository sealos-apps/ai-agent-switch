import { createDefaultConfig, type AiAgentSwitchConfig, type ProviderProfile } from "../config/schema";
import { parseUseTarget } from "../cli/use";

export class ProviderRegistry {
  constructor(private readonly config: AiAgentSwitchConfig) {}

  static empty(): ProviderRegistry {
    return new ProviderRegistry(createDefaultConfig());
  }

  list(): ProviderProfile[] {
    return Object.values(this.config.providers);
  }

  safeList(): ProviderProfile[] {
    return this.list().map((provider) => maskProvider(provider));
  }

  get(id: string): ProviderProfile | undefined {
    return this.config.providers[id];
  }

  upsert(provider: ProviderProfile): void {
    this.config.providers[provider.id] = provider;
  }

  remove(id: string): boolean {
    if (!this.config.providers[id]) return false;
    delete this.config.providers[id];
    return true;
  }

  resolveModelRef(value: string): { providerId: string; modelId: string } {
    const parsed = parseUseTarget(value);
    const provider = this.get(parsed.providerId);
    if (!provider) throw new Error(`Provider not found: ${parsed.providerId}`);
    if (!provider.models.some((model) => model.id === parsed.modelId)) {
      throw new Error(`Model not found for provider ${parsed.providerId}: ${parsed.modelId}`);
    }
    return parsed;
  }
}

export function maskProvider(provider: ProviderProfile): ProviderProfile {
  const copy = structuredClone(provider);
  if (copy.apiKey?.kind === "inline") {
    copy.apiKey.value = maskSecret(copy.apiKey.value);
  }
  return copy;
}

export function maskSecret(value: string): string {
  if (value.length <= 6) return "*".repeat(value.length);
  return `${value.slice(0, 4)}${"*".repeat(Math.max(10, value.length - 6))}${value.slice(-2)}`;
}
