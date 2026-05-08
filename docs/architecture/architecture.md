# agent-switch Architecture

## 核心分层

`agent-switch` 内部必须区分五个概念：

- `Client`：外部 AI 编程客户端，例如 Codex、Qwen、Gemini、Hermes。
- `Provider`：模型供应商和 API endpoint，例如 OpenRouter、DeepSeek、OpenAI-compatible。
- `Model`：具体模型 ID，允许包含斜杠，例如 `qwen/qwen3-coder`。
- `ClientAdapter`：把通用 provider/model 写入客户端原生配置。
- `ProxyRuntime`：可选的本地 HTTP 代理，负责重试和 failover。

## ClientAdapter 接口

每个客户端适配器实现：

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

写入分两步：

1. `planApply()` 只生成 patch plan，不写文件。
2. `apply()` 执行原子写入。

这样 `-y` 可以跳过交互确认，但不能跳过校验和变更计划。

## 配置文件

`agent-switch` 自身配置：

```text
~/.agent-switch/config.jsonc
~/.agent-switch/state.jsonc
```

`config.jsonc` 保存长期配置。`state.jsonc` 预留给当前运行态，不保存统计和历史。

当前 `state.jsonc` 只保存：

- 最近一次切换的客户端、provider、model 和时间。
- 代理进程 PID、启动时间和最近错误。

它不保存请求历史、token、费用、延迟或成功率。

## 自动化接口

CLI 的面向脚本接口使用 JSON 输出，不引入数据库或后台 API：

- `status --json`
- `doctor --json`
- `client list/detect --json`
- `provider list --json`
- `route list --json`
- `use --dry-run --json`
- `use-all --dry-run --json`
- `config schema`

## Provider Presets

Provider preset 是内置的常见供应商模板，用来减少手写 baseUrl/type/model 的成本。

Preset 只生成普通 `ProviderProfile`，不会引入隐藏状态；用户仍然可以用 `provider edit`、`provider model-add` 和 JSONC 手动修改。

`agent-switch-proxy` preset 是特殊的本地代理模板，但仍然落盘为普通 OpenAI-compatible provider：

```text
baseUrl: http://127.0.0.1:17890/v1
model: agent-switch/default
```

## 配置校验

配置校验分两层：

- Schema 校验：确认 JSONC 结构、字段类型、provider 类型和端口范围。
- 语义校验：确认 provider map key 与 `provider.id` 一致、`defaultModel` 存在、route candidate 指向存在的 provider/model，且没有重复候选。

## 代理设计

代理默认监听：

```text
127.0.0.1:17890
```

上游网络代理默认参考：

```text
http://127.0.0.1:7890
```

代理路由策略第一版只做：

- 单请求重试。
- 有序 provider failover。
- 默认 route/fallback 链。
- OpenAI-compatible JSON 请求体 `model` 改写。
- 请求体 `model` 为 `<provider>/<model>` 时，优先路由到该 provider/model。
- 流式响应透传。
- 后台进程 PID 状态。
- `/health` 健康检查端点。
- `/v1/models` OpenAI-compatible 模型列表端点。
- `proxy.enabled` 启动开关。

不做统计、不写请求历史、不保存请求正文。
