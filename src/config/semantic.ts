import type { AiAgentSwitchConfig, ValidationResult } from "./schema";

export function validateConfigSemantics(config: AiAgentSwitchConfig): ValidationResult {
  const issues: string[] = [];

  for (const [providerKey, provider] of Object.entries(config.providers)) {
    if (provider.id !== providerKey) {
      issues.push(`providers.${providerKey}.id must match provider key, got: ${provider.id}`);
    }

    const modelIds = new Set(provider.models.map((model) => model.id));
    if (provider.defaultModel && !modelIds.has(provider.defaultModel)) {
      issues.push(`providers.${providerKey}.defaultModel does not exist in provider models: ${provider.defaultModel}`);
    }

    const duplicateModels = duplicates(provider.models.map((model) => model.id));
    for (const modelId of duplicateModels) {
      issues.push(`providers.${providerKey}.models contains duplicate model: ${modelId}`);
    }
  }

  const route = config.routes.default?.candidates ?? [];
  route.forEach((candidate, index) => {
    const provider = config.providers[candidate.providerId];
    if (!provider) {
      issues.push(`routes.default.candidates[${index}] provider not found: ${candidate.providerId}`);
      return;
    }
    if (!provider.models.some((model) => model.id === candidate.modelId)) {
      issues.push(`routes.default.candidates[${index}] model not found for provider ${candidate.providerId}: ${candidate.modelId}`);
    }
  });

  const duplicateRouteCandidates = duplicates(route.map((candidate) => `${candidate.providerId}/${candidate.modelId}`));
  for (const candidate of duplicateRouteCandidates) {
    issues.push(`routes.default.candidates contains duplicate candidate: ${candidate}`);
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) dupes.add(value);
    seen.add(value);
  }
  return [...dupes];
}
