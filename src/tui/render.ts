import type { MainMenuItem, TuiData, TuiState, TuiView } from "./types";

type RenderSnapshot = {
  state: TuiState;
  data: TuiData;
};

const menuLabels: Record<MainMenuItem, string> = {
  clients: "Clients      管理 Codex / Gemini / Qwen / OpenClaw 等客户端",
  providers: "Providers    管理 OpenRouter / DeepSeek / Ollama / 自定义 endpoint",
  models: "Models       管理 provider 下的模型，并选择当前 target",
};

export function renderTuiFrame(snapshot: RenderSnapshot, size: { rows: number; cols: number }): string {
  const header = [
    "agent-switch",
    `config ${snapshot.data.status.configPath}`,
    "",
  ];
  const footer = [
    "",
    renderFooter(snapshot),
    renderStatus(snapshot),
    formatMessage(snapshot.state.message.text),
  ];
  const maxRows = Math.max(1, size.rows);
  const footerRows = footer.slice(-maxRows);
  const headerRows = header.slice(0, Math.max(0, maxRows - footerRows.length));
  const bodyMaxRows = Math.max(0, maxRows - headerRows.length - footerRows.length);
  return fitFrame([...headerRows, ...renderBody(snapshot).slice(0, bodyMaxRows), ...footerRows], size.rows, size.cols);
}

function renderBody(snapshot: RenderSnapshot): string[] {
  if (snapshot.state.view === "help") return renderHelp(snapshot.state.previousView ?? "menu");
  if (snapshot.state.view === "clients") return renderClients(snapshot);
  if (snapshot.state.view === "client-detail") return renderClientDetail(snapshot);
  if (snapshot.state.view === "providers") return renderProviders(snapshot);
  if (snapshot.state.view === "presets") return renderPresets(snapshot);
  if (snapshot.state.view === "models") return renderModels(snapshot);
  if (snapshot.state.view === "custom-provider" || snapshot.state.view === "add-model") return renderForm(snapshot);
  if (snapshot.state.view === "confirm") return renderConfirm(snapshot);
  return renderMenu(snapshot);
}

function renderMenu(snapshot: RenderSnapshot): string[] {
  const items: MainMenuItem[] = ["clients", "providers", "models"];
  return [
    "Main Menu",
    "",
    ...items.map((item, index) => `${pointer(snapshot.state.selections.menu === index)} ${menuLabels[item]}`),
  ];
}

function renderClients(snapshot: RenderSnapshot): string[] {
  if (snapshot.data.clients.length === 0) return ["Clients", "", "没有可管理的 client"];
  return [
    "Clients",
    "",
    ...snapshot.data.clients.map((client, index) => `${pointer(snapshot.state.selections.clients === index)} ${client.displayName}`),
  ];
}

function renderClientDetail(snapshot: RenderSnapshot): string[] {
  const clientId = snapshot.state.clientDetail?.clientId;
  const client = snapshot.data.clients.find((item) => item.id === clientId);
  if (!clientId || !client) return ["Client", "", "没有选中的 client"];
  const current = snapshot.data.clientCurrent;
  const route = snapshot.data.status.routes.default?.candidates ?? [];
  const mode = current?.providerId === "agent-switch-proxy" || current?.modelId === "agent-switch/default" ? "agent-switch proxy" : "current config";
  const actions = ["Use current config", "Use agent-switch proxy", "Show current config", "Detect this client"];
  return [
    `Client / ${client.displayName}`,
    "",
    "current config",
    `  mode      ${mode}`,
    `  current   ${current?.providerId ?? "-"} / ${current?.modelId ?? "-"}`,
    `  provider  ${current?.providerId ?? "-"}`,
    `  model     ${current?.modelId ?? "-"}`,
    `  file      ${current?.configPath ?? client.configPath}`,
    "",
    "agent-switch proxy",
    `  endpoint  http://${snapshot.data.status.proxy.host}:${snapshot.data.status.proxy.port}/v1`,
    `  route     ${route.length > 0 ? route.map((item) => `${item.providerId}/${item.modelId}`).join(" -> ") : "-"}`,
    "",
    ...actions.map((action, index) => `${pointer(snapshot.state.selections.clientDetail === index)} ${action}`),
  ];
}

function renderProviders(snapshot: RenderSnapshot): string[] {
  const lines = [
    "Providers",
    "",
    `${pointer(snapshot.state.selections.providers === 0)} Add from preset`,
    `${pointer(snapshot.state.selections.providers === 1)} Add custom provider`,
  ];
  if (snapshot.data.status.providers.length === 0) {
    lines.push("", "还没有 provider。先添加 preset，之后才能在 Models 中选择模型。");
    return lines;
  }
  lines.push("");
  for (const [index, provider] of snapshot.data.status.providers.entries()) {
    lines.push(
      `${pointer(snapshot.state.selections.providers === index + 2)} ${provider.id.padEnd(18)} ${provider.type.padEnd(18)} ${provider.models.length} models`,
    );
  }
  return lines;
}

function renderPresets(snapshot: RenderSnapshot): string[] {
  return [
    "Provider Presets",
    "",
    ...snapshot.data.presets.map(
      (preset, index) => `${pointer(snapshot.state.selections.presets === index)} ${preset.id.padEnd(20)} ${preset.models.slice(0, 3).join(", ")}`,
    ),
  ];
}

function renderModels(snapshot: RenderSnapshot): string[] {
  if (snapshot.data.models.length === 0) return ["Models", "", "还没有模型。先到 Providers 添加 provider preset。"];
  return [
    "Models",
    "",
    ...snapshot.data.models.map((model, index) => {
      const tags = [
        model.ref === snapshot.state.activeTargetRef ? "active" : undefined,
        model.isProviderDefault ? "default" : undefined,
        model.routeIndex === 0 ? "primary" : model.routeIndex ? `fallback ${model.routeIndex}` : undefined,
      ].filter(Boolean);
      const suffix = tags.length > 0 ? ` [${tags.join(", ")}]` : "";
      return `${pointer(snapshot.state.selections.models === index)} ${model.providerId.padEnd(14)} ${model.modelId}${suffix}`;
    }),
  ];
}

function renderHelp(view: TuiView): string[] {
  const lines = [
    "Help",
    "",
    "全局按键",
    "↑ / ↓   移动选择",
    "Enter   进入或执行当前项",
    "Esc     返回上一层 / 关闭帮助",
    "h       打开帮助",
    "q       退出",
  ];
  if (view === "clients") lines.push("", "Clients: Enter 进入 client 配置");
  if (view === "client-detail") lines.push("", "Client: Enter 执行当前动作，Esc 返回 Clients");
  if (view === "providers") lines.push("", "Providers: Enter 选择，a 添加 preset，e 编辑，x 删除，t 测试");
  if (view === "models") lines.push("", "Models: Enter 设为当前模型，a 添加模型，x 删除，* 默认，r route，f fallback");
  return lines;
}

function renderForm(snapshot: RenderSnapshot): string[] {
  if (!snapshot.state.form) return ["Form", "", "没有可编辑的表单"];
  const activeField = snapshot.state.form.fields[snapshot.state.form.activeField];
  const optionHint = activeField?.options?.length
    ? [
        "",
        ...renderOptionLines(activeField.options, activeField.optionLabels),
        "←/→ 或 Space 切换选项，↑/↓ 切换字段，Enter 保存，Esc 取消",
      ]
    : ["", "输入文字编辑当前字段，↑/↓ 切换字段，Enter 保存，Esc 取消"];
  return [
    snapshot.state.form.kind === "custom-provider" ? "Add custom provider" : "Add model",
    "",
    ...snapshot.state.form.fields.map((field, index) => {
      const required = field.required ? "*" : " ";
      const label = field.optionLabels?.[field.value];
      const value = field.options?.length ? `<${field.value}>${label ? ` ${label}` : ""}` : field.value;
      return `${pointer(snapshot.state.form?.activeField === index)} ${field.label.padEnd(12)}${required} ${value}`;
    }),
    ...optionHint,
  ];
}

function renderOptionLines(options: readonly string[], labels?: Record<string, string>): string[] {
  const lines = ["可选类型:"];
  const explainedOptions = options.filter((option) => option.startsWith("openai-"));
  const compactOptions = options.filter((option) => !option.startsWith("openai-"));
  for (const option of explainedOptions) {
    lines.push(`  ${option.padEnd(24)} ${labels?.[option] ?? ""}`);
  }
  lines.push(...wrapOptionList("  其他: ", compactOptions));
  return lines;
}

function wrapOptionList(prefix: string, options: readonly string[]): string[] {
  const lines: string[] = [];
  let line = prefix;
  for (const option of options) {
    const next = line === prefix ? `${line}${option}` : `${line} · ${option}`;
    if (next.length > 76 && line !== prefix) {
      lines.push(line);
      line = `${" ".repeat(prefix.length)}${option}`;
    } else {
      line = next;
    }
  }
  if (line !== prefix) lines.push(line);
  return lines;
}

function renderConfirm(snapshot: RenderSnapshot): string[] {
  return [
    "Confirm",
    "",
    snapshot.state.confirm?.message ?? "确认执行？",
    "",
    "Enter 确认 · Esc 取消",
  ];
}

function renderFooter(snapshot: RenderSnapshot): string {
  if (snapshot.state.view === "help") return "Esc 返回";
  if (snapshot.state.view === "menu") return "↑/↓ 移动 · Enter 进入 · h 帮助 · q 退出";
  if (snapshot.state.view === "clients") return "↑/↓ 移动 · Enter 进入 · Esc 返回 · h 帮助";
  if (snapshot.state.view === "client-detail") return "↑/↓ 移动 · Enter 选择 · Esc 返回 · h 帮助";
  if (snapshot.state.view === "providers") return "↑/↓ 移动 · Enter 选择 · a 添加 · e 编辑 · x 删除 · t 测试 · Esc 返回 · h 帮助";
  if (snapshot.state.view === "presets") return "↑/↓ 移动 · Enter 添加 preset · Esc 返回 · h 帮助";
  if (snapshot.state.view === "models") return "↑/↓ 移动 · Enter 当前 · a 添加模型 · x 删除 · * 默认 · r route · f fallback · Esc 返回 · h 帮助";
  if (snapshot.state.view === "custom-provider" || snapshot.state.view === "add-model") return "↑/↓ 字段 · ←/→/Space 切换选项 · Enter 保存 · Esc 返回";
  return "↑/↓ 移动 · Enter 保存/确认 · Esc 返回";
}

function renderStatus(snapshot: RenderSnapshot): string {
  const route = snapshot.data.status.routes.default?.candidates ?? [];
  return `status: ${snapshot.data.status.providers.length} providers · ${snapshot.data.models.length} models · proxy ${
    snapshot.data.status.proxy.enabled ? "on" : "off"
  } · route ${route.length > 0 ? route.map((item) => `${item.providerId}/${item.modelId}`).join(" -> ") : "not configured"}`;
}

function pointer(active: boolean): string {
  return active ? "▶" : " ";
}

function formatMessage(text: string): string {
  return `message: ${text}`;
}

function fitFrame(lines: string[], rows: number, cols: number): string {
  const visible = lines.slice(0, Math.max(1, rows));
  return visible.map((line) => line.slice(0, Math.max(1, cols - 1))).join("\n");
}
