import type { ProviderProfile, ProxyConfig, ValidationResult } from "../config/schema";

export type FetchWithProxy = (
  url: string | URL,
  init: RequestInit & { proxy?: string; signal?: AbortSignal },
) => Promise<Response>;

export async function testProviderConnectivity(
  provider: ProviderProfile,
  proxy: ProxyConfig,
  fetcher: FetchWithProxy = fetch as FetchWithProxy,
): Promise<ValidationResult> {
  if (!provider.baseUrl) {
    return { ok: false, issues: [`Provider ${provider.id} missing baseUrl`] };
  }

  try {
    const init: RequestInit & { proxy?: string; signal?: AbortSignal } = {
      method: "GET",
      signal: AbortSignal.timeout(5_000),
    };
    if (proxy.upstreamProxy) init.proxy = proxy.upstreamProxy;
    const response = await fetcher(provider.baseUrl, init);
    if (response.status >= 500) {
      return { ok: false, issues: [`HTTP ${response.status} from ${provider.baseUrl}`] };
    }
    return { ok: true, issues: [] };
  } catch (error) {
    return { ok: false, issues: [(error as Error).message] };
  }
}
