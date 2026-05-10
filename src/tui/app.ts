import type { AgentSwitchApp, AppStatus } from "../core/app";
import { normalizeProviderType, providerTypeLabels, selectableProviderTypes, type ProviderProfile } from "../config/schema";
import { executeTuiCommand, loadTuiData } from "./controller";
import { keyToTuiAction } from "./input";
import { renderTuiFrame } from "./render";
import {
  createTuiState,
  isProviderAddRowSelected,
  isProviderCustomRowSelected,
  reduceTuiState,
  selectedClientId,
  selectedMainMenuItem,
  selectedModelTarget,
  selectedProviderId,
  selectedPresetId,
  viewForMainMenuItem,
} from "./state";
import type { TuiCommand, TuiData, TuiForm, TuiState } from "./types";

export async function runTui(app: AgentSwitchApp): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    const status = await app.status();
    renderStatic(status);
    return;
  }

  let data = await loadTuiData(app);
  let state = createTuiState(data.status);

  const paint = () => {
    process.stdout.write("\x1b[?25l\x1b[2J\x1b[H");
    process.stdout.write(renderTuiFrame({ state, data }, {
      rows: process.stdout.rows || 30,
      cols: process.stdout.columns || 100,
    }));
  };

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  paint();

  await new Promise<void>((resolve) => {
    const onData = (key: string) => {
      void (async () => {
        if (state.view === "custom-provider" || state.view === "add-model") {
          ({ state, data } = await handleFormKey(app, state, data, key));
          paint();
          return;
        }

        if (state.view === "confirm") {
          ({ state, data } = await handleConfirmKey(app, state, data, key));
          paint();
          return;
        }

        const action = keyToTuiAction(key);
        if (!action) return;

        try {
          if (action.type === "quit") {
            cleanup(onData);
            resolve();
            return;
          }

          if (action.type === "move") {
            state = reduceTuiState(state, action, data);
          } else if (action.type === "help") {
            state = reduceTuiState(state, { type: "help" }, data);
          } else if (action.type === "escape") {
            state = reduceTuiState(state, { type: "back" }, data);
          } else if (action.type === "enter") {
            ({ state, data } = await handleEnter(app, state, data));
          } else if (action.type === "add") {
            ({ state, data } = handleAdd(state, data));
          } else if (action.type === "toggle") {
            state = reduceTuiState(state, { type: "message", message: { tone: "info", text: "Space 只在表单选项中使用" } }, data);
          } else if (action.type === "apply-all") {
            state = reduceTuiState(state, { type: "message", message: { tone: "info", text: "Clients 中逐个进入配置；批量切换请用 CLI use-all" } }, data);
          } else if (action.type === "remove") {
            ({ state, data } = handleRemove(state, data));
          } else if (action.type === "edit") {
            ({ state, data } = handleEdit(state, data));
          } else if (action.type === "test") {
            ({ state, data } = await handleProviderTest(app, state, data));
          } else if (action.type === "detect") {
            ({ state, data } = await handleClientDetect(app, state, data));
          } else if (action.type === "show") {
            ({ state, data } = await handleClientShow(app, state, data));
          } else if (action.type === "default-model") {
            ({ state, data } = await handleDefaultModel(app, state, data));
          } else if (action.type === "route-primary") {
            ({ state, data } = await handleRoutePrimary(app, state, data));
          } else if (action.type === "route-fallback") {
            ({ state, data } = await handleRouteFallback(app, state, data));
          }
        } catch (error) {
          state = reduceTuiState(state, { type: "message", message: { tone: "error", text: (error as Error).message } }, data);
        }

        paint();
      })();
    };
    process.stdin.on("data", onData);
  });
}

function cleanup(onData: (key: string) => void): void {
  process.stdin.off("data", onData);
  process.stdin.setRawMode(false);
  process.stdin.pause();
  process.stdout.write("\x1b[?25h\x1b[0m\n");
}

function renderStatic(status: AppStatus): void {
  console.log("agent-switch TUI 需要交互式终端，当前以只读状态输出。");
  console.log(`配置：${status.configPath}`);
  const route = status.routes.default?.candidates ?? [];
  if (route.length > 0) {
    console.log(`默认路由：${route.map((item) => `${item.providerId}/${item.modelId}`).join(" -> ")}`);
  }
  if (status.state.lastSwitch) {
    console.log(`最近切换：${status.state.lastSwitch.clientId} ${status.state.lastSwitch.providerId}/${status.state.lastSwitch.modelId}`);
  }
  for (const client of status.clients) {
    console.log(`${client.clientId}: ${client.providerId ?? "-"} / ${client.modelId ?? "-"}`);
  }
}

async function handleEnter(app: AgentSwitchApp, state: TuiState, data: TuiData): Promise<{ state: TuiState; data: TuiData }> {
  if (state.view === "menu") {
    return { state: reduceTuiState(state, { type: "open-view", view: viewForMainMenuItem(selectedMainMenuItem(state)) }, data), data };
  }

  if (state.view === "providers") {
    if (isProviderAddRowSelected(state)) {
      return { state: reduceTuiState(state, { type: "open-view", view: "presets" }, data), data };
    }
    if (isProviderCustomRowSelected(state)) {
      return { state: openCustomProviderForm(state), data };
    }
    return { state: reduceTuiState(state, { type: "message", message: { tone: "info", text: "Provider 操作：a 添加 preset，Esc 返回" } }, data), data };
  }

  if (state.view === "presets") {
    const presetId = selectedPresetId(state, data);
    if (!presetId) return withMessage(state, data, "warning", "没有可添加的 preset");
    const result = await executeTuiCommand(app, { type: "add-provider-preset", presetId });
    const nextState = activateFirstModel({ ...state, view: "models", message: result.message }, result.data);
    return { state: nextState, data: result.data };
  }

  if (state.view === "models") {
    return { state: reduceTuiState(state, { type: "select-active-model" }, data), data };
  }

  if (state.view === "clients") {
    const clientId = selectedClientId(state, data);
    if (!clientId) return withMessage(state, data, "warning", "没有可配置的 client");
    const nextData = await loadTuiData(app, { clientId });
    return {
      state: {
        ...state,
        view: "client-detail",
        previousView: "clients",
        clientDetail: { clientId },
        selections: { ...state.selections, clientDetail: 0 },
        message: { tone: "info", text: "选择 current config 或 agent-switch proxy" },
      },
      data: nextData,
    };
  }

  if (state.view === "client-detail") {
    return handleClientDetailEnter(app, state, data);
  }

  return { state, data };
}

function handleAdd(state: TuiState, data: TuiData): { state: TuiState; data: TuiData } {
  if (state.view === "providers") {
    return { state: reduceTuiState(state, { type: "open-view", view: "presets" }, data), data };
  }
  if (state.view === "models") {
    const selected = selectedModelTarget(state, data);
    const providerId = selected?.providerId ?? data.status.providers[0]?.id ?? "";
    return { state: openAddModelForm(state, providerId), data };
  }
  return withMessage(state, data, "info", "a 可在 Providers 添加 preset，或在 Models 添加模型");
}

function handleRemove(state: TuiState, data: TuiData): { state: TuiState; data: TuiData } {
  if (state.view === "providers") {
    const providerId = selectedProviderId(state, data);
    if (!providerId) return withMessage(state, data, "warning", "请选择要删除的 provider");
    return {
      state: openConfirm(state, `删除 provider ${providerId}？`, { type: "remove-provider", providerId }),
      data,
    };
  }
  if (state.view === "models") {
    const target = selectedModelTarget(state, data);
    if (!target) return withMessage(state, data, "warning", "请选择要删除的模型");
    return {
      state: openConfirm(state, `删除模型 ${target.ref}？`, { type: "remove-model", providerId: target.providerId, modelId: target.modelId }),
      data,
    };
  }
  return withMessage(state, data, "info", "x 可在 Providers 删除 provider，或在 Models 删除模型");
}

function handleEdit(state: TuiState, data: TuiData): { state: TuiState; data: TuiData } {
  if (state.view !== "providers") return withMessage(state, data, "info", "e 只在 Providers 中编辑 provider");
  const providerId = selectedProviderId(state, data);
  const provider = data.status.providers.find((item) => item.id === providerId);
  if (!provider) return withMessage(state, data, "warning", "请选择要编辑的 provider");
  return { state: openCustomProviderForm(state, provider), data };
}

async function handleProviderTest(app: AgentSwitchApp, state: TuiState, data: TuiData): Promise<{ state: TuiState; data: TuiData }> {
  if (state.view !== "providers") return withMessage(state, data, "info", "t 只在 Providers 中测试 provider");
  const providerId = selectedProviderId(state, data);
  if (!providerId) return withMessage(state, data, "warning", "请选择要测试的 provider");
  const result = await executeTuiCommand(app, { type: "test-provider", providerId });
  return { state: { ...state, message: result.message }, data: result.data };
}

async function handleClientDetect(app: AgentSwitchApp, state: TuiState, data: TuiData): Promise<{ state: TuiState; data: TuiData }> {
  if (state.view !== "clients") return withMessage(state, data, "info", "d 只在 Clients 中检测 client");
  const result = await executeTuiCommand(app, { type: "detect-clients" });
  return { state: { ...state, message: result.message }, data: result.data };
}

async function handleClientShow(app: AgentSwitchApp, state: TuiState, data: TuiData): Promise<{ state: TuiState; data: TuiData }> {
  if (state.view !== "clients") return withMessage(state, data, "info", "v 只在 Clients 中查看 client");
  const clientId = selectedClientId(state, data);
  if (!clientId) return withMessage(state, data, "warning", "没有可查看的 client");
  const result = await executeTuiCommand(app, { type: "show-client", clientId });
  return { state: { ...state, message: result.message }, data: result.data };
}

async function handleClientDetailEnter(app: AgentSwitchApp, state: TuiState, data: TuiData): Promise<{ state: TuiState; data: TuiData }> {
  const clientId = state.clientDetail?.clientId;
  if (!clientId) return withMessage(state, data, "warning", "没有选中的 client");
  const actionIndex = state.selections.clientDetail;
  if (actionIndex === 0) {
    return withMessage(state, data, "success", `${clientId} 继续使用当前配置`);
  }
  if (actionIndex === 1) {
    const result = await executeTuiCommand(app, { type: "use-agent-switch-proxy", clientId });
    return { state: { ...state, message: result.message }, data: result.data };
  }
  if (actionIndex === 2) {
    const current = data.clientCurrent ?? await app.getClientCurrent(clientId);
    return withMessage(state, data, "info", `${clientId}: ${current.providerId ?? "-"}/${current.modelId ?? "-"} ${current.configPath}`);
  }
  const result = await executeTuiCommand(app, { type: "detect-client", clientId });
  return { state: { ...state, message: result.message }, data: result.data };
}

async function handleDefaultModel(app: AgentSwitchApp, state: TuiState, data: TuiData): Promise<{ state: TuiState; data: TuiData }> {
  if (state.view !== "models") return withMessage(state, data, "info", "* 只在 Models 中设置默认模型");
  const target = selectedModelTarget(state, data);
  if (!target) return withMessage(state, data, "warning", "请选择模型");
  const result = await executeTuiCommand(app, { type: "set-provider-default-model", providerId: target.providerId, modelId: target.modelId });
  return { state: { ...state, activeTargetRef: target.ref, message: result.message }, data: result.data };
}

async function handleRoutePrimary(app: AgentSwitchApp, state: TuiState, data: TuiData): Promise<{ state: TuiState; data: TuiData }> {
  if (state.view !== "models") return withMessage(state, data, "info", "r 只在 Models 中设置 route primary");
  const target = selectedModelTarget(state, data);
  if (!target) return withMessage(state, data, "warning", "没有可设置 route 的模型");
  const result = await executeTuiCommand(app, { type: "set-route-primary", target: target.ref });
  return { state: { ...state, activeTargetRef: target.ref, message: result.message }, data: result.data };
}

async function handleRouteFallback(app: AgentSwitchApp, state: TuiState, data: TuiData): Promise<{ state: TuiState; data: TuiData }> {
  if (state.view !== "models") return withMessage(state, data, "info", "f 只在 Models 中添加 fallback");
  const target = selectedModelTarget(state, data);
  if (!target) return withMessage(state, data, "warning", "没有可添加 fallback 的模型");
  const result = await executeTuiCommand(app, { type: "add-route-fallback", target: target.ref });
  return { state: { ...state, activeTargetRef: target.ref, message: result.message }, data: result.data };
}

function activateFirstModel(state: TuiState, data: TuiData): TuiState {
  const firstModel = data.models[0];
  if (!firstModel || state.activeTargetRef) return state;
  return { ...state, activeTargetRef: firstModel.ref };
}

async function handleFormKey(app: AgentSwitchApp, state: TuiState, data: TuiData, key: string): Promise<{ state: TuiState; data: TuiData }> {
  if (!state.form) return { state, data };
  if (key === "\u001b") return { state: reduceTuiState(state, { type: "back" }, data), data };
  if (key === "\u001b[B") return { state: moveFormField(state, 1), data };
  if (key === "\u001b[A") return { state: moveFormField(state, -1), data };
  if (key === "\u001b[C") return { state: cycleCurrentOption(state, 1), data };
  if (key === "\u001b[D") return { state: cycleCurrentOption(state, -1), data };
  if (key === " " && currentField(state)?.options?.length) return { state: cycleCurrentOption(state, 1), data };
  if (currentField(state)?.options?.length && key.length === 1 && key >= " ") return { state, data };
  if (key === "\u007f" || key === "\b") return { state: updateCurrentField(state, (value) => value.slice(0, -1)), data };
  if (key === "\r") return submitForm(app, state, data);
  if (key.length === 1 && key >= " ") return { state: updateCurrentField(state, (value) => value + key), data };
  return { state, data };
}

async function handleConfirmKey(app: AgentSwitchApp, state: TuiState, data: TuiData, key: string): Promise<{ state: TuiState; data: TuiData }> {
  if (!state.confirm) return { state, data };
  if (key === "\u001b") return { state: reduceTuiState(state, { type: "back" }, data), data };
  if (key !== "\r") return { state, data };
  const result = await executeTuiCommand(app, state.confirm.command);
  return { state: { ...state, view: state.previousView ?? "menu", previousView: undefined, confirm: undefined, message: result.message }, data: result.data };
}

function openCustomProviderForm(state: TuiState, provider?: ProviderProfile): TuiState {
  const models = provider?.models.map((model) => model.id).join(", ") ?? "";
  return {
    ...state,
    view: "custom-provider",
    previousView: state.view,
    message: { tone: "info", text: "type 字段可用 ←/→ 或 Space 切换 provider 类型" },
    form: {
      kind: "custom-provider",
      activeField: 0,
      fields: [
        { name: "id", label: "id", value: provider?.id ?? "", required: true },
        { name: "name", label: "name", value: provider?.name ?? "", required: true },
        {
          name: "type",
          label: "type",
          value: normalizeProviderType(provider?.type ?? "openai-chat-compatible"),
          required: true,
          options: selectableProviderTypes,
          optionLabels: providerTypeLabels,
        },
        { name: "baseUrl", label: "baseUrl", value: provider?.baseUrl ?? "", required: false },
        { name: "apiKeyEnv", label: "apiKeyEnv", value: provider?.apiKeyEnv ?? "", required: false },
        { name: "models", label: "models", value: models, required: true },
      ],
    },
  };
}

function openAddModelForm(state: TuiState, providerId: string): TuiState {
  return {
    ...state,
    view: "add-model",
    previousView: state.view,
    message: { tone: "info", text: "填写 provider 和 model，Enter 保存，Esc 取消" },
    form: {
      kind: "add-model",
      activeField: providerId ? 1 : 0,
      fields: [
        { name: "providerId", label: "provider", value: providerId, required: true },
        { name: "modelId", label: "model", value: "", required: true },
      ],
    },
  };
}

function openConfirm(state: TuiState, message: string, command: TuiCommand): TuiState {
  return { ...state, view: "confirm", previousView: state.view, confirm: { message, command } };
}

function moveFormField(state: TuiState, delta: number): TuiState {
  if (!state.form) return state;
  const activeField = Math.min(state.form.fields.length - 1, Math.max(0, state.form.activeField + delta));
  return { ...state, form: { ...state.form, activeField } };
}

function updateCurrentField(state: TuiState, update: (value: string) => string): TuiState {
  if (!state.form) return state;
  const fields = state.form.fields.map((field, index) =>
    index === state.form?.activeField ? { ...field, value: update(field.value) } : field,
  );
  return { ...state, form: { ...state.form, fields } };
}

function cycleCurrentOption(state: TuiState, delta: number): TuiState {
  const field = currentField(state);
  if (!state.form || !field?.options?.length) return state;
  const currentIndex = Math.max(0, field.options.indexOf(field.value));
  const nextIndex = wrapIndex(currentIndex + delta, field.options.length);
  const fields = state.form.fields.map((item, index) =>
    index === state.form?.activeField ? { ...item, value: field.options![nextIndex] ?? item.value } : item,
  );
  return { ...state, form: { ...state.form, fields } };
}

function currentField(state: TuiState): TuiForm["fields"][number] | undefined {
  return state.form?.fields[state.form.activeField];
}

function wrapIndex(value: number, length: number): number {
  return ((value % length) + length) % length;
}

async function submitForm(app: AgentSwitchApp, state: TuiState, data: TuiData): Promise<{ state: TuiState; data: TuiData }> {
  if (!state.form) return { state, data };
  const missing = state.form.fields.find((field) => field.required && !field.value.trim());
  if (missing) return withMessage(state, data, "warning", `请填写 ${missing.label}`);

  if (state.form.kind === "custom-provider") {
    const values = formValues(state.form);
    const models = values.models!.split(",").map((item) => item.trim()).filter(Boolean);
    if (models.length === 0) return withMessage(state, data, "warning", "请填写 models");
    const provider = {
      id: values.id!,
      name: values.name!,
      type: values.type! as ProviderProfile["type"],
      models: models.map((id) => ({ id })),
      defaultModel: models[0],
      ...(values.baseUrl ? { baseUrl: values.baseUrl } : {}),
      ...(values.apiKeyEnv ? { apiKeyEnv: values.apiKeyEnv } : {}),
    };
    const result = await executeTuiCommand(app, { type: "add-custom-provider", provider });
    return { state: { ...state, view: "models", previousView: undefined, form: undefined, activeTargetRef: `${provider.id}/${models[0]}`, message: result.message }, data: result.data };
  }

  const values = formValues(state.form);
  const result = await executeTuiCommand(app, { type: "add-model", providerId: values.providerId!, modelId: values.modelId! });
  return { state: { ...state, view: "models", previousView: undefined, form: undefined, activeTargetRef: `${values.providerId}/${values.modelId}`, message: result.message }, data: result.data };
}

function formValues(form: TuiForm): Record<string, string | undefined> {
  return Object.fromEntries(form.fields.map((field) => [field.name, field.value.trim() || undefined]));
}

function withMessage(
  state: TuiState,
  data: TuiData,
  tone: "info" | "success" | "warning" | "error",
  text: string,
): { state: TuiState; data: TuiData } {
  return { state: reduceTuiState(state, { type: "message", message: { tone, text } }, data), data };
}
