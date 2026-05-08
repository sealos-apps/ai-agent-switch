import { z } from "zod";

export const providerTypes = [
  "openai",
  "anthropic",
  "gemini",
  "openai-compatible",
  "openrouter",
  "dashscope",
  "deepseek",
  "moonshot",
  "siliconflow",
  "ollama",
  "lmstudio",
  "custom",
] as const;

export type ProviderType = (typeof providerTypes)[number];

export type SecretRef =
  | { kind: "env"; name: string }
  | { kind: "inline"; value: string };

export type ModelProfile = {
  id: string;
  name?: string | undefined;
  contextWindow?: number | undefined;
  maxTokens?: number | undefined;
  capabilities?: string[] | undefined;
};

export type ProviderProfile = {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl?: string | undefined;
  apiKeyEnv?: string | undefined;
  apiKey?: SecretRef | undefined;
  models: ModelProfile[];
  defaultModel?: string | undefined;
  headers?: Record<string, string> | undefined;
  params?: Record<string, unknown> | undefined;
};

export type ClientProfile = {
  enabled: boolean;
  configPath?: string | undefined;
};

export type ProxyRetryConfig = {
  enabled: boolean;
  maxAttempts: number;
};

export type ProxyFailoverConfig = {
  enabled: boolean;
  strategy: "ordered";
};

export type ProxyConfig = {
  enabled: boolean;
  host: string;
  port: number;
  upstreamProxy?: string | undefined;
  retry: ProxyRetryConfig;
  failover: ProxyFailoverConfig;
};

export type RouteCandidate = {
  providerId: string;
  modelId: string;
};

export type RouteConfig = {
  candidates: RouteCandidate[];
};

export type RoutesConfig = {
  default?: RouteConfig | undefined;
};

export type AgentSwitchConfig = {
  version: 1;
  clients: Record<string, ClientProfile>;
  providers: Record<string, ProviderProfile>;
  routes: RoutesConfig;
  proxy: ProxyConfig;
  ui: {
    theme: string;
  };
};

export type ValidationResult = {
  ok: boolean;
  issues: string[];
};

export const secretRefSchema: z.ZodType<SecretRef> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("env"), name: z.string().min(1) }),
  z.object({ kind: z.literal("inline"), value: z.string().min(1) }),
]);

export const modelProfileSchema: z.ZodType<ModelProfile> = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  contextWindow: z.number().int().positive().optional(),
  maxTokens: z.number().int().positive().optional(),
  capabilities: z.array(z.string()).optional(),
});

export const providerProfileSchema: z.ZodType<ProviderProfile> = z.object({
  id: z.string().min(1).regex(/^[a-zA-Z0-9._-]+$/, "provider id can only contain letters, numbers, dot, underscore, and dash"),
  name: z.string().min(1),
  type: z.enum(providerTypes),
  baseUrl: z.string().url().optional(),
  apiKeyEnv: z.string().min(1).optional(),
  apiKey: secretRefSchema.optional(),
  models: z.array(modelProfileSchema).min(1),
  defaultModel: z.string().min(1).optional(),
  headers: z.record(z.string()).optional(),
  params: z.record(z.unknown()).optional(),
});

export const routeCandidateSchema: z.ZodType<RouteCandidate> = z.object({
  providerId: z.string().min(1),
  modelId: z.string().min(1),
});

export const routesConfigSchema: z.ZodType<RoutesConfig> = z.object({
  default: z.object({
    candidates: z.array(routeCandidateSchema),
  }).optional(),
});

export const agentSwitchConfigSchema: z.ZodType<AgentSwitchConfig> = z.object({
  version: z.literal(1),
  clients: z.record(
    z.object({
      enabled: z.boolean(),
      configPath: z.string().min(1).optional(),
    }),
  ),
  providers: z.record(providerProfileSchema),
  routes: routesConfigSchema,
  proxy: z.object({
    enabled: z.boolean(),
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535),
    upstreamProxy: z.string().url().optional(),
    retry: z.object({
      enabled: z.boolean(),
      maxAttempts: z.number().int().min(1).max(10),
    }),
    failover: z.object({
      enabled: z.boolean(),
      strategy: z.literal("ordered"),
    }),
  }),
  ui: z.object({
    theme: z.string().min(1),
  }),
});

export function createDefaultConfig(): AgentSwitchConfig {
  return {
    version: 1,
    clients: {
      codex: { enabled: true },
      gemini: { enabled: true },
      qwen: { enabled: true },
      openclaw: { enabled: true },
      hermes: { enabled: true },
      crush: { enabled: true },
      opencode: { enabled: true },
      "claude-code": { enabled: true },
    },
    providers: {},
    routes: {},
    proxy: {
      enabled: false,
      host: "127.0.0.1",
      port: 17890,
      upstreamProxy: "http://127.0.0.1:7890",
      retry: {
        enabled: true,
        maxAttempts: 3,
      },
      failover: {
        enabled: true,
        strategy: "ordered",
      },
    },
    ui: {
      theme: "default",
    },
  };
}
