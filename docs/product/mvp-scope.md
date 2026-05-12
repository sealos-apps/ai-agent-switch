# AI Agent Switch MVP Scope

## Product Positioning

AI Agent Switch is a personal AI coding client control plane. The npm package name is `ai-agent-switch`.

It solves a common workflow problem: developers often use Codex, Gemini CLI, Qwen Code, OpenClaw, Hermes, Crush, OpenCode, CowAgent, Claude Code, and other tools at the same time, but do not want to maintain provider, base URL, API key, model, and proxy settings repeatedly in every client.

## First Version Requirements

- Bare `ai-agent-switch` / `as` opens the TUI by default.
- The TUI home screen contains `Clients`, `Providers`, and `Models`.
- TUI navigation uses arrow keys, `h` for help, and `Esc` to go back.
- The TUI can initialize providers from presets or custom provider input.
- The Clients screen lists configurable clients first; it reads current client config only after opening a client detail view.
- Client detail can keep the current native config or connect the client to the AI Agent Switch proxy.
- Custom provider setup must separate `openai-responses` from `openai-chat-compatible`.
- The TUI supports client detect/show, provider edit/test/remove, model add/remove/default, and route basics.
- The CLI supports provider management, client list/detect/show, single-client proxy connection, config validation, model switching, doctor, and proxy status.
- `-y` / `--yes` skips confirmation only. It does not skip hard validation.
- AI Agent Switch stores its own config as JSONC.
- Native client config formats include JSON, JSONC, TOML, and YAML.
- The local proxy supports retries and ordered failover.
- Proxy commands include `proxy enable/disable/set/start/stop/status`.
- Background proxy start is supported.
- `provider test` respects the configured upstream network proxy.
- Provider models can be added and removed.
- Provider default models can be changed.
- `model list` shows all switchable model targets.
- Proxy default route/fallback chain is supported.
- The proxy rewrites OpenAI-compatible request body `model` values according to routes.
- The proxy exposes `/health`.
- The proxy exposes `/v1/models`.
- `proxy start` respects `proxy.enabled`.
- JSON output is available for automation.
- `config validate` includes both schema validation and cross-field semantic validation.
- `use --dry-run` previews changes.
- `use` / `use-all` remain advanced CLI paths for direct native provider/model writes.
- `config schema` and shell completion are supported.
- Common provider presets reduce setup cost.
- The local `ai-agent-switch-proxy` provider preset is supported.
- No SQLite or embedded database is used.

## Explicit Non-Goals

- No `init` command.
- No `ai-agent-switch tui` command.
- No `backup` / `restore` command.
- No analytics, history, token, cost, latency, or success-rate reports.
- No takeover of OpenClaw or Hermes Gateway, channel, memory, cron, or skills.
- No full migration of all historical user config.

## Supported Clients

| Client | First-version strategy |
|---|---|
| Codex | Writes `model`, `model_provider`, and `model_providers` in `~/.codex/config.toml` |
| Gemini CLI | Writes `~/.gemini/settings.json` |
| Qwen Code | Writes `model.name`, `security.auth.selectedType`, and `modelProviders` in `~/.qwen/settings.json` |
| OpenClaw | Writes default model and provider entries in `~/.openclaw/openclaw.json` |
| Hermes Agent | Writes `~/.hermes/config.yaml`; secrets can be separated into `.env` |
| Crush | Writes `.crush.json`, `crush.json`, or XDG config |
| OpenCode | Writes `.opencode.json`; does not touch session databases |
| CowAgent | Writes `model`, `bot_type`, and provider API fields in `~/CowAgent/config.json` |
| Claude Code | Writes the `aiAgentSwitch` namespace in `~/.claude/settings.json` |
