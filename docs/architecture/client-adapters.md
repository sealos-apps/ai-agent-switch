# Client Adapter Notes

## Codex

Config file: `~/.codex/config.toml`

Fields written:

- `model`
- `model_provider`
- `[model_providers.<id>]`

Do not touch `auth.json`. Do not change unrelated MCP configuration structure.

## Gemini CLI

Config file: `~/.gemini/settings.json`

Fields written:

- `model.name`
- `auth.selectedType`
- `modelProviders.<id>`

Gemini has its own model routing. AI Agent Switch only writes configuration and does not override Gemini internals.

## Qwen Code

Config file: `~/.qwen/settings.json`

Fields written:

- `model.name`
- `security.auth.selectedType`
- `modelProviders.<id>`

## OpenClaw

Config file: `~/.openclaw/openclaw.json`

OpenClaw separates provider, model, runtime, and channel concepts. The first AI Agent Switch version writes the default model and provider catalog only. It does not take over the Gateway.

## Hermes Agent

Config files:

- `~/.hermes/config.yaml`
- `~/.hermes/.env`

Hermes separates settings from secrets. The adapter writes inline keys to `.env` and keeps the config file referencing environment variables.

## Crush and OpenCode

Both clients may have session databases. The first AI Agent Switch version writes only provider/model configuration and does not touch sessions, history, or databases.

## CowAgent

Config file: `~/CowAgent/config.json`

Fields written:

- `model`
- `bot_type`
- Provider-specific API base/key fields, for example `open_ai_api_base` or `claude_api_base`
- `ai_agent_switch` metadata that records the provider/model selected by AI Agent Switch

CowAgent reads fixed environment variable names. For example, OpenAI-compatible mode reads `OPEN_AI_API_KEY`. If a direct native provider write uses another environment variable name, the adapter fails fast and does not copy secrets from the environment into config files. For such providers, prefer `client use-proxy cowagent`.
