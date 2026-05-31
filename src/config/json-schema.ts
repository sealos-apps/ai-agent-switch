import { modelApiModes, modelKinds, providerTypes } from "./schema";

export function aiAgentSwitchJsonSchema(): Record<string, unknown> {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "AI Agent Switch config",
    type: "object",
    required: ["version", "clients", "providers", "routes", "proxy", "ui"],
    properties: {
      version: { const: 1 },
      clients: {
        type: "object",
        additionalProperties: {
          type: "object",
          properties: {
            enabled: { type: "boolean" },
            configPath: { type: "string" },
          },
        },
      },
      providers: {
        type: "object",
        additionalProperties: {
          type: "object",
          required: ["id", "name", "type", "models"],
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            type: {
              enum: providerTypes,
            },
            baseUrl: { type: "string" },
            apiKeyEnv: { type: "string" },
            defaultModel: { type: "string" },
            models: {
              type: "array",
              items: {
                type: "object",
                required: ["id"],
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                  type: { enum: providerTypes },
                  apiMode: { enum: modelApiModes },
                  kind: { enum: modelKinds },
                  contextWindow: { type: "number" },
                  maxTokens: { type: "number" },
                  capabilities: { type: "array", items: { type: "string" } },
                },
              },
            },
          },
        },
      },
      routes: {
        type: "object",
        properties: {
          default: {
            type: "object",
            properties: {
              candidates: {
                type: "array",
                items: {
                  type: "object",
                  required: ["providerId", "modelId"],
                  properties: {
                    providerId: { type: "string" },
                    modelId: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
      proxy: {
        type: "object",
        required: ["enabled", "host", "port", "retry", "failover"],
        properties: {
          enabled: { type: "boolean" },
          host: { type: "string" },
          port: { type: "number" },
          upstreamProxy: { type: "string" },
          retry: {
            type: "object",
            properties: {
              enabled: { type: "boolean" },
              maxAttempts: { type: "number" },
            },
          },
          failover: {
            type: "object",
            properties: {
              enabled: { type: "boolean" },
              strategy: { const: "ordered" },
            },
          },
        },
      },
      ui: {
        type: "object",
        properties: {
          theme: { type: "string" },
        },
      },
    },
  };
}
