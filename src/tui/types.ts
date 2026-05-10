import type { AgentSwitchApp, AppStatus, ModelTarget } from "../core/app";
import type { ProviderProfile } from "../config/schema";
import type { ClientCurrentState, ClientDetection, ClientId } from "../clients";

export type TuiView =
  | "menu"
  | "clients"
  | "client-detail"
  | "providers"
  | "presets"
  | "models"
  | "custom-provider"
  | "add-model"
  | "confirm"
  | "help";

export type MainMenuItem = "clients" | "providers" | "models";

export type TuiMessage = {
  tone: "info" | "success" | "warning" | "error";
  text: string;
};

export type ProviderPresetItem = {
  id: string;
  name: string;
  models: string[];
  description?: string | undefined;
  apiKeyEnv?: string | undefined;
};

export type TuiData = {
  status: Pick<AppStatus, "configPath" | "providers" | "proxy" | "routes">;
  clients: Awaited<ReturnType<AgentSwitchApp["listClients"]>>;
  models: ModelTarget[];
  presets: ProviderPresetItem[];
  clientCurrent?: ClientCurrentState | undefined;
  clientDetection?: ClientDetection | undefined;
};

export type TuiState = {
  view: TuiView;
  previousView?: TuiView | undefined;
  selections: {
    menu: number;
    clients: number;
    providers: number;
    presets: number;
    models: number;
    clientDetail: number;
  };
  activeTargetRef?: string | undefined;
  clientDetail?: { clientId: ClientId } | undefined;
  message: TuiMessage;
  form?: TuiForm | undefined;
  confirm?: TuiConfirm | undefined;
};

export type TuiForm = {
  kind: "custom-provider" | "add-model";
  activeField: number;
  fields: TuiFormField[];
};

export type TuiFormField = {
  name: string;
  label: string;
  value: string;
  required: boolean;
  options?: readonly string[] | undefined;
  optionLabels?: Record<string, string> | undefined;
};

export type TuiConfirm = {
  message: string;
  command: TuiCommand;
};

export type TuiStateAction =
  | { type: "move"; delta: number }
  | { type: "open-view"; view: TuiView }
  | { type: "back" }
  | { type: "help" }
  | { type: "message"; message: TuiMessage }
  | { type: "select-active-model" };

export type TuiCommand =
  | { type: "add-provider-preset"; presetId: string }
  | { type: "add-custom-provider"; provider: ProviderProfile }
  | { type: "remove-provider"; providerId: string }
  | { type: "test-provider"; providerId: string }
  | { type: "detect-clients" }
  | { type: "detect-client"; clientId: ClientId }
  | { type: "show-client"; clientId: ClientId }
  | { type: "add-model"; providerId: string; modelId: string }
  | { type: "remove-model"; providerId: string; modelId: string }
  | { type: "apply-client"; clientId: ClientId; target: string }
  | { type: "apply-all"; target: string }
  | { type: "use-agent-switch-proxy"; clientId: ClientId }
  | { type: "set-provider-default-model"; providerId: string; modelId: string }
  | { type: "set-route-primary"; target: string }
  | { type: "add-route-fallback"; target: string };

export type TuiCommandResult = {
  data: TuiData;
  message: TuiMessage;
};

export type TuiInputAction =
  | { type: "move"; delta: number }
  | { type: "enter" }
  | { type: "escape" }
  | { type: "help" }
  | { type: "quit" }
  | { type: "toggle" }
  | { type: "apply-all" }
  | { type: "add" }
  | { type: "remove" }
  | { type: "edit" }
  | { type: "test" }
  | { type: "detect" }
  | { type: "show" }
  | { type: "default-model" }
  | { type: "route-primary" }
  | { type: "route-fallback" };
