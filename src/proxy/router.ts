export type ProxyAttemptInput<TProvider> = {
  provider: TProvider;
  attempt: number;
};

export type RouteWithFailoverInput<TProvider> = {
  providers: TProvider[];
  retry: { enabled: boolean; maxAttempts: number };
  failover: { enabled: boolean; strategy?: string };
  request: (input: ProxyAttemptInput<TProvider>) => Promise<Response>;
};

export type RouteResult<TProvider> = {
  response: Response;
  provider: TProvider;
  attempts: number;
};

export async function routeWithFailover<TProvider>(input: RouteWithFailoverInput<TProvider>): Promise<RouteResult<TProvider>> {
  if (input.providers.length === 0) {
    throw new Error("No providers available for proxy routing");
  }

  const providerList = input.failover.enabled ? input.providers : [input.providers[0]!];
  const maxAttempts = input.retry.enabled ? input.retry.maxAttempts : 1;
  let lastError: unknown;
  let attempts = 0;

  for (const provider of providerList) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      attempts++;
      try {
        const response = await input.request({ provider, attempt });
        if (response.ok || response.status < 500) {
          return { response, provider, attempts };
        }
        lastError = new Error(`Upstream returned ${response.status}`);
      } catch (error) {
        lastError = error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Proxy routing failed");
}
