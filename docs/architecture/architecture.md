# AI Agent Switch Architecture

## Core Concepts

AI Agent Switch keeps five concepts separate:

- `Client`: an external AI coding client such as Codex, Qwen Code, Gemini CLI, Hermes, OpenClaw, Crush, OpenCode, CowAgent, or Claude Code.
- `Provider`: a model provider and API endpoint such as OpenRouter, DeepSeek, OpenAI Responses API, or an OpenAI Chat Completions-compatible endpoint.
- `Model`: a concrete model ID. Model IDs may contain slashes, for example `qwen/qwen3-coder`.
- `ClientAdapter`: the component that writes a generic provider/model choice into a client's native config format.
- `ProxyRuntime`: the optional local HTTP proxy that handles retries, failover, route selection, and model rewriting.

## ClientAdapter Interface

Each client adapter implements this shape:

```ts
interface ClientAdapter {
  detect(): Promise<ClientDetection>
  readConfig(): Promise<unknown>
  planApply(input: ApplyClientConfigInput): Promise<PatchPlan>
  apply(plan: PatchPlan): Promise<void>
  getCurrent(): Promise<ClientCurrentState>
  validate(): Promise<ValidationResult>
}
```

Writes happen in two steps:

1. `planApply()` creates a patch plan without writing files.
2. `apply()` performs the atomic write.

This lets `-y` skip interactive confirmation without skipping validation or patch planning.

## Configuration Files

AI Agent Switch stores its own state here:

```text
~/.ai-agent-switch/config.jsonc
~/.ai-agent-switch/state.jsonc
```

`config.jsonc` stores long-lived configuration. `state.jsonc` stores runtime state only.

Current runtime state includes:

- Last switched client, provider, model, and timestamp.
- Proxy process PID, start time, and last error.

It does not store request history, request bodies, token usage, cost, latency, or success-rate data.

## Automation Interface

Script-friendly commands use JSON output instead of a database or background API:

- `status --json`
- `doctor --json`
- `client list/detect/show/use-proxy --json`
- `provider list --json`
- `route list --json`
- `use --dry-run --json`
- `use-all --dry-run --json`
- `config schema`

## TUI Layers

The TUI is the default human entry point, but it does not duplicate business logic. It has three layers:

- `state`: pure state machine for the main menu, submenus, selections, client detail, and messages.
- `render`: pure rendering from TUI state and data snapshot to a terminal frame string.
- `controller`: the only TUI layer allowed to call `AiAgentSwitchApp`.

The home screen shows only core management objects:

```text
Clients
Providers
Models
```

Main navigation uses `↑` / `↓`, `Enter`, `Esc`, `h`, and `q`. The TUI can call existing app services such as client detect/show/use-proxy, provider preset/custom/edit/test/remove, model add/remove/default, and route configuration. Provider/model/client validation still stays in `AiAgentSwitchApp` and the adapters.

## Provider Types

OpenAI-related provider types are split by wire API:

- `openai-responses`: OpenAI Responses API.
- `openai-chat-compatible`: OpenAI Chat Completions-compatible API.

Legacy values remain accepted:

- `openai` normalizes to `openai-responses`.
- `openai-compatible` normalizes to `openai-chat-compatible`.

Codex currently expects `wire_api = "responses"`, so the Codex adapter maps OpenAI-related providers that can be used by Codex to the responses wire API. Other clients use their own native config mappings.

## Provider Presets

Provider presets are built-in templates for common providers. They reduce the amount of handwritten `baseUrl`, `type`, and model configuration.

A preset only creates a normal `ProviderProfile`. It does not create hidden state. Users can still edit it with `provider edit`, add models with `provider model-add`, or edit the JSONC config manually.

The `ai-agent-switch-proxy` preset is a local proxy template, but it is still stored as a regular `openai-chat-compatible` provider:

```text
baseUrl: http://127.0.0.1:17890/v1
model: ai-agent-switch/default
```

## Validation

Configuration validation has two layers:

- Schema validation checks JSONC structure, field types, provider types, and port ranges.
- Semantic validation checks that provider map keys match `provider.id`, `defaultModel` exists, route candidates point to existing provider/model pairs, and route candidates are not duplicated.

## Proxy Design

The proxy listens on:

```text
127.0.0.1:17890
```

The default upstream network proxy is:

```text
http://127.0.0.1:7890
```

The first proxy version supports:

- Per-request retries.
- Ordered provider failover.
- Default route/fallback chain.
- OpenAI-compatible JSON request body `model` rewriting.
- Direct routing when request body `model` is a valid `<provider>/<model>` value.
- Streaming response passthrough.
- Background process PID status.
- `/health` endpoint.
- `/v1/models` OpenAI-compatible model list endpoint.
- `proxy.enabled` start gate.

It does not collect analytics, write request history, or store request bodies.
