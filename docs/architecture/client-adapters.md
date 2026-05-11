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

## CowAgent

配置文件：`~/CowAgent/config.json`

写入字段：

- `model`
- `bot_type`
- provider 对应的 API base / key 字段，例如 `open_ai_api_base`、`claude_api_base`
- `agent_switch` 元数据，用于记录 `agent-switch` 的 provider/model 选择

CowAgent 只读取固定的环境变量名，例如 OpenAI-compatible 模式读取 `OPEN_AI_API_KEY`。如果直接写原生 provider 时使用其它 env 名称，适配器会直接报错，不会把环境变量里的密钥复制到配置文件；这类 provider 推荐先通过 `client use-proxy cowagent` 接入本地代理。
