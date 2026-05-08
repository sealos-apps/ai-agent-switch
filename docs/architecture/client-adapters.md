# Client Adapter Notes

## Codex

配置文件：`~/.codex/config.toml`

写入字段：

- `model`
- `model_provider`
- `[model_providers.<id>]`

注意：不要碰 `auth.json`，不要写错 MCP 配置结构。

## Gemini CLI

配置文件：`~/.gemini/settings.json`

写入字段：

- `model.name`
- `auth.selectedType`
- `modelProviders.<id>`

Gemini 自身有 model routing，`agent-switch` 只负责配置，不覆盖它的内部策略。

## Qwen Code

配置文件：`~/.qwen/settings.json`

写入字段：

- `model.name`
- `security.auth.selectedType`
- `modelProviders.<id>`

## OpenClaw

配置文件：`~/.openclaw/openclaw.json`

OpenClaw 的 provider/model/runtime/channel 是分层概念。`agent-switch` 第一版只写默认模型和 provider catalog，不接管 Gateway。

## Hermes Agent

配置文件：

- `~/.hermes/config.yaml`
- `~/.hermes/.env`

Hermes 明确区分 settings 和 secrets。适配器会把 inline key 写入 `.env`，配置文件只引用 env key。

## Crush / OpenCode

两者都可能有 session DB。`agent-switch` 第一版只写 provider/model 配置，不碰会话、历史和数据库。
