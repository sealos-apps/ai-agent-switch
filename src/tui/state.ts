import type { ClientId } from "../clients";
import type { ModelTarget, AppStatus } from "../core/app";
import type { MainMenuItem, TuiData, TuiState, TuiStateAction, TuiView } from "./types";

const mainMenuItems: MainMenuItem[] = ["clients", "providers", "models"];

export function createTuiState(status?: Pick<AppStatus, "providers">): TuiState {
  const firstModel = status?.providers[0]?.models[0];
  const firstProvider = status?.providers[0];
  return {
    view: "menu",
    selections: {
      menu: 0,
      clients: 0,
      providers: 0,
      presets: 0,
      models: 0,
      clientDetail: 0,
    },
    activeTargetRef: firstProvider && firstModel ? `${firstProvider.id}/${firstModel.id}` : undefined,
    message: { tone: "info", text: "↑/↓ move, Enter open, h help, q quit" },
  };
}

export function reduceTuiState(state: TuiState, action: TuiStateAction, data: TuiData): TuiState {
  if (action.type === "open-view") {
    return { ...state, view: action.view, previousView: state.view === "help" ? state.previousView : state.view };
  }
  if (action.type === "back") {
    if (state.view === "help") return { ...state, view: state.helpReturnView ?? state.previousView ?? "menu", helpReturnView: undefined };
    if (state.view === "custom-provider" || state.view === "add-model" || state.view === "confirm") {
      return { ...state, view: state.previousView ?? "menu", previousView: undefined, form: undefined, confirm: undefined };
    }
    if (state.view === "client-detail") {
      return { ...state, view: state.previousView ?? "clients", previousView: undefined, clientDetail: undefined };
    }
    if (state.view === "menu") return state;
    return { ...state, view: state.previousView ?? "menu", previousView: undefined };
  }
  if (action.type === "help") {
    return { ...state, helpReturnView: state.view, view: "help" };
  }
  if (action.type === "message") {
    return { ...state, message: action.message };
  }
  if (action.type === "select-active-model") {
    const target = selectedModelTarget(state, data);
    if (!target) return { ...state, message: { tone: "warning", text: "No selectable model targets" } };
    return {
      ...state,
      activeTargetRef: target.ref,
      message: { tone: "success", text: `Current model ${target.ref}` },
    };
  }
  if (action.type === "move") {
    const selections = { ...state.selections };
    const key = selectionKeyForView(state.view);
    selections[key] = clamp(selections[key] + action.delta, 0, Math.max(0, itemCountForView(state.view, data) - 1));
    return { ...state, selections };
  }
  return state;
}

export function selectedMainMenuItem(state: TuiState): MainMenuItem {
  return mainMenuItems[clamp(state.selections.menu, 0, mainMenuItems.length - 1)] ?? "clients";
}

export function selectedClientId(state: TuiState, data: TuiData): ClientId | undefined {
  return data.clients[clamp(state.selections.clients, 0, Math.max(0, data.clients.length - 1))]?.id;
}

export function selectedProviderId(state: TuiState, data: TuiData): string | undefined {
  const providerIndex = state.selections.providers - 2;
  if (providerIndex < 0) return undefined;
  return data.status.providers[providerIndex]?.id;
}

export function selectedPresetId(state: TuiState, data: TuiData): string | undefined {
  return data.presets[clamp(state.selections.presets, 0, Math.max(0, data.presets.length - 1))]?.id;
}

export function selectedModelTarget(state: TuiState, data: TuiData): ModelTarget | undefined {
  return data.models[clamp(state.selections.models, 0, Math.max(0, data.models.length - 1))];
}

export function isProviderAddRowSelected(state: TuiState): boolean {
  return state.selections.providers === 0;
}

export function isProviderCustomRowSelected(state: TuiState): boolean {
  return state.selections.providers === 1;
}

export function viewForMainMenuItem(item: MainMenuItem): TuiView {
  return item;
}

function itemCountForView(view: TuiView, data: TuiData): number {
  if (view === "menu") return mainMenuItems.length;
  if (view === "clients") return Math.max(1, data.clients.length);
  if (view === "client-detail") return 4;
  if (view === "providers") return 2 + data.status.providers.length;
  if (view === "presets") return Math.max(1, data.presets.length);
  if (view === "models") return Math.max(1, data.models.length);
  return 1;
}

function selectionKeyForView(view: TuiView): keyof TuiState["selections"] {
  if (view === "clients") return "clients";
  if (view === "client-detail") return "clientDetail";
  if (view === "providers") return "providers";
  if (view === "presets") return "presets";
  if (view === "models") return "models";
  return "menu";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
