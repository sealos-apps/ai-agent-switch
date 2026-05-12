# SSH E2E Test: Providers, Models, and Client Switching

This document verifies the core AI Agent Switch flow on a clean SSH virtual machine: add providers, manage models, and write selected provider/model configuration into Hermes, Codex, OpenClaw, and other supported clients.

## Scope

- Covered: CLI setup, provider creation, model creation, default model selection, single-client switching, batch switching, and config validation.
- Not covered: automatic failover behavior, route candidate chains, and proxy failover. Test those separately when needed.
- Write scope: run the first pass with an isolated `HOME`, then run the final pass with the VM default `HOME` to verify real client discovery.

## Success Criteria

- `bun run check` passes.
- `bun run src/cli/main.ts config validate --json` returns `ok: true`.
- `bun run src/cli/main.ts provider list --json` shows the test provider and models.
- `bun run src/cli/main.ts use <client> <provider>/<model> -y` writes the target client config.
- `bun run src/cli/main.ts use-all <provider>/<model> -y` writes all supported client configs.
- Hermes, Codex, and OpenClaw config files contain the expected provider/model.
- `hermes` no longer asks for setup after Hermes config is written.
- `openclaw config validate` no longer reports missing configuration after OpenClaw config is written.

## Connection Setup

Use the VM credentials supplied for the test run:

```bash
ssh -i /path/to/key user@host -p PORT
```

Lock down the private key before connecting:

```bash
chmod 600 /path/to/key
```

Optional local variables:

```bash
SSH_KEY=/path/to/key
SSH_HOST=user@host
SSH_PORT=PORT
```

## Sync the Current Workspace

The local workspace may contain uncommitted changes. Use `rsync` to test the local version:

```bash
cd /path/to/ai-agent-switch

rsync -az --delete \
  --exclude node_modules \
  --exclude dist \
  --exclude .git \
  --exclude '._*' \
  -e "ssh -i $SSH_KEY -p $SSH_PORT" \
  ./ "$SSH_HOST:~/ai-agent-switch/"
```

If the VM does not have `rsync`, use `tar`:

```bash
COPYFILE_DISABLE=1 tar --exclude='./node_modules' --exclude='./dist' --exclude='./.git' --exclude='._*' -czf - . \
  | ssh -i "$SSH_KEY" "$SSH_HOST" -p "$SSH_PORT" 'mkdir -p ~/ai-agent-switch && tar -xzf - -C ~/ai-agent-switch'
```

Connect to the VM:

```bash
ssh -i "$SSH_KEY" "$SSH_HOST" -p "$SSH_PORT"
```

## Prepare the VM

Run these commands on the VM:

```bash
cd ~/ai-agent-switch

if ! command -v bun >/dev/null 2>&1; then
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
fi

bun install --frozen-lockfile
bun run check
```

Confirm the CLI version and help output:

```bash
bun run src/cli/main.ts --version
bun run src/cli/main.ts --help
```

## Install Client CLIs

Install Hermes, Codex, OpenClaw, and any other client CLIs needed for the test. At minimum, record command availability:

```bash
command -v hermes || true
command -v codex || true
command -v openclaw || true
command -v qwen || true
command -v gemini || true
command -v crush || true
command -v opencode || true
```

If a client CLI is unavailable, record it as not installed. Do not silently replace it with a different client.

## Isolated HOME Pass

Use a temporary `HOME` first:

```bash
export E2E_HOME="$HOME/ai-agent-switch-e2e-home"
rm -rf "$E2E_HOME"
mkdir -p "$E2E_HOME"

export HOME="$E2E_HOME"
export AI_AGENT_SWITCH_HOME="$E2E_HOME/.ai-agent-switch"

cd ~/ai-agent-switch
```

All following AI Agent Switch commands in this pass use the isolated environment.

## Default HOME Pass

The isolated pass proves adapters write files. The final pass must use the VM default `HOME`, so real client commands can read their standard config paths:

```bash
unset E2E_HOME
unset AI_AGENT_SWITCH_HOME
export HOME=/home/devbox

cd ~/ai-agent-switch
```

Expected default paths:

- Hermes: `~/.hermes/config.yaml`
- OpenClaw: `~/.openclaw/openclaw.json`
- Codex: `~/.codex/config.toml`

## Initialize and Validate

```bash
bun run src/cli/main.ts config path
bun run src/cli/main.ts status --json
bun run src/cli/main.ts doctor --json
bun run src/cli/main.ts client detect --json
```

Expected results:

- `config path` points to `$E2E_HOME/.ai-agent-switch/config.jsonc` in the isolated pass.
- `client detect --json` shows each supported client config path.
- Installed clients report an available executable.
- Missing clients are recorded, but they do not block config write tests.

## Add Provider and Models

Add a test provider with one model:

```bash
bun run src/cli/main.ts provider add \
  --id e2e-openrouter \
  --name "E2E OpenRouter" \
  --type openai-chat-compatible \
  --base-url https://openrouter.ai/api/v1 \
  --api-key-env OPENROUTER_API_KEY \
  --model qwen/qwen3-coder \
  --default-model qwen/qwen3-coder
```

Add a second model and make it the default:

```bash
bun run src/cli/main.ts provider model-add e2e-openrouter anthropic/claude-sonnet-4.5
bun run src/cli/main.ts provider default-model e2e-openrouter anthropic/claude-sonnet-4.5
```

Validate provider and model state:

```bash
bun run src/cli/main.ts provider show e2e-openrouter
bun run src/cli/main.ts provider list --json
bun run src/cli/main.ts model list --json
bun run src/cli/main.ts config validate --json
```

Expected results:

- `provider show` includes `qwen/qwen3-coder` and `anthropic/claude-sonnet-4.5`.
- `defaultModel` is `anthropic/claude-sonnet-4.5`.
- `config validate --json` returns `ok: true`.

## Single-Client Dry Run

Preview writes before changing files:

```bash
bun run src/cli/main.ts use codex e2e-openrouter/qwen/qwen3-coder --dry-run --json
bun run src/cli/main.ts use hermes e2e-openrouter/qwen/qwen3-coder --dry-run --json
bun run src/cli/main.ts use openclaw e2e-openrouter/qwen/qwen3-coder --dry-run --json
```

Expected results:

- Output contains `plan`.
- Client config files are not created or modified.
- Unsupported client IDs fail clearly and do not switch to another client.

## Single-Client Apply

After dry-run output is correct, write client config:

```bash
bun run src/cli/main.ts use codex e2e-openrouter/qwen/qwen3-coder -y
bun run src/cli/main.ts use hermes e2e-openrouter/qwen/qwen3-coder -y
bun run src/cli/main.ts use openclaw e2e-openrouter/qwen/qwen3-coder -y
```

Inspect generated files:

```bash
cat ~/.codex/config.toml
cat ~/.hermes/config.yaml
cat ~/.openclaw/openclaw.json
```

## Batch Apply

Preview and apply all supported clients:

```bash
bun run src/cli/main.ts use-all e2e-openrouter/anthropic/claude-sonnet-4.5 --dry-run --json
bun run src/cli/main.ts use-all e2e-openrouter/anthropic/claude-sonnet-4.5 -y
```

Expected results:

- Supported adapters are planned or applied.
- Unsupported native provider mappings fail explicitly.
- Existing client config content outside managed fields is preserved.

## Proxy Route Smoke Test

Configure local proxy routing:

```bash
bun run src/cli/main.ts proxy enable
bun run src/cli/main.ts route set-default e2e-openrouter/qwen/qwen3-coder
bun run src/cli/main.ts route add-fallback e2e-openrouter/anthropic/claude-sonnet-4.5
bun run src/cli/main.ts route list
bun run src/cli/main.ts proxy start --force
```

In another shell:

```bash
curl http://127.0.0.1:17890/health
curl http://127.0.0.1:17890/v1/models
```

Stop the proxy:

```bash
bun run src/cli/main.ts proxy stop
```

## Cleanup

```bash
rm -rf "$HOME/ai-agent-switch-e2e-home"
rm -rf ~/ai-agent-switch
```

Record final notes:

- AI Agent Switch version:
- VM OS:
- Bun version:
- Installed client CLIs:
- Provider/model used:
- Failed checks and logs:
