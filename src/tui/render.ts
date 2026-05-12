import pc from "picocolors";
import type { MainMenuItem, TuiData, TuiMessage, TuiState, TuiView } from "./types";

type RenderSnapshot = {
  state: TuiState;
  data: TuiData;
};

const menuLabels: Record<MainMenuItem, string> = {
  clients: "Clients      Manage Codex / Gemini / Qwen / OpenClaw and other clients",
  providers: "Providers    Manage OpenRouter / DeepSeek / Ollama / custom endpoints",
  models: "Models       Manage provider models and select the active target",
};

export function renderTuiFrame(snapshot: RenderSnapshot, size: { rows: number; cols: number }): string {
  const header = [
    "ai-agent-switch",
    `config ${snapshot.data.status.configPath}`,
    "",
  ];
  const footer = [
    "",
    renderFooter(snapshot),
    renderStatus(snapshot),
    formatMessage(snapshot.state.message),
  ];
  const maxRows = Math.max(1, size.rows);
  const footerRows = footer.slice(-maxRows);
  const headerRows = header.slice(0, Math.max(0, maxRows - footerRows.length));
  const bodyMaxRows = Math.max(0, maxRows - headerRows.length - footerRows.length);
  return fitFrame([...headerRows, ...renderBody(snapshot, bodyMaxRows), ...footerRows], size.rows, size.cols);
}

function renderBody(snapshot: RenderSnapshot, maxRows: number): string[] {
  if (snapshot.state.view === "help") return limitLines(renderHelp(snapshot.state.previousView ?? "menu"), maxRows);
  if (snapshot.state.view === "clients") return renderClients(snapshot, maxRows);
  if (snapshot.state.view === "client-detail") return limitLines(renderClientDetail(snapshot), maxRows);
  if (snapshot.state.view === "providers") return renderProviders(snapshot, maxRows);
  if (snapshot.state.view === "presets") return renderPresets(snapshot, maxRows);
  if (snapshot.state.view === "models") return renderModels(snapshot, maxRows);
  if (snapshot.state.view === "custom-provider" || snapshot.state.view === "add-model") return limitLines(renderForm(snapshot), maxRows);
  if (snapshot.state.view === "confirm") return limitLines(renderConfirm(snapshot), maxRows);
  return limitLines(renderMenu(snapshot), maxRows);
}

function renderMenu(snapshot: RenderSnapshot): string[] {
  const items: MainMenuItem[] = ["clients", "providers", "models"];
  return [
    "Main Menu",
    "",
    ...items.map((item, index) => `${pointer(snapshot.state.selections.menu === index)} ${menuLabels[item]}`),
  ];
}

function renderClients(snapshot: RenderSnapshot, maxRows: number): string[] {
  const header = ["Clients", ""];
  if (snapshot.data.clients.length === 0) return limitLines([...header, "No manageable clients"], maxRows);
  const selectedIndex = snapshot.state.selections.clients;
  const rows = windowedLines(
    snapshot.data.clients,
    selectedIndex,
    Math.max(0, maxRows - header.length),
    (client, index) => `${pointer(selectedIndex === index)} ${client.displayName}`,
  );
  return [...header, ...rows].slice(0, maxRows);
}

function renderClientDetail(snapshot: RenderSnapshot): string[] {
  const clientId = snapshot.state.clientDetail?.clientId;
  const client = snapshot.data.clients.find((item) => item.id === clientId);
  if (!clientId || !client) return ["Client", "", "No client selected"];
  const current = snapshot.data.clientCurrent;
  const route = snapshot.data.status.routes.default?.candidates ?? [];
  const mode = current?.providerId === "ai-agent-switch-proxy" || current?.modelId === "ai-agent-switch/default" ? "ai-agent-switch proxy" : "current config";
  const actions = ["Apply current model", "Use ai-agent-switch proxy", "Show current config", "Detect this client"];
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
    "ai-agent-switch proxy",
    `  endpoint  http://${snapshot.data.status.proxy.host}:${snapshot.data.status.proxy.port}/v1`,
    `  route     ${route.length > 0 ? route.map((item) => `${item.providerId}/${item.modelId}`).join(" -> ") : "-"}`,
    "",
    ...actions.map((action, index) => `${pointer(snapshot.state.selections.clientDetail === index)} ${action}`),
  ];
}

function renderProviders(snapshot: RenderSnapshot, maxRows: number): string[] {
  const lines = [
    "Providers",
    "",
    `${pointer(snapshot.state.selections.providers === 0)} Add from preset`,
    `${pointer(snapshot.state.selections.providers === 1)} Add custom provider`,
  ];
  if (snapshot.data.status.providers.length === 0) {
    lines.push("", "No providers yet. Add a preset first, then select a model in Models.");
    return limitLines(lines, maxRows);
  }
  const selectedIndex = Math.max(0, snapshot.state.selections.providers - 2);
  const rows = windowedLines(
    snapshot.data.status.providers,
    selectedIndex,
    Math.max(0, maxRows - lines.length),
    (provider, index) =>
      `${pointer(snapshot.state.selections.providers === index + 2)} ${provider.id.padEnd(18)} ${provider.type.padEnd(18)} ${provider.models.length} models`,
  );
  return [...lines, ...rows].slice(0, maxRows);
}

function renderPresets(snapshot: RenderSnapshot, maxRows: number): string[] {
  const header = ["Provider Presets", ""];
  const rows = windowedLines(
    snapshot.data.presets,
    snapshot.state.selections.presets,
    Math.max(0, maxRows - header.length),
    (preset, index) => `${pointer(snapshot.state.selections.presets === index)} ${preset.id.padEnd(20)} ${preset.models.slice(0, 3).join(", ")}`,
  );
  return [...header, ...rows].slice(0, maxRows);
}

function renderModels(snapshot: RenderSnapshot, maxRows: number): string[] {
  const header = ["Models", ""];
  if (snapshot.data.models.length === 0) return limitLines([...header, "No models yet. Add a provider preset in Providers first."], maxRows);
  const rows = windowedLines(
    snapshot.data.models,
    snapshot.state.selections.models,
    Math.max(0, maxRows - header.length),
    (model, index) => {
      const tags = [
        model.ref === snapshot.state.activeTargetRef ? "active" : undefined,
        model.isProviderDefault ? "default" : undefined,
        model.routeIndex === 0 ? "primary" : model.routeIndex ? `fallback ${model.routeIndex}` : undefined,
      ].filter(Boolean);
      const suffix = tags.length > 0 ? ` [${tags.join(", ")}]` : "";
      return `${pointer(snapshot.state.selections.models === index)} ${model.providerId.padEnd(14)} ${model.modelId}${suffix}`;
    },
  );
  return [...header, ...rows].slice(0, maxRows);
}

function renderHelp(view: TuiView): string[] {
  const lines = [
    "Help",
    "",
    "Global keys",
    "↑ / ↓   Move selection",
    "Enter   Open or run the current item",
    "Esc     Go back / close help",
    "h       Open help",
    "q       Quit",
  ];
  if (view === "clients") lines.push("", "Clients: Enter opens client config");
  if (view === "client-detail") lines.push("", "Client: Enter applies current model / proxy / view / detect, Esc returns to Clients");
  if (view === "providers") lines.push("", "Providers: Enter selects, a adds preset, e edits, x removes, t tests");
  if (view === "models") lines.push("", "Models: Enter sets active model, a adds model, x removes, * default, r route, f fallback");
  return lines;
}

function renderForm(snapshot: RenderSnapshot): string[] {
  if (!snapshot.state.form) return ["Form", "", "No editable form"];
  const activeField = snapshot.state.form.fields[snapshot.state.form.activeField];
  const optionHint = activeField?.options?.length
    ? [
        "",
        ...renderOptionLines(activeField.options, activeField.optionLabels),
        "←/→ or Space changes options, ↑/↓ changes fields, Enter saves, Esc cancels",
      ]
    : ["", "Type to edit the current field, ↑/↓ changes fields, Enter saves, Esc cancels"];
  return [
    snapshot.state.form.kind === "custom-provider" ? "Add custom provider" : "Add model",
    "",
    ...snapshot.state.form.fields.map((field, index) => {
      const required = field.required ? "*" : " ";
      const label = field.optionLabels?.[field.value];
      const value = field.options?.length ? `<${field.value}>${label ? ` ${label}` : ""}` : field.value;
      const lock = field.readOnly ? " [locked]" : "";
      return `${pointer(snapshot.state.form?.activeField === index)} ${field.label.padEnd(12)}${required} ${value}${lock}`;
    }),
    ...optionHint,
  ];
}

function renderOptionLines(options: readonly string[], labels?: Record<string, string>): string[] {
  const lines = ["Available types:"];
  const explainedOptions = options.filter((option) => option.startsWith("openai-"));
  const compactOptions = options.filter((option) => !option.startsWith("openai-"));
  for (const option of explainedOptions) {
    lines.push(`  ${option.padEnd(24)} ${labels?.[option] ?? ""}`);
  }
  lines.push(...wrapOptionList("  Other: ", compactOptions));
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
    snapshot.state.confirm?.message ?? "Confirm this action?",
    "",
    "Enter confirm · Esc cancel",
  ];
}

function renderFooter(snapshot: RenderSnapshot): string {
  if (snapshot.state.view === "help") return "Esc back";
  if (snapshot.state.view === "menu") return "↑/↓ move · Enter open · h help · q quit";
  if (snapshot.state.view === "clients") return "↑/↓ move · Enter open · Esc back · h help";
  if (snapshot.state.view === "client-detail") return "↑/↓ move · Enter select · Esc back · h help";
  if (snapshot.state.view === "providers") return "↑/↓ move · Enter select · a add · e edit · x remove · t test · Esc back · h help";
  if (snapshot.state.view === "presets") return "↑/↓ move · Enter add preset · Esc back · h help";
  if (snapshot.state.view === "models") return "↑/↓ move · Enter active · a add model · x remove · * default · r route · f fallback · Esc back · h help";
  if (snapshot.state.view === "custom-provider" || snapshot.state.view === "add-model") return "↑/↓ field · ←/→/Space option · Enter save · Esc back · Ctrl-C quit";
  if (snapshot.state.view === "confirm") return "Enter confirm · Esc cancel · q/Ctrl-C quit";
  return "↑/↓ move · Enter save/confirm · Esc back";
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

function formatMessage(message: TuiMessage): string {
  const tone = messageToneLabel(message.tone);
  return `message: ${tone} ${message.text}`;
}

function messageToneLabel(tone: TuiMessage["tone"]): string {
  if (tone === "success") return pc.green("[success]");
  if (tone === "warning") return pc.yellow("[warning]");
  if (tone === "error") return pc.red("[error]");
  return pc.blue("[info]");
}

function fitFrame(lines: string[], rows: number, cols: number): string {
  const visible = lines.slice(0, Math.max(1, rows));
  return visible.map((line) => truncateAnsiLine(line, Math.max(1, cols - 1))).join("\n");
}

function limitLines(lines: string[], maxRows: number): string[] {
  return lines.slice(0, Math.max(0, maxRows));
}

function windowedLines<T>(
  items: readonly T[],
  selectedIndex: number,
  visibleCount: number,
  renderItem: (item: T, index: number) => string,
): string[] {
  if (visibleCount <= 0 || items.length === 0) return [];
  if (items.length <= visibleCount) return items.map(renderItem);
  const { start, end } = windowRange(items.length, selectedIndex, visibleCount);
  return items.slice(start, end).map((item, offset) => renderItem(item, start + offset));
}

function windowRange(length: number, selectedIndex: number, visibleCount: number): { start: number; end: number } {
  if (visibleCount <= 0 || length <= visibleCount) return { start: 0, end: length };
  const selected = clamp(selectedIndex, 0, length - 1);
  const half = Math.floor(visibleCount / 2);
  const maxStart = Math.max(0, length - visibleCount);
  const start = Math.min(maxStart, Math.max(0, selected - half));
  return { start, end: start + visibleCount };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function truncateAnsiLine(line: string, maxCols: number): string {
  if (maxCols <= 0) return "";
  let visible = 0;
  let index = 0;
  let result = "";
  while (index < line.length && visible < maxCols) {
    const char = line[index]!;
    if (char === "\u001b" && line[index + 1] === "[") {
      const end = consumeAnsiCsi(line, index + 2);
      if (end < 0) break;
      result += line.slice(index, end + 1);
      index = end + 1;
      continue;
    }
    const codePoint = line.codePointAt(index)!;
    result += String.fromCodePoint(codePoint);
    index += codePoint > 0xffff ? 2 : 1;
    visible += 1;
  }
  if (visible >= maxCols && index < line.length && !result.endsWith("\u001b[0m")) {
    result += "\u001b[0m";
  }
  return result;
}

function consumeAnsiCsi(text: string, start: number): number {
  for (let index = start; index < text.length; index += 1) {
    const char = text[index]!;
    if (char >= "@" && char <= "~") return index;
  }
  return -1;
}
