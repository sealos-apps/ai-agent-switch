# SSH 虚拟机端到端测试：Provider、Model 与客户端切换

本文档用于在一台干净 SSH 虚拟机中验收 `agent-switch` 的核心链路：添加 provider、管理 models，并把模型切换写入 Hermes、Codex、OpenClaw 等客户端配置。

## 测试边界

- **覆盖内容：** CLI 安装、provider 添加、model 添加、默认模型设置、单客户端切换、批量切换、配置校验。
- **不覆盖内容：** 自动故障切换、路由候选链、代理 failover。涉及 fallback 的测试需要先单独确认。
- **写入范围：** 可先用隔离 `HOME` 做无污染验证；最终必须再用 VM 默认 `HOME` 验证真实 CLI 能直接读取配置。

## 成功标准

- `bun run check` 通过。
- `bun run src/cli/main.ts config validate --json` 返回 `ok: true`。
- `bun run src/cli/main.ts provider list --json` 能看到测试 provider 和新增 models。
- `bun run src/cli/main.ts use <client> <provider>/<model> -y` 能写入目标客户端配置。
- `bun run src/cli/main.ts use-all <provider>/<model> -y` 能批量写入支持的客户端配置。
- Hermes、Codex、OpenClaw 的默认配置文件中能看到目标 provider 和 model。
- `hermes` 不再提示 setup，`openclaw config validate` 不再提示配置缺失。

## 连接信息

本次 VM 示例：

```bash
ssh -i /path/to/key user@host -p PORT
```

首次连接前先限制私钥权限：

```bash
chmod 600 /path/to/key
```

为了复用命令，可以在本机设置：

```bash
SSH_KEY=/path/to/key
SSH_HOST=user@host
SSH_PORT=PORT
```

## 同步当前工作区

当前工作区包含未提交改动。为了测试当前本地版本，使用 `rsync` 同步源码到 VM：

```bash
cd /path/to/agent-switch

rsync -az --delete \
  --exclude node_modules \
  --exclude dist \
  --exclude .git \
  --exclude '._*' \
  -e "ssh -i $SSH_KEY -p $SSH_PORT" \
  ./ "$SSH_HOST:~/agent-switch/"
```

如果 VM 没有 `rsync`，可改用 `tar`，并禁用 macOS AppleDouble 文件：

```bash
COPYFILE_DISABLE=1 tar --exclude='./node_modules' --exclude='./dist' --exclude='./.git' --exclude='._*' -czf - . \
  | ssh -i "$SSH_KEY" "$SSH_HOST" -p "$SSH_PORT" 'mkdir -p ~/agent-switch && tar -xzf - -C ~/agent-switch'
```

连接 VM：

```bash
ssh -i "$SSH_KEY" "$SSH_HOST" -p "$SSH_PORT"
```

## 准备 VM 环境

在 VM 中执行：

```bash
cd ~/agent-switch

if ! command -v bun >/dev/null 2>&1; then
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
fi

bun install --frozen-lockfile
bun run check
```

确认 `agent-switch` 当前版本：

```bash
bun run src/cli/main.ts --version
bun run src/cli/main.ts --help
```

## 安装待测客户端 CLI

根据 VM 实际环境安装 Hermes、Codex、OpenClaw 等 CLI。安装完成后至少确认命令可用：

```bash
command -v hermes || true
command -v codex || true
command -v openclaw || true
command -v qwen || true
command -v gemini || true
command -v crush || true
command -v opencode || true
```

如果某个客户端 CLI 暂时不可用，本轮只记录为「命令未安装」，不临时改用其他客户端替代。

## 使用隔离测试目录（第一轮）

创建独立 `HOME`，让客户端配置写入临时目录：

```bash
export E2E_HOME="$HOME/agent-switch-e2e-home"
rm -rf "$E2E_HOME"
mkdir -p "$E2E_HOME"

export HOME="$E2E_HOME"
export AGENT_SWITCH_HOME="$E2E_HOME/.agent-switch"

cd ~/agent-switch
```

后续所有 `agent-switch` 命令都在这个环境变量下执行。

## 使用默认 HOME（最终验收）

隔离目录只能证明 adapter 会写文件，不能证明用户直接运行客户端时能读到配置。最终验收前恢复默认环境：

```bash
unset E2E_HOME
unset AGENT_SWITCH_HOME
export HOME=/home/devbox

cd ~/agent-switch
```

后续 `use hermes`、`use openclaw` 等命令必须写入默认路径：

- Hermes：`~/.hermes/config.yaml`
- OpenClaw：`~/.openclaw/openclaw.json`
- Codex：`~/.codex/config.toml`

## 初始化并校验配置

```bash
bun run src/cli/main.ts config path
bun run src/cli/main.ts status --json
bun run src/cli/main.ts doctor --json
bun run src/cli/main.ts client detect --json
```

期望：

- `config path` 指向 `$E2E_HOME/.agent-switch/config.jsonc`。
- `client detect --json` 能显示各客户端配置路径。
- 已安装的客户端应显示可执行文件存在；未安装的客户端只记录状态，不影响配置写入测试。

## 添加 provider 和 models

添加测试 provider，初始只放 1 个模型：

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

追加第 2 个模型，并设为默认模型：

```bash
bun run src/cli/main.ts provider model-add e2e-openrouter anthropic/claude-sonnet-4.5
bun run src/cli/main.ts provider default-model e2e-openrouter anthropic/claude-sonnet-4.5
```

校验 provider 和 model 列表：

```bash
bun run src/cli/main.ts provider show e2e-openrouter
bun run src/cli/main.ts provider list --json
bun run src/cli/main.ts model list --json
bun run src/cli/main.ts config validate --json
```

期望：

- `provider show` 包含 `qwen/qwen3-coder` 和 `anthropic/claude-sonnet-4.5`。
- `defaultModel` 为 `anthropic/claude-sonnet-4.5`。
- `config validate --json` 返回 `ok: true`。

## 单客户端 dry-run

先对目标客户端执行 dry-run，确认写入计划：

```bash
bun run src/cli/main.ts use codex e2e-openrouter/qwen/qwen3-coder --dry-run --json
bun run src/cli/main.ts use hermes e2e-openrouter/qwen/qwen3-coder --dry-run --json
bun run src/cli/main.ts use openclaw e2e-openrouter/qwen/qwen3-coder --dry-run --json
```

期望：

- 输出包含 `plan`。
- 不创建或修改客户端配置文件。
- 如果客户端 ID 不受支持，应直接失败并记录错误，不改用其他客户端。

## 单客户端实际切换

确认 dry-run 符合预期后，写入客户端配置：

```bash
bun run src/cli/main.ts use codex e2e-openrouter/qwen/qwen3-coder -y
bun run src/cli/main.ts use hermes e2e-openrouter/qwen/qwen3-coder -y
bun run src/cli/main.ts use openclaw e2e-openrouter/qwen/qwen3-coder -y
```

检查当前状态：

```bash
bun run src/cli/main.ts current
bun run src/cli/main.ts status --json
bun run src/cli/main.ts config validate --json
```

检查配置文件：

```bash
cat "$E2E_HOME/.codex/config.toml"
cat "$E2E_HOME/.hermes/config.yaml"
cat "$E2E_HOME/.openclaw/openclaw.json"
```

期望：

- Codex 配置包含 `model_provider = "e2e-openrouter"` 和 `model = "qwen/qwen3-coder"`。
- Hermes 配置包含 `model.provider: e2e-openrouter` 和 `model.default: qwen/qwen3-coder`。
- Hermes provider 配置包含 `key_env: OPENROUTER_API_KEY` 和 `transport: openai_chat`；使用 `--api-key-env` 时不会写入 `.env`。
- OpenClaw 配置包含 `agents.defaults.model.primary = "e2e-openrouter/qwen/qwen3-coder"`。
- OpenClaw provider 配置使用 `api: "openai-completions"`、`apiKey: { source: "env", provider: "default", id: "OPENROUTER_API_KEY" }`，且 `models` 是包含 `id` 和 `name` 的对象数组。

## 批量切换到第二个模型

先 dry-run：

```bash
bun run src/cli/main.ts use-all e2e-openrouter/anthropic/claude-sonnet-4.5 --dry-run --json
```

确认计划后应用：

```bash
bun run src/cli/main.ts use-all e2e-openrouter/anthropic/claude-sonnet-4.5 -y
```

再次检查：

```bash
bun run src/cli/main.ts current
bun run src/cli/main.ts status --json
bun run src/cli/main.ts config validate --json

cat "$E2E_HOME/.codex/config.toml"
cat "$E2E_HOME/.hermes/config.yaml"
cat "$E2E_HOME/.openclaw/openclaw.json"
```

期望：

- 支持的客户端被切换到 `anthropic/claude-sonnet-4.5`。
- 不支持或不可写的客户端在 `use-all` 结果中明确显示失败原因。
- 不出现静默跳过或隐式替代。

## 可选：真实 provider 连通性

只有在提供真实 API key 后才执行：

```bash
export OPENROUTER_API_KEY="实际 key"
bun run src/cli/main.ts provider test e2e-openrouter
```

期望：

- API key 有效时连通性检查通过。
- API key 无效时返回明确错误。
- 不因失败临时改用其他 provider 或其他模型。

## Ai Proxy 双协议验收

如果要验证 Ai Proxy 同时支持 OpenAI Chat-compatible 和 Anthropic Messages，在 VM 默认 `HOME` 下添加两个 provider：

```bash
export AIPROXY_API_KEY="实际 key"

bun run src/cli/main.ts provider add \
  --id aiproxy-openai \
  --name "Ai Proxy OpenAI Chat" \
  --type openai-chat-compatible \
  --base-url https://aiproxy.hzh.sealos.run/v1 \
  --api-key-env AIPROXY_API_KEY \
  --model deepseek-v4-flash \
  --model deepseek-v4-pro \
  --default-model deepseek-v4-flash

bun run src/cli/main.ts provider add \
  --id aiproxy-anthropic \
  --name "Ai Proxy Anthropic" \
  --type anthropic \
  --base-url https://aiproxy.hzh.sealos.run/v1 \
  --api-key-env AIPROXY_API_KEY \
  --model deepseek-v4-flash \
  --model deepseek-v4-pro \
  --default-model deepseek-v4-flash
```

写入并校验真实客户端：

```bash
bun run src/cli/main.ts use hermes aiproxy-openai/deepseek-v4-flash -y
hermes -z "Reply exactly: ok"

bun run src/cli/main.ts use hermes aiproxy-anthropic/deepseek-v4-pro -y
hermes -z "Reply exactly: ok"

bun run src/cli/main.ts use openclaw aiproxy-anthropic/deepseek-v4-pro -y
openclaw config validate
openclaw models status --json
openclaw infer model run --local --model aiproxy-anthropic/deepseek-v4-pro --prompt "Reply exactly: ok" --json

bun run src/cli/main.ts use openclaw aiproxy-openai/deepseek-v4-flash -y
openclaw config validate
openclaw infer model run --local --model aiproxy-openai/deepseek-v4-flash --prompt "Reply exactly: ok" --json
```

期望：Hermes 的 OpenAI Chat-compatible / Anthropic 两条路径都返回 `ok`；OpenClaw 的 Anthropic Messages 和 OpenAI Chat-compatible 两条路径都能 `config validate`，且 `infer model run --local` 返回 `ok`。

## 回收测试环境

如果需要清理 VM 上的隔离配置：

```bash
rm -rf "$E2E_HOME"
```

如果需要删除同步的源码目录：

```bash
rm -rf ~/agent-switch
```

## 结果记录模板

```markdown
## SSH E2E 测试记录

- 测试时间：
- VM：
- agent-switch 版本：
- Bun 版本：
- 已安装客户端：
- `bun run check`：
- provider 添加：
- model 添加：
- Codex 切换：
- Hermes 切换：
- OpenClaw 切换：
- `use-all` 批量切换：
- `config validate --json`：
- 真实 provider 连通性：
- 结论：
- 备注：
```
