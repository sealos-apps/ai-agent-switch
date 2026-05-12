import { readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { AiAgentSwitchApp } from "../core/app";
import type { AiAgentSwitchConfig, ProviderProfile, RouteCandidate } from "../config/schema";
import { routeWithFailover } from "./router";

export type ProxyStartOptions = {
  homeDir?: string;
  cwd?: string;
};

export type ProxyFetch = (
  url: string | URL,
  init: RequestInit & { duplex: "half"; proxy?: string },
) => Promise<Response>;

export type ProxyRouteCandidate = {
  provider: ProviderProfile;
  modelId: string;
};

type ProxyDaemonSpawnOptions = {
  stdout: "ignore";
  stderr: "ignore";
  stdin: "ignore";
  env: Record<string, string | undefined>;
  detached: boolean;
};

type ProxyDaemonProcess = {
  pid: number;
  unref(): void;
};

type ProxyDaemonSpawn = (command: string[], options: ProxyDaemonSpawnOptions) => ProxyDaemonProcess;

type ProxyModelEntry = {
  id: string;
  object: "model";
  owned_by: string;
};

export async function startProxy(options: ProxyStartOptions = {}): Promise<void> {
  const app = new AiAgentSwitchApp(options);
  const config = await app.loadConfig();
  assertProxyStartAllowed(config);

  const pidPath = join(app.store.configDir, "proxy.pid");
  await writeFile(pidPath, String(process.pid), { mode: 0o600 });
  await app.stateStore.update((state) => {
    state.proxy = { ...(state.proxy ?? {}), pid: process.pid, startedAt: new Date().toISOString() };
    return state;
  });

  const server = Bun.serve({
    hostname: config.proxy.host,
    port: config.proxy.port,
    async fetch(request) {
      return handleProxyRequest(config, request);
    },
  });

  const shutdown = async () => {
    server.stop(true);
    await rm(pidPath, { force: true });
    await app.stateStore.update((state) => {
      state.proxy = { ...(state.proxy ?? {}), pid: undefined };
      return state;
    });
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());

  console.log(`ai-agent-switch proxy listening on http://${server.hostname}:${server.port}`);
  await new Promise(() => undefined);
}

export function assertProxyStartAllowed(config: AiAgentSwitchConfig): void {
  if (!config.proxy.enabled) {
    throw new Error("Proxy is disabled. Run `ai-agent-switch proxy enable` first.");
  }
  if (resolveProxyRouteCandidates(config).length === 0) {
    throw new Error("No providers configured. Add a provider before starting proxy.");
  }
}

export function startProxyDaemon(spawn: ProxyDaemonSpawn = Bun.spawn as ProxyDaemonSpawn): number {
  const script = process.argv[1];
  if (!script) throw new Error("Cannot determine current CLI path");
  const proc = spawn([process.execPath, script, "proxy", "start", "--foreground"], {
    stdout: "ignore",
    stderr: "ignore",
    stdin: "ignore",
    env: process.env,
    detached: true,
  });
  proc.unref();
  return proc.pid;
}

export async function proxyStatus(options: ProxyStartOptions = {}): Promise<{ running: boolean; pid?: number; pidPath: string }> {
  const app = new AiAgentSwitchApp(options);
  const pidPath = join(app.store.configDir, "proxy.pid");
  if (!existsSync(pidPath)) return { running: false, pidPath };
  const pid = Number((await readFile(pidPath, "utf8")).trim());
  if (!Number.isFinite(pid)) return { running: false, pidPath };
  try {
    process.kill(pid, 0);
    return { running: true, pid, pidPath };
  } catch {
    return { running: false, pid, pidPath };
  }
}

export async function stopProxy(options: ProxyStartOptions = {}): Promise<boolean> {
  const status = await proxyStatus(options);
  if (!status.running || !status.pid) {
    await rm(status.pidPath, { force: true });
    return false;
  }
  process.kill(status.pid, "SIGTERM");
  await rm(status.pidPath, { force: true });
  return true;
}

export async function forwardProviderRequest(
  provider: ProviderProfile,
  request: Request,
  upstreamProxy?: string,
  fetcher: ProxyFetch = fetch as ProxyFetch,
  modelOverride?: string,
): Promise<Response> {
  if (!provider.baseUrl) {
    throw new Error(`Provider ${provider.id} does not have baseUrl`);
  }

  const incomingUrl = new URL(request.url);
  const upstream = new URL(provider.baseUrl);
  const basePath = upstream.pathname.replace(/\/$/, "");
  upstream.pathname = resolveForwardPath(basePath, incomingUrl.pathname);
  upstream.search = incomingUrl.search;

  const headers = new Headers(request.headers);
  headers.delete("host");
  const key = resolveApiKey(provider);
  if (key && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${key}`);
  }
  for (const [name, value] of Object.entries(provider.headers ?? {})) {
    headers.set(name, value);
  }

  const body = await createForwardBody(request, headers, modelOverride);

  const init: RequestInit & { duplex: "half"; proxy?: string } = {
    method: request.method,
    headers,
    body,
    duplex: "half",
  };
  if (upstreamProxy) init.proxy = upstreamProxy;
  return fetcher(upstream, init);
}

export async function handleProxyRequest(
  config: AiAgentSwitchConfig,
  request: Request,
  fetcher: ProxyFetch = fetch as ProxyFetch,
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" && (url.pathname === "/health" || url.pathname === "/_health")) {
    return Response.json({
      ok: true,
      proxy: {
        enabled: config.proxy.enabled,
        host: config.proxy.host,
        port: config.proxy.port,
        upstreamProxy: config.proxy.upstreamProxy,
      },
      route: config.routes.default?.candidates ?? [],
    });
  }
  if (request.method === "GET" && url.pathname === "/v1/models") {
    return Response.json({
      object: "list",
      data: resolveProxyModelEntries(config),
    });
  }

  try {
    const selected = await resolveRequestRouteCandidate(config, request);
    const candidates = resolveProxyRouteCandidates(config, selected);
    const result = await routeWithFailover({
      providers: candidates,
      retry: config.proxy.retry,
      failover: config.proxy.failover,
      request: ({ provider }) => forwardProviderRequest(provider.provider, request, config.proxy.upstreamProxy, fetcher, provider.modelId),
    });
    return result.response;
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }
}

export function resolveProxyRouteCandidates(config: AiAgentSwitchConfig, preferred?: RouteCandidate): ProxyRouteCandidate[] {
  const configured = config.routes.default?.candidates ?? [];
  const candidates = configured.length > 0
    ? configured.flatMap((candidate) => resolveRouteCandidate(config, candidate) ?? [])
    : Object.values(config.providers).flatMap((provider) => {
      const modelId = provider.defaultModel ?? provider.models[0]?.id;
      return modelId ? [{ provider, modelId }] : [];
    });

  const selected = preferred ? resolveRouteCandidate(config, preferred) : undefined;
  if (!selected) return candidates;
  return [
    selected,
    ...candidates.filter((candidate) => candidate.provider.id !== selected.provider.id || candidate.modelId !== selected.modelId),
  ];
}

function resolveRouteCandidate(config: AiAgentSwitchConfig, candidate: RouteCandidate): ProxyRouteCandidate | undefined {
  const provider = config.providers[candidate.providerId];
  if (!provider) return undefined;
  if (!provider.models.some((model) => model.id === candidate.modelId)) return undefined;
  return { provider, modelId: candidate.modelId };
}

async function resolveRequestRouteCandidate(config: AiAgentSwitchConfig, request: Request): Promise<RouteCandidate | undefined> {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) return undefined;

  const raw = await request.clone().text();
  if (!raw.trim()) return undefined;
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
  const model = (parsed as Record<string, unknown>).model;
  return typeof model === "string" ? parseRouteModelRef(config, model) : undefined;
}

function parseRouteModelRef(config: AiAgentSwitchConfig, value: string): RouteCandidate | undefined {
  const slash = value.indexOf("/");
  if (slash <= 0) return undefined;
  const providerId = value.slice(0, slash);
  const modelId = value.slice(slash + 1);
  if (!modelId) return undefined;
  const provider = config.providers[providerId];
  if (!provider) return undefined;
  if (!provider.models.some((model) => model.id === modelId)) return undefined;
  return { providerId, modelId };
}

function resolveForwardPath(basePath: string, incomingPath: string): string {
  let path = incomingPath;
  if (basePath.endsWith("/v1") && (path === "/v1" || path.startsWith("/v1/"))) {
    path = path.slice(3) || "/";
  }
  return `${basePath}${path}`;
}

function resolveProxyModelEntries(config: AiAgentSwitchConfig): ProxyModelEntry[] {
  const routeCandidates = config.routes.default?.candidates ?? [];
  const entries = routeCandidates.length > 0
    ? routeCandidates.flatMap((candidate) => {
      const provider = config.providers[candidate.providerId];
      if (!provider) return [];
      if (!provider.models.some((model) => model.id === candidate.modelId)) return [];
      return [toProxyModelEntry(provider.id, candidate.modelId)];
    })
    : Object.values(config.providers).flatMap((provider) => provider.models.map((model) => toProxyModelEntry(provider.id, model.id)));

  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
}

function toProxyModelEntry(providerId: string, modelId: string): ProxyModelEntry {
  return {
    id: `${providerId}/${modelId}`,
    object: "model",
    owned_by: providerId,
  };
}

async function createForwardBody(request: Request, headers: Headers, modelOverride?: string): Promise<BodyInit | null> {
  if (request.method === "GET" || request.method === "HEAD") return null;
  if (!modelOverride) return request.body;

  const contentType = headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return request.body;
  }

  const raw = await request.clone().text();
  if (!raw.trim()) return raw;
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return raw;
  const next = { ...(parsed as Record<string, unknown>), model: modelOverride };
  headers.set("content-type", "application/json");
  headers.delete("content-length");
  return JSON.stringify(next);
}

function resolveApiKey(provider: ProviderProfile): string | undefined {
  if (provider.apiKey?.kind === "inline") return provider.apiKey.value;
  if (provider.apiKey?.kind === "env") return process.env[provider.apiKey.name];
  if (provider.apiKeyEnv) return process.env[provider.apiKeyEnv];
  return undefined;
}
