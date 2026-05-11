# agent-switch

`agent-switch` 是一个 Bun + TypeScript 编写的 AI 编程客户端配置控制平面。

它面向个人用户，提供 CLI 和默认 TUI，用来管理多个客户端的 provider / model 配置，并可选择开启本地代理、自动重试和自动切换。

## 安装

```bash
npm install -g agent-switch
```

如果你只想在项目里使用，也可以直接安装为依赖：

```bash
npm install agent-switch
```

安装后直接运行：

```bash
agent-switch
as
```

npm 会根据当前平台自动安装对应的二进制包，不需要手动下载 release 资产。

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
agent-switch client detect qwen
agent-switch client show qwen
agent-switch client use-proxy qwen --dry-run --json
agent-switch client use-proxy qwen -y
agent-switch provider list
agent-switch provider list --json
agent-switch provider preset-list
agent-switch provider preset-add openrouter --api-key-env OPENROUTER_API_KEY
agent-switch provider preset-add agent-switch-proxy
agent-switch provider show openrouter
agent-switch provider add --id openrouter --type openai-chat-compatible --base-url https://openrouter.ai/api/v1 --api-key-env OPENROUTER_API_KEY --model qwen/qwen3-coder --default-model qwen/qwen3-coder
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

- `↑` / `↓`：移动选择。
- `Enter`：进入菜单或执行当前操作。
- `Esc`：返回上一级。
- `h`：打开帮助。
- `q`：退出。

TUI 首页是主菜单：

```text
Clients
Providers
Models
```

常用流程：

1. 进入 `Providers`，选择 `Add from preset` 或 `Add custom provider` 添加 provider。
2. 进入 `Models`，用 `r` / `f` 配置 agent-switch proxy 背后的 primary/fallback route。
3. 进入 `Clients`，选择某个 client 后进入详情页，再选择继续使用当前配置或接入 agent-switch proxy。

子菜单常用操作：

- `Clients`：`Enter` 进入 client 详情；详情页中可选择 `Use current config` 或 `Use agent-switch proxy`。
- `Providers`：`a` 添加 preset，`e` 编辑 provider，`x` 删除 provider，`t` 测试 provider。
- `Models`：`a` 添加模型，`x` 删除模型，`*` 设置默认模型，`r` 设置 route primary，`f` 添加 fallback。

非交互终端中，裸命令会退化为只读状态输出。

## 自动化 / 脚本输出

以下命令支持 JSON 输出：

```bash
agent-switch status --json
agent-switch doctor --json
agent-switch config validate --json
agent-switch client list --json
agent-switch client detect --json
agent-switch client detect qwen --json
agent-switch client use-proxy qwen --dry-run --json
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
  --type openai-chat-compatible \
  --base-url https://openrouter.ai/api/v1 \
  --api-key-env OPENROUTER_API_KEY \
  --model qwen/qwen3-coder \
  --default-model qwen/qwen3-coder
```

Provider type 里 OpenAI 相关的两条线要分开：

- `openai-responses`：OpenAI Responses API，例如官方 OpenAI API。
- `openai-chat-compatible`：OpenAI Chat Completions 兼容 endpoint，例如 OpenRouter、DeepSeek compatible mode、本地代理等。

旧配置里的 `openai` 和 `openai-compatible` 仍然会被接受，分别按 `openai-responses` 和 `openai-chat-compatible` 处理。

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

## 客户端配置

查看 agent-switch 支持配置的 client 列表，不读取各 client 当前配置：

```bash
agent-switch client list
agent-switch client list --json
```

进入某个 client 的当前配置读取：

```bash
agent-switch client show qwen
agent-switch client detect qwen
```

让某个 client 接入本地 agent-switch proxy：

```bash
agent-switch client use-proxy qwen --dry-run --json
agent-switch client use-proxy qwen -y
```

接入 proxy 后，client 自身只连接 `http://127.0.0.1:17890/v1` 并使用 `agent-switch/default`；真实 provider/model 由 `route` 决定。

## 代理路由

代理路由用于控制 `agent-switch proxy` 默认使用哪个 provider/model，以及失败后切到哪里。

```bash
agent-switch route set-default openrouter/qwen/qwen3-coder
agent-switch route add-fallback openrouter/anthropic/claude-sonnet-4.5
agent-switch route list
```

当代理收到 OpenAI-compatible JSON 请求时，会把请求体里的 `model` 改写为当前路由候选的 model。主候选失败后，会按 fallback 顺序切换 provider/model。

删除 provider 或删除 provider 下的模型时，相关 route candidate 会自动移除，避免配置留下不可用引用。

## 高级：直接写客户端原生配置

推荐路径是 `client use-proxy`：client 只连 agent-switch proxy，真实 provider/model 由 route 管。下面的 `use` / `use-all` 是高级路径，会把 provider/model 直接写进 client 原生配置。

直接切换单个客户端：

```bash
agent-switch use qwen openrouter/qwen/qwen3-coder -y
```

直接预演所有支持的客户端：

```bash
agent-switch use-all openrouter/qwen/qwen3-coder --dry-run --json
```

直接应用到所有支持的客户端：

```bash
agent-switch use-all openrouter/qwen/qwen3-coder -y
```

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

## GitHub Release 下载

发布版会在 GitHub Release 里提供按平台划分的 `tar.gz` 资产和 `SHA256SUMS`：

- `agent-switch-linux-x64.tar.gz`
- `agent-switch-darwin-arm64.tar.gz`
- `agent-switch-darwin-x64.tar.gz`
- `agent-switch-windows-x64.tar.gz`

解压后即可直接运行。macOS / Linux 资产里是 `agent-switch` 和 `as`，Windows 资产里是 `agent-switch.exe` 和 `as.exe`。

```bash
tar -xzf agent-switch-linux-x64.tar.gz
./agent-switch-linux-x64/agent-switch status
./agent-switch-linux-x64/as status
```

如果需要校验下载完整性，可以使用同目录下的 `SHA256SUMS`。
