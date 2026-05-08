export type ProviderModelRef = {
  providerId: string;
  modelId: string;
};

export function parseUseTarget(value: string): ProviderModelRef {
  const slash = value.indexOf("/");
  if (slash <= 0 || slash === value.length - 1) {
    throw new Error("Expected provider/model");
  }

  return {
    providerId: value.slice(0, slash),
    modelId: value.slice(slash + 1),
  };
}
