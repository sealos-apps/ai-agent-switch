import type { AiAgentSwitchApp } from "../core/app";
import type { ClientId } from "../clients";
import { listProviderPresets } from "../providers/presets";
import type { TuiCommand, TuiCommandResult, TuiData } from "./types";

type TuiApp = Pick<
  AiAgentSwitchApp,
  | "addProvider"
  | "addProviderModel"
  | "addProviderPreset"
  | "addRouteFallback"
  | "configPath"
  | "detectClient"
  | "detectClients"
  | "getClientCurrent"
  | "listClients"
  | "listProviders"
  | "loadConfig"
  | "listModelTargets"
  | "removeProvider"
  | "removeProviderModel"
  | "setDefaultRoute"
  | "setProviderDefaultModel"
  | "testProvider"
  | "useAllClients"
  | "useClient"
  | "useClientProxy"
>;

export async function loadTuiData(
  app: Pick<TuiApp, "configPath" | "loadConfig" | "listProviders" | "listClients" | "listModelTargets" | "getClientCurrent">,
  options: { clientId?: ClientId | undefined } = {},
): Promise<TuiData> {
  const [configPath, config, providers, clients, models, clientCurrent] = await Promise.all([
    app.configPath(),
    app.loadConfig(),
    app.listProviders(true),
    app.listClients(),
    app.listModelTargets(),
    options.clientId ? app.getClientCurrent(options.clientId) : undefined,
  ]);
  return {
    status: {
      configPath,
      providers,
      proxy: config.proxy,
      routes: config.routes,
    },
    clients,
    models,
    presets: listProviderPresets().map((preset) => ({
      id: preset.id,
      name: preset.name,
      models: preset.models,
      description: preset.description,
      apiKeyEnv: preset.apiKeyEnv,
    })),
    clientCurrent,
  };
}

export async function executeTuiCommand(app: TuiApp, command: TuiCommand): Promise<TuiCommandResult> {
  if (command.type === "add-provider-preset") {
    const provider = await app.addProviderPreset(command.presetId);
    return { data: await loadTuiData(app), message: { tone: "success", text: `Added provider ${provider.id}` } };
  }

  if (command.type === "add-custom-provider") {
    const provider = await app.addProvider(command.provider);
    return { data: await loadTuiData(app), message: { tone: "success", text: `Saved provider ${provider.id}` } };
  }

  if (command.type === "remove-provider") {
    const removed = await app.removeProvider(command.providerId);
    return {
      data: await loadTuiData(app),
      message: { tone: removed ? "success" : "warning", text: removed ? `Removed provider ${command.providerId}` : `Provider not found: ${command.providerId}` },
    };
  }

  if (command.type === "test-provider") {
    const result = await app.testProvider(command.providerId);
    return {
      data: await loadTuiData(app),
      message: {
        tone: result.ok ? "success" : "error",
        text: result.ok ? `Provider ${command.providerId} test passed` : `Provider ${command.providerId} test failed: ${result.issues.join("; ")}`,
      },
    };
  }

  if (command.type === "detect-clients") {
    const detections = await app.detectClients();
    const ok = detections.filter((item) => item.configExists).length;
    const miss = detections.length - ok;
    return { data: await loadTuiData(app), message: { tone: miss > 0 ? "warning" : "success", text: `client detect: ${ok} OK, ${miss} MISS` } };
  }

  if (command.type === "detect-client") {
    const detection = await app.detectClient(command.clientId);
    const data = await loadTuiData(app, { clientId: command.clientId });
    return {
      data: { ...data, clientDetection: detection },
      message: {
        tone: detection.installed ? "success" : "warning",
        text: `${command.clientId}: ${detection.installed ? "available" : "not detected"} · ${detection.configPath}`,
      },
    };
  }

  if (command.type === "show-client") {
    const data = await loadTuiData(app, { clientId: command.clientId });
    const current = data.clientCurrent;
    if (!current) return { data, message: { tone: "warning", text: `Client not found: ${command.clientId}` } };
    return {
      data,
      message: {
        tone: "info",
        text: `${current.clientId}: ${current.providerId ?? "-"}/${current.modelId ?? "-"} ${current.configPath}`,
      },
    };
  }

  if (command.type === "add-model") {
    const provider = await app.addProviderModel(command.providerId, command.modelId);
    return { data: await loadTuiData(app), message: { tone: "success", text: `Added model ${provider.id}/${command.modelId}` } };
  }

  if (command.type === "remove-model") {
    const provider = await app.removeProviderModel(command.providerId, command.modelId);
    return { data: await loadTuiData(app), message: { tone: "success", text: `Removed model ${provider.id}/${command.modelId}` } };
  }

  if (command.type === "apply-client") {
    await app.useClient({ clientId: command.clientId, target: command.target, yes: true });
    return { data: await loadTuiData(app, { clientId: command.clientId }), message: { tone: "success", text: `Applied ${command.target} to ${command.clientId}` } };
  }

  if (command.type === "apply-all") {
    const result = await app.useAllClients({ target: command.target, yes: true });
    const applied = result.results.filter((item) => item.status === "applied").length;
    const failed = result.results.filter((item) => item.status === "failed").length;
    const skipped = result.results.filter((item) => item.status === "skipped").length;
    return {
      data: await loadTuiData(app),
      message: { tone: failed > 0 ? "warning" : "success", text: `Batch apply complete: ${applied} applied, ${skipped} skipped, ${failed} failed` },
    };
  }

  if (command.type === "use-ai-agent-switch-proxy") {
    await app.useClientProxy({ clientId: command.clientId, yes: true });
    return {
      data: await loadTuiData(app, { clientId: command.clientId }),
      message: { tone: "success", text: `${command.clientId} now uses ai-agent-switch proxy` },
    };
  }

  if (command.type === "set-provider-default-model") {
    await app.setProviderDefaultModel(command.providerId, command.modelId);
    return {
      data: await loadTuiData(app),
      message: { tone: "success", text: `${command.providerId} default model ${command.modelId}` },
    };
  }

  if (command.type === "set-route-primary") {
    await app.setDefaultRoute(command.target);
    return { data: await loadTuiData(app), message: { tone: "success", text: `route primary ${command.target}` } };
  }

  if (command.type === "add-route-fallback") {
    await app.addRouteFallback(command.target);
    return { data: await loadTuiData(app), message: { tone: "success", text: `route fallback ${command.target}` } };
  }

  const _exhaustive: never = command;
  throw new Error(`Unsupported TUI command: ${JSON.stringify(_exhaustive)}`);
}
