# agent-switch MVP Scope

## 产品定位

`agent-switch` 是面向个人用户的 AI 编程客户端配置控制平面。

它解决的问题是：用户同时使用 Codex、Gemini CLI、Qwen Code、OpenClaw、Hermes、Crush、OpenCode、Claude Code 等工具时，不想重复维护 provider、baseUrl、apiKey、model 和代理策略。

## 第一版必须完成

- 裸命令 `agent-switch` / `as` 默认进入 TUI。
- CLI 支持 provider 管理、client 检测、配置校验、模型切换、doctor、proxy 状态。
- 支持 `-y` / `--yes`，只跳过确认，不跳过硬校验。
- `agent-switch` 自身配置使用 JSONC。
- 适配客户端原生配置：JSON、JSONC、TOML、YAML。
- 支持本地代理的重试和有序 failover。
- 支持 `proxy enable/disable/set/start/stop/status`。
- 支持后台代理启动。
- `provider test` 使用配置中的上游代理。
- 支持 provider 下模型增删。
- 支持 provider 默认模型设置。
- 支持 `model list` 平铺查看所有可切换模型目标。
- 支持 client enable/disable。
- 支持代理默认 route/fallback 链。
- 代理按 route 改写 OpenAI-compatible 请求体 `model`。
- 支持代理 `/health` 健康检查。
- 支持代理 `/v1/models` 模型列表。
- `proxy start` 尊重 `proxy.enabled` 开关。
- 支持 `--json` 脚本化输出。
- `config validate` 包含 schema 校验和跨字段语义校验。
- 支持 `use --dry-run` 预演。
- 支持 `use-all` 批量切换所有启用客户端。
- 支持 `config schema` 和 shell completion。
- 支持常见 provider presets，降低接入成本。
- 支持 `agent-switch-proxy` 本地代理 preset。
- 不使用 SQLite 或嵌入式数据库。

## 第一版明确不做

- 不做 `init`。
- 不做 `agent-switch tui`。
- 不做 `backup` / `restore` 命令。
- 不做统计、历史、token、费用、延迟、成功率报表。
- 不接管 OpenClaw / Hermes 的 Gateway、channel、memory、cron、skills。
- 不迁移用户所有历史配置。

## 支持客户端

| 客户端 | 第一版策略 |
|---|---|
| Codex | 写入 `~/.codex/config.toml` 的 `model`、`model_provider`、`model_providers` |
| Gemini CLI | 写入 `~/.gemini/settings.json` |
| Qwen Code | 写入 `~/.qwen/settings.json` 的 `model.name`、`security.auth.selectedType`、`modelProviders` |
| OpenClaw | 写入 `~/.openclaw/openclaw.json` 的默认模型和 provider |
| Hermes Agent | 写入 `~/.hermes/config.yaml`，密钥可分离到 `.env` |
| Crush | 写入 `.crush.json` / `crush.json` / XDG 配置 |
| OpenCode | 写入 `.opencode.json`，不碰 session DB |
| Claude Code | 写入 `~/.claude/settings.json` 的 `agentSwitch` 命名空间 |
