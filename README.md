# agent-switch

`agent-switch` 是一个 Bun + TypeScript 编写的 AI 编程客户端配置控制平面。

它面向个人用户，提供 CLI 和默认 TUI，用来管理多个客户端的 provider / model 配置，并可选择开启本地代理、自动重试和自动切换。

## 设计边界

- 裸命令 `agent-switch` 或别名 `as` 默认进入 TUI。
- 不提供 `init` 命令。
- 不提供 `agent-switch tui` 命令。
- 第一版不做备份、回滚、统计、历史、费用、token 或成功率报表。
- 不使用 SQLite 或嵌入式数据库。
- `agent-switch` 自身配置使用 JSONC。

## 常用命令

```bash
agent-switch
agent-switch status
agent-switch status --json
agent-switch doctor
agent-switch doctor --json
agent-switch config path
agent-switch config validate
agent-switch config validate --json
agent-switch config schema
agent-switch client list
agent-switch client list --json
agent-switch client detect
agent-switch client disable qwen
agent-switch client enable qwen
agent-switch provider list
agent-switch provider list --json
agent-switch provider preset-list
agent-switch provider preset-add openrouter --api-key-env OPENROUTER_API_KEY
agent-switch provider preset-add agent-switch-proxy
agent-switch provider show openrouter
agent-switch provider add --id openrouter --type openai-compatible --base-url https://openrouter.ai/api/v1 --api-key-env OPENROUTER_API_KEY --model qwen/qwen3-coder --default-model qwen/qwen3-coder
agent-switch provider model-add openrouter anthropic/claude-sonnet-4.5
agent-switch provider model-remove openrouter qwen/qwen3-coder
agent-switch provider default-model openrouter anthropic/claude-sonnet-4.5
agent-switch provider test openrouter
agent-switch model list
agent-switch model list --json
agent-switch route set-default openrouter/qwen/qwen3-coder
agent-switch route add-fallback openrouter/anthropic/claude-sonnet-4.5
agent-switch route list
agent-switch route list --json
agent-switch use qwen openrouter/qwen/qwen3-coder -y
agent-switch use qwen openrouter/qwen/qwen3-coder --dry-run --json
agent-switch use-all openrouter/qwen/qwen3-coder --dry-run --json
agent-switch use-all openrouter/qwen/qwen3-coder -y
agent-switch proxy enable
agent-switch proxy set --port 17890 --upstream-proxy http://127.0.0.1:7890 --retry true --max-attempts 3 --failover true
agent-switch proxy start
agent-switch proxy start --daemon
agent-switch proxy status
```

## TUI 快捷键

裸命令会进入 TUI：

```bash
agent-switch
as
```

快捷键：

- `j` / `k`：选择客户端。
- `n` / `p`：选择 provider/model 候选。
- `Enter`：应用当前选择。
- `r`：刷新状态。
- `q`：退出。

非交互终端中，裸命令会退化为只读状态输出。

## 自动化 / 脚本输出

以下命令支持 JSON 输出：

```bash
agent-switch status --json
agent-switch doctor --json
agent-switch config validate --json
agent-switch client list --json
agent-switch client detect --json
agent-switch provider list --json
agent-switch model list --json
agent-switch route list --json
agent-switch proxy status --json
agent-switch use qwen openrouter/qwen/qwen3-coder --dry-run --json
agent-switch use-all openrouter/qwen/qwen3-coder --dry-run --json
```

导出配置 schema：

```bash
agent-switch config schema
```

Shell completion：

```bash
agent-switch completion zsh > ~/.zsh/completions/_agent-switch
agent-switch completion bash > ~/.local/share/bash-completion/completions/agent-switch
```

## Provider 示例

查看内置 preset：

```bash
agent-switch provider preset-list
agent-switch provider preset-show openrouter
```

一键添加 OpenRouter：

```bash
agent-switch provider preset-add openrouter --api-key-env OPENROUTER_API_KEY
```

把本地 `agent-switch proxy` 暴露成一个 OpenAI-compatible provider：

```bash
agent-switch provider preset-add agent-switch-proxy
```

OpenRouter：

```bash
agent-switch provider add \
  --id openrouter \
  --name OpenRouter \
  --type openai-compatible \
  --base-url https://openrouter.ai/api/v1 \
  --api-key-env OPENROUTER_API_KEY \
  --model qwen/qwen3-coder \
  --default-model qwen/qwen3-coder
```

内置 preset 包括：

- `openrouter`
- `deepseek`
- `dashscope`
- `moonshot`
- `siliconflow`
- `openai`
- `anthropic`
- `gemini`
- `ollama`
- `lmstudio`
- `agent-switch-proxy`

本地 Ollama：

```bash
agent-switch provider add \
  --id ollama \
  --name Ollama \
  --type ollama \
  --base-url http://127.0.0.1:11434/v1 \
  --model llama3.1
```

模型增删：

```bash
agent-switch provider model-add openrouter anthropic/claude-sonnet-4.5
agent-switch provider model-remove openrouter qwen/qwen3-coder
agent-switch provider default-model openrouter anthropic/claude-sonnet-4.5
```

查看所有可用于 `use`、`use-all` 和 `route` 的模型目标：

```bash
agent-switch model list
agent-switch model list --json
```

客户端开关：

```bash
agent-switch client disable qwen
agent-switch client enable qwen
```

## 代理路由

代理路由用于控制 `agent-switch proxy` 默认使用哪个 provider/model，以及失败后切到哪里。

```bash
agent-switch route set-default openrouter/qwen/qwen3-coder
agent-switch route add-fallback openrouter/anthropic/claude-sonnet-4.5
agent-switch route list
```

当代理收到 OpenAI-compatible JSON 请求时，会把请求体里的 `model` 改写为当前路由候选的 model。主候选失败后，会按 fallback 顺序切换 provider/model。

删除 provider 或删除 provider 下的模型时，相关 route candidate 会自动移除，避免配置留下不可用引用。

## 批量切换客户端

切换单个客户端：

```bash
agent-switch use qwen openrouter/qwen/qwen3-coder -y
```

预演所有启用客户端：

```bash
agent-switch use-all openrouter/qwen/qwen3-coder --dry-run --json
```

应用到所有启用客户端：

```bash
agent-switch use-all openrouter/qwen/qwen3-coder -y
```

被 `client disable` 的客户端会自动跳过。

## 代理

`agent-switch` 自身代理默认监听 `127.0.0.1:17890`。上游网络代理默认使用 `http://127.0.0.1:7890`，适合 Clash / Mihomo / Surge 这类本地代理。

```bash
agent-switch proxy enable
agent-switch proxy set --upstream-proxy http://127.0.0.1:7890
agent-switch proxy start
```

健康检查：

```bash
curl http://127.0.0.1:17890/health
```

模型列表：

```bash
curl http://127.0.0.1:17890/v1/models
```

给其他 OpenAI-compatible 客户端使用时，可配置：

```text
baseUrl: http://127.0.0.1:17890/v1
model: openrouter/qwen/qwen3-coder
```

如果配置了默认 route/fallback 链，`/v1/models` 返回 route candidates；否则返回所有已配置 provider 的模型，模型 ID 统一为 `<provider>/<model>`。

OpenAI-compatible 请求体里的 `model` 如果是合法的 `<provider>/<model>`，代理会优先路由到该 provider/model，并把转发给上游的 `model` 改写为真实模型 ID。没有传合法模型时，继续使用默认 route/fallback 链。

后台启动：

```bash
agent-switch proxy start --daemon
agent-switch proxy status
agent-switch proxy status --json
agent-switch proxy stop
```

`proxy start` 会尊重 `proxy.enabled`。如果还没有启用代理，会提示先执行 `agent-switch proxy enable`。调试时也可以使用：

```bash
agent-switch proxy start --force
```

代理第一版支持：

- OpenAI-compatible 请求转发。
- 流式响应透传。
- `/health` 健康检查。
- `/v1/models` OpenAI-compatible 模型列表。
- Bun fetch 的上游 `proxy` 选项。
- 自动重试。
- 有序 provider failover。
- 不记录请求历史和统计。

## 本地开发

```bash
bun install
bun test
bun run build
```

## 本地安装 / 链接

开发时可以直接运行构建产物：

```bash
bun dist/agent-switch.js status
```

也可以链接成 `agent-switch` 和 `as`：

```bash
bun install
bun run build
bun link
agent-switch status
as status
```

打包检查：

```bash
bun pm pack
```

包内只包含 `dist/`、`README.md`、`docs/` 和 `package.json`。
