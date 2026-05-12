import type { AiAgentSwitchApp, AppStatus } from "../core/app";
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

export async function runTui(app: AiAgentSwitchApp): Promise<void> {
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
          if (key === "\u0003") {
            cleanup(onData);
            resolve();
            return;
          }
          ({ state, data } = await handleFormKey(app, state, data, key));
          paint();
          return;
        }

        if (state.view === "confirm") {
          if (key === "q" || key === "\u0003") {
            cleanup(onData);
            resolve();
            return;
          }
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
            state = reduceTuiState(state, { type: "message", message: { tone: "info", text: "Space is only used in form options" } }, data);
          } else if (action.type === "apply-all") {
            state = reduceTuiState(state, { type: "message", message: { tone: "info", text: "Configure clients one by one; use CLI use-all for batch switching" } }, data);
          } else if (action.type === "remove") {
            ({ state, data } = handleRemove(state, data));
          } else if (action.type === "edit") {
            ({ state, data } = await handleEdit(app, state, data));
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
  cleanupTerminal();
}

function renderStatic(status: AppStatus): void {
  console.log("ai-agent-switch TUI requires an interactive terminal; printing read-only status.");
  console.log(`config: ${status.configPath}`);
  const route = status.routes.default?.candidates ?? [];
  if (route.length > 0) {
    console.log(`default route: ${route.map((item) => `${item.providerId}/${item.modelId}`).join(" -> ")}`);
  }
  if (status.state.lastSwitch) {
    console.log(`last switch: ${status.state.lastSwitch.clientId} ${status.state.lastSwitch.providerId}/${status.state.lastSwitch.modelId}`);
  }
  for (const client of status.clients) {
    console.log(`${client.clientId}: ${client.providerId ?? "-"} / ${client.modelId ?? "-"}`);
  }
}

export async function handleEnter(app: AiAgentSwitchApp, state: TuiState, data: TuiData): Promise<{ state: TuiState; data: TuiData }> {
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
    return { state: reduceTuiState(state, { type: "message", message: { tone: "info", text: "Provider actions: a add preset, Esc back" } }, data), data };
  }

  if (state.view === "presets") {
    const presetId = selectedPresetId(state, data);
    if (!presetId) return withMessage(state, data, "warning", "No preset to add");
    const result = await executeTuiCommand(app, { type: "add-provider-preset", presetId });
    const target = result.data.models.find((model) => model.providerId === presetId && model.isProviderDefault);
    if (!target) throw new Error(`Default model not found after adding preset: ${presetId}`);
    return {
      state: focusModelTarget({ ...state, view: "models", message: result.message }, result.data, target.ref),
      data: result.data,
    };
  }

  if (state.view === "models") {
    return { state: reduceTuiState(state, { type: "select-active-model" }, data), data };
  }

  if (state.view === "clients") {
    const clientId = selectedClientId(state, data);
    if (!clientId) return withMessage(state, data, "warning", "No configurable client");
    const nextData = await loadTuiData(app, { clientId });
    return {
      state: {
        ...state,
        view: "client-detail",
        previousView: "clients",
        clientDetail: { clientId },
        selections: { ...state.selections, clientDetail: 0 },
        message: { tone: "info", text: "Choose a model or ai-agent-switch proxy to apply" },
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
  return withMessage(state, data, "info", "Use a in Providers to add a preset, or in Models to add a model");
}

function handleRemove(state: TuiState, data: TuiData): { state: TuiState; data: TuiData } {
  if (state.view === "providers") {
    const providerId = selectedProviderId(state, data);
    if (!providerId) return withMessage(state, data, "warning", "Select a provider to remove");
    return {
      state: openConfirm(state, `Remove provider ${providerId}?`, { type: "remove-provider", providerId }),
      data,
    };
  }
  if (state.view === "models") {
    const target = selectedModelTarget(state, data);
    if (!target) return withMessage(state, data, "warning", "Select a model to remove");
    return {
      state: openConfirm(state, `Remove model ${target.ref}?`, { type: "remove-model", providerId: target.providerId, modelId: target.modelId }),
      data,
    };
  }
  return withMessage(state, data, "info", "Use x in Providers to remove a provider, or in Models to remove a model");
}

async function handleEdit(app: AiAgentSwitchApp, state: TuiState, data: TuiData): Promise<{ state: TuiState; data: TuiData }> {
  if (state.view !== "providers") return withMessage(state, data, "info", "Use e in Providers to edit a provider");
  const providerId = selectedProviderId(state, data);
  if (!providerId) return withMessage(state, data, "warning", "Select a provider to edit");
  const config = await app.loadConfig();
  const provider = config.providers[providerId];
  if (!provider) return withMessage(state, data, "warning", "Select a provider to edit");
  return { state: openCustomProviderForm(state, provider), data };
}

async function handleProviderTest(app: AiAgentSwitchApp, state: TuiState, data: TuiData): Promise<{ state: TuiState; data: TuiData }> {
  if (state.view !== "providers") return withMessage(state, data, "info", "Use t in Providers to test a provider");
  const providerId = selectedProviderId(state, data);
  if (!providerId) return withMessage(state, data, "warning", "Select a provider to test");
  const result = await executeTuiCommand(app, { type: "test-provider", providerId });
  return { state: { ...state, message: result.message }, data: result.data };
}

async function handleClientDetect(app: AiAgentSwitchApp, state: TuiState, data: TuiData): Promise<{ state: TuiState; data: TuiData }> {
  if (state.view !== "clients") return withMessage(state, data, "info", "Use d in Clients to detect a client");
  const result = await executeTuiCommand(app, { type: "detect-clients" });
  return { state: { ...state, message: result.message }, data: result.data };
}

async function handleClientShow(app: AiAgentSwitchApp, state: TuiState, data: TuiData): Promise<{ state: TuiState; data: TuiData }> {
  if (state.view !== "clients") return withMessage(state, data, "info", "Use v in Clients to view a client");
  const clientId = selectedClientId(state, data);
  if (!clientId) return withMessage(state, data, "warning", "No client to view");
  const result = await executeTuiCommand(app, { type: "show-client", clientId });
  return { state: { ...state, message: result.message }, data: result.data };
}

export async function handleClientDetailEnter(app: AiAgentSwitchApp, state: TuiState, data: TuiData): Promise<{ state: TuiState; data: TuiData }> {
  const clientId = state.clientDetail?.clientId;
  if (!clientId) return withMessage(state, data, "warning", "No client selected");
  const actionIndex = state.selections.clientDetail;
  if (actionIndex === 0) {
    if (!state.activeTargetRef) return withMessage(state, data, "warning", "Select a model in Models first");
    const result = await executeTuiCommand(app, { type: "apply-client", clientId, target: state.activeTargetRef });
    return { state: { ...state, message: result.message }, data: result.data };
  }
  if (actionIndex === 1) {
    const result = await executeTuiCommand(app, { type: "use-ai-agent-switch-proxy", clientId });
    return { state: { ...state, message: result.message }, data: result.data };
  }
  if (actionIndex === 2) {
    const current = data.clientCurrent ?? await app.getClientCurrent(clientId);
    return withMessage(state, data, "info", `${clientId}: ${current.providerId ?? "-"}/${current.modelId ?? "-"} ${current.configPath}`);
  }
  const result = await executeTuiCommand(app, { type: "detect-client", clientId });
  return { state: { ...state, message: result.message }, data: result.data };
}

async function handleDefaultModel(app: AiAgentSwitchApp, state: TuiState, data: TuiData): Promise<{ state: TuiState; data: TuiData }> {
  if (state.view !== "models") return withMessage(state, data, "info", "Use * in Models to set the default model");
  const target = selectedModelTarget(state, data);
  if (!target) return withMessage(state, data, "warning", "Select a model");
  const result = await executeTuiCommand(app, { type: "set-provider-default-model", providerId: target.providerId, modelId: target.modelId });
  return { state: focusModelTarget({ ...state, message: result.message }, result.data, target.ref), data: result.data };
}

async function handleRoutePrimary(app: AiAgentSwitchApp, state: TuiState, data: TuiData): Promise<{ state: TuiState; data: TuiData }> {
  if (state.view !== "models") return withMessage(state, data, "info", "Use r in Models to set route primary");
  const target = selectedModelTarget(state, data);
  if (!target) return withMessage(state, data, "warning", "No model available for route");
  const result = await executeTuiCommand(app, { type: "set-route-primary", target: target.ref });
  return { state: focusModelTarget({ ...state, message: result.message }, result.data, target.ref), data: result.data };
}

async function handleRouteFallback(app: AiAgentSwitchApp, state: TuiState, data: TuiData): Promise<{ state: TuiState; data: TuiData }> {
  if (state.view !== "models") return withMessage(state, data, "info", "Use f in Models to add fallback");
  const target = selectedModelTarget(state, data);
  if (!target) return withMessage(state, data, "warning", "No model available for fallback");
  const result = await executeTuiCommand(app, { type: "add-route-fallback", target: target.ref });
  return { state: focusModelTarget({ ...state, message: result.message }, result.data, target.ref), data: result.data };
}

export async function handleFormKey(app: AiAgentSwitchApp, state: TuiState, data: TuiData, key: string): Promise<{ state: TuiState; data: TuiData }> {
  if (!state.form) return { state, data };
  const field = currentField(state);
  if (key === "\u001b") return { state: reduceTuiState(state, { type: "back" }, data), data };
  if (key === "\u001b[B") return { state: moveFormField(state, 1), data };
  if (key === "\u001b[A") return { state: moveFormField(state, -1), data };
  if (key === "\u001b[C") return { state: cycleCurrentOption(state, 1), data };
  if (key === "\u001b[D") return { state: cycleCurrentOption(state, -1), data };
  if (key === " " && field?.options?.length) return { state: cycleCurrentOption(state, 1), data };
  if (field?.readOnly && (key === "\u007f" || key === "\b" || isPrintableInput(key))) return { state, data };
  if (field?.options?.length && (key === "\u007f" || key === "\b" || isPrintableInput(key))) return { state, data };
  if (key === "\u007f" || key === "\b") return { state: updateCurrentField(state, (value) => value.slice(0, -1)), data };
  if (key === "\r") return submitForm(app, state, data);
  if (isPrintableInput(key)) return { state: updateCurrentField(state, (value) => value + key), data };
  return { state, data };
}

async function handleConfirmKey(app: AiAgentSwitchApp, state: TuiState, data: TuiData, key: string): Promise<{ state: TuiState; data: TuiData }> {
  if (!state.confirm) return { state, data };
  if (key === "\u001b") return { state: reduceTuiState(state, { type: "back" }, data), data };
  if (key !== "\r") return { state, data };
  const result = await executeTuiCommand(app, state.confirm.command);
  return { state: { ...state, view: state.previousView ?? "menu", previousView: undefined, confirm: undefined, message: result.message }, data: result.data };
}

function cleanupTerminal(): void {
  process.stdin.removeAllListeners("data");
  if (typeof process.stdin.setRawMode === "function") process.stdin.setRawMode(false);
  process.stdin.pause();
  process.stdout.write("\x1b[?25h\x1b[0m\n");
}

function openCustomProviderForm(state: TuiState, provider?: ProviderProfile): TuiState {
  const models = provider?.models.map((model) => model.id).join(", ") ?? "";
  return {
    ...state,
    view: "custom-provider",
    previousView: state.view,
    message: { tone: "info", text: "Use ←/→ or Space in the type field to change provider type" },
    form: {
      kind: "custom-provider",
      activeField: 0,
      existingProvider: provider,
      fields: [
        { name: "id", label: "id", value: provider?.id ?? "", required: true, readOnly: Boolean(provider) },
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
    message: { tone: "info", text: "Fill provider and model, Enter saves, Esc cancels" },
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

async function submitForm(app: AiAgentSwitchApp, state: TuiState, data: TuiData): Promise<{ state: TuiState; data: TuiData }> {
  if (!state.form) return { state, data };
  const missing = state.form.fields.find((field) => field.required && !field.value.trim());
  if (missing) return withMessage(state, data, "warning", `Fill ${missing.label}`);

  if (state.form.kind === "custom-provider") {
    const provider = buildCustomProviderFromForm(state.form);
    const result = await executeTuiCommand(app, { type: "add-custom-provider", provider });
    return {
      state: focusModelTarget(
        { ...state, view: "models", previousView: undefined, form: undefined, message: result.message },
        result.data,
        `${provider.id}/${provider.defaultModel}`,
      ),
      data: result.data,
    };
  }

  const values = formValues(state.form);
  const result = await executeTuiCommand(app, { type: "add-model", providerId: values.providerId!, modelId: values.modelId! });
  return {
    state: focusModelTarget(
      { ...state, view: "models", previousView: undefined, form: undefined, message: result.message },
      result.data,
      `${values.providerId}/${values.modelId}`,
    ),
    data: result.data,
  };
}

function formValues(form: TuiForm): Record<string, string | undefined> {
  return Object.fromEntries(form.fields.map((field) => [field.name, field.value.trim() || undefined]));
}

export function buildCustomProviderFromForm(form: TuiForm): ProviderProfile {
  const values = formValues(form);
  const models = values.models!.split(",").map((item) => item.trim()).filter(Boolean);
  if (models.length === 0) throw new Error("At least one model id is required (comma-separated)");
  const defaultModel = form.existingProvider?.defaultModel && models.includes(form.existingProvider.defaultModel)
    ? form.existingProvider.defaultModel
    : models[0];

  return {
    id: form.existingProvider?.id ?? values.id!,
    name: values.name!,
    type: values.type! as ProviderProfile["type"],
    models: models.map((id) => ({ id })),
    defaultModel,
    ...(values.baseUrl ? { baseUrl: values.baseUrl } : {}),
    ...(values.apiKeyEnv ? { apiKeyEnv: values.apiKeyEnv } : {}),
    ...(form.existingProvider?.apiKey ? { apiKey: form.existingProvider.apiKey } : {}),
    ...(form.existingProvider?.headers ? { headers: form.existingProvider.headers } : {}),
    ...(form.existingProvider?.params ? { params: form.existingProvider.params } : {}),
  };
}

function focusModelTarget(state: TuiState, data: TuiData, targetRef: string): TuiState {
  const selectedIndex = data.models.findIndex((model) => model.ref === targetRef);
  if (selectedIndex < 0) throw new Error(`Model target not found: ${targetRef}`);
  return { ...state, activeTargetRef: targetRef, selections: { ...state.selections, models: selectedIndex } };
}

function isPrintableInput(key: string): boolean {
  return key.length > 0 && !Array.from(key).some((char) => char < " " || char === "\u007f");
}

function withMessage(
  state: TuiState,
  data: TuiData,
  tone: "info" | "success" | "warning" | "error",
  text: string,
): { state: TuiState; data: TuiData } {
  return { state: reduceTuiState(state, { type: "message", message: { tone, text } }, data), data };
}
