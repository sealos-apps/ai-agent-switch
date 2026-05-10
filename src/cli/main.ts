#!/usr/bin/env bun
import { cac } from "cac";
import pc from "picocolors";
import { AgentSwitchApp } from "../core/app";
import { providerTypeLabels, selectableProviderTypes, type ProviderProfile } from "../config/schema";
import { parseClientId, printDoctor, printPatchPlan, printProviders, printStatus, printValidation } from "../shared/output";
import { confirm } from "../shared/prompt";
import { runTui } from "../tui/app";
import { proxyStatus, startProxy, startProxyDaemon, stopProxy } from "../proxy/server";
import { agentSwitchJsonSchema } from "../config/json-schema";
import { completionScript } from "./completion";
import { getProviderPreset, listProviderPresets } from "../providers/presets";

const cli = cac("agent-switch");
const app = new AgentSwitchApp();

cli.help();
cli.version("0.1.0");

if (process.argv.slice(2).length === 0) {
  await runTui(app);
  process.exit(0);
}

cli.command("status", "显示当前状态")
  .option("--json", "输出 JSON")
  .action(async (options) => {
    const status = await app.status();
    if (options.json) {
      console.log(JSON.stringify(status, null, 2));
      return;
    }
    printStatus(status);
  });

cli.command("doctor", "检查配置和客户端状态")
  .option("--json", "输出 JSON")
  .action(async (options) => {
    const report = await app.doctor();
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    printDoctor(report);
  });

cli.command("config <action>", "配置命令：path / validate / schema")
  .option("--json", "输出 JSON")
  .action(async (action: string, options) => {
  if (action === "path") {
    console.log(await app.configPath());
    return;
  }
  if (action === "validate") {
    const result = await app.validateConfig();
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.ok ? 0 : 1;
      return;
    }
    printValidation(result);
    return;
  }
  if (action === "schema") {
    console.log(JSON.stringify(agentSwitchJsonSchema(), null, 2));
    return;
  }
  throw new Error(`Unsupported config action: ${action}`);
});

cli.command("client <action> [client]", "客户端命令：list / detect / show / use-proxy")
  .option("--json", "输出 JSON")
  .option("--dry-run", "只输出变更计划，不写入客户端配置")
  .option("-y, --yes", "跳过交互确认，但不跳过硬校验")
  .action(async (action: string, client: string | undefined, options) => {
    if (action === "list") {
      const clients = await app.listClients();
      if (options.json) {
        console.log(JSON.stringify(clients, null, 2));
        return;
      }
      for (const item of clients) {
        console.log(`${pc.cyan(item.id)} ${pc.dim(item.configPath)}`);
      }
      return;
    }
    if (action === "detect") {
      if (client) {
        const detection = await app.detectClient(parseClientId(client));
        if (options.json) {
          console.log(JSON.stringify(detection, null, 2));
          return;
        }
        console.log(`${detection.configExists ? pc.green("OK") : pc.yellow("MISS")} ${client} ${pc.dim(detection.configPath)}`);
        return;
      }
      const clients = await app.listClients();
      const detections = await app.detectClients();
      if (options.json) {
        console.log(JSON.stringify(detections, null, 2));
        return;
      }
      detections.forEach((detection, index) => {
        const item = clients[index];
        console.log(`${detection.configExists ? pc.green("OK") : pc.yellow("MISS")} ${item?.id ?? "unknown"} ${pc.dim(detection.configPath)}`);
      });
      return;
    }
    if (action === "show") {
      if (!client) throw new Error("Missing client");
      const id = parseClientId(client);
      console.log(JSON.stringify(await app.getClientCurrent(id), null, 2));
      return;
    }
    if (action === "use-proxy") {
      if (!client) throw new Error("Missing client");
      const result = await app.useClientProxy({ clientId: parseClientId(client), yes: Boolean(options.yes) && !options.dryRun });
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      printPatchPlan(result.plan);
      if (options.dryRun) {
        console.log(pc.yellow("dry-run：未写入客户端配置"));
        return;
      }
      if (result.requiresConfirmation) {
        if (!(await confirm("应用以上配置变更？"))) {
          console.log(pc.yellow("已取消，未写入客户端配置"));
          return;
        }
        await app.applyPlan(result.plan);
        console.log(pc.green("OK 已应用"));
        return;
      }
      console.log(pc.green("OK 已应用"));
      return;
    }
    throw new Error(`Unsupported client action: ${action}`);
  });

cli
  .command("provider <action> [id] [value]", "provider 命令：list / show / add / edit / remove / test / model-add / model-remove")
  .option("--id <id>", "provider id")
  .option("--name <name>", "显示名称")
  .option("--type <type>", `provider 类型：${selectableProviderTypes.map((type) => `${type} (${providerTypeLabels[type]})`).join(", ")}`)
  .option("--base-url <url>", "OpenAI-compatible base URL")
  .option("--api-key-env <name>", "API key 环境变量名")
  .option("--api-key <key>", "内联 API key，不推荐")
  .option("--model <model>", "模型 ID，可重复", { default: [] })
  .option("--default-model <model>", "provider 默认模型")
  .option("--json", "输出 JSON")
  .option("-y, --yes", "跳过确认")
  .action(async (action: string, id: string | undefined, value: string | undefined, options) => {
    if (action === "list") {
      const providers = await app.listProviders(true);
      if (options.json) {
        console.log(JSON.stringify(providers, null, 2));
        return;
      }
      printProviders(providers);
      return;
    }
    if (action === "preset-list") {
      const presets = listProviderPresets();
      if (options.json) {
        console.log(JSON.stringify(presets.map(({ toProvider: _toProvider, ...preset }) => preset), null, 2));
        return;
      }
      for (const preset of presets) {
        console.log(`${pc.cyan(preset.id)} ${preset.name} ${pc.dim(preset.baseUrl ?? "no baseUrl")}`);
        console.log(`  ${pc.dim("models:")} ${preset.models.join(", ")}`);
      }
      return;
    }
    if (action === "preset-show") {
      if (!id) throw new Error("Missing preset id");
      const preset = getProviderPreset(id);
      if (!preset) throw new Error(`Provider preset not found: ${id}`);
      const { toProvider: _toProvider, ...safePreset } = preset;
      console.log(JSON.stringify(safePreset, null, 2));
      return;
    }
    if (action === "preset-add") {
      if (!id) throw new Error("Missing preset id");
      const provider = await app.addProviderPreset(id, { apiKeyEnv: optionalString(options.apiKeyEnv) });
      if (options.json) {
        console.log(JSON.stringify(provider, null, 2));
        return;
      }
      console.log(`${pc.green("OK")} provider preset ${id} 已保存为 ${provider.id}`);
      return;
    }
    if (action === "show") {
      if (!id) throw new Error("Missing provider id");
      const provider = (await app.listProviders(true)).find((item) => item.id === id);
      if (!provider) throw new Error(`Provider not found: ${id}`);
      console.log(JSON.stringify(provider, null, 2));
      return;
    }
    if (action === "add") {
      const provider = providerFromOptions(options);
      await app.addProvider(provider);
      console.log(`${pc.green("OK")} provider ${provider.id} 已保存`);
      return;
    }
    if (action === "model-add") {
      if (!id) throw new Error("Missing provider id");
      const model = stringOption(value ?? firstModelOption(options.model), "model");
      const provider = await app.addProviderModel(id, model);
      console.log(`${pc.green("OK")} provider ${provider.id} model added ${model}`);
      return;
    }
    if (action === "model-remove") {
      if (!id) throw new Error("Missing provider id");
      const model = stringOption(value ?? firstModelOption(options.model), "model");
      const provider = await app.removeProviderModel(id, model);
      console.log(`${pc.green("OK")} provider ${provider.id} model removed ${model}`);
      return;
    }
    if (action === "default-model") {
      if (!id) throw new Error("Missing provider id");
      const model = stringOption(value ?? optionalString(options.defaultModel), "default-model");
      const provider = await app.setProviderDefaultModel(id, model);
      console.log(`${pc.green("OK")} provider ${provider.id} default model ${model}`);
      return;
    }
    if (action === "edit") {
      if (!id) throw new Error("Missing provider id");
      const current = (await app.listProviders(false)).find((provider) => provider.id === id);
      if (!current) throw new Error(`Provider not found: ${id}`);
      const next = providerFromOptions({ ...options, id, name: options.name ?? current.name, type: options.type ?? current.type }, current);
      await app.addProvider(next);
      console.log(`${pc.green("OK")} provider ${id} 已更新`);
      return;
    }
    if (action === "remove") {
      if (!id) throw new Error("Missing provider id");
      if (!options.yes && !(await confirm(`删除 provider ${id}？`))) return;
      const removed = await app.removeProvider(id);
      console.log(removed ? `${pc.green("OK")} 已删除 ${id}` : `${pc.yellow("MISS")} provider 不存在`);
      return;
    }
    if (action === "test") {
      if (!id) throw new Error("Missing provider id");
      printValidation(await app.testProvider(id));
      return;
    }
    throw new Error(`Unsupported provider action: ${action}`);
  });

cli.command("model <action>", "模型命令：list")
  .option("--json", "输出 JSON")
  .action(async (action: string, options) => {
    if (action === "list") {
      const models = await app.listModelTargets();
      if (options.json) {
        console.log(JSON.stringify(models, null, 2));
        return;
      }
      if (models.length === 0) {
        console.log(pc.dim("暂无模型。使用 provider add 或 provider preset-add 添加。"));
        return;
      }
      for (const model of models) {
        const tags: string[] = [];
        if (model.isProviderDefault) tags.push("default");
        if (model.routeIndex !== undefined) tags.push(model.routeIndex === 0 ? "primary" : `fallback ${model.routeIndex}`);
        const suffix = tags.length > 0 ? ` ${pc.dim(`[${tags.join(", ")}]`)}` : "";
        console.log(`${pc.cyan(model.ref)} ${pc.dim(model.providerName)} ${pc.dim(model.providerType)}${suffix}`);
      }
      return;
    }
    throw new Error(`Unsupported model action: ${action}`);
  });

cli
  .command("use <client> <target>", "高级：直接写入客户端原生 provider/model，例如 qwen openrouter/qwen/qwen3-coder")
  .option("--dry-run", "只输出变更计划，不写入客户端配置")
  .option("--json", "输出 JSON")
  .option("-y, --yes", "跳过交互确认，但不跳过硬校验")
  .action(async (client: string, target: string, options) => {
    const result = await app.useClient({ clientId: parseClientId(client), target, yes: Boolean(options.yes) && !options.dryRun });
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    printPatchPlan(result.plan);
    if (options.dryRun) {
      console.log(pc.yellow("dry-run：未写入客户端配置"));
      return;
    }
    if (result.requiresConfirmation) {
      if (!(await confirm("应用以上配置变更？"))) {
        console.log(pc.yellow("已取消，未写入客户端配置"));
        return;
      }
      await app.applyPlan(result.plan);
      console.log(pc.green("OK 已应用"));
      return;
    }
    console.log(pc.green("OK 已应用"));
  });

cli
  .command("use-all <target>", "高级：批量直接写入所有支持客户端的原生 provider/model")
  .option("--dry-run", "只输出变更计划，不写入客户端配置")
  .option("--json", "输出 JSON")
  .option("-y, --yes", "跳过交互确认，但不跳过硬校验")
  .action(async (target: string, options) => {
    const result = await app.useAllClients({ target, yes: Boolean(options.yes) && !options.dryRun });
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    for (const item of result.results) {
      switch (item.status) {
        case "planned":
        case "applied":
          console.log(`${item.status === "applied" ? pc.green("APPLIED") : pc.yellow("PLAN")} ${item.clientId}`);
          printPatchPlan(item.plan);
          break;
        case "skipped":
          console.log(`${pc.dim("SKIP")} ${item.clientId} ${item.reason}`);
          break;
        case "failed":
          console.log(`${pc.red("FAIL")} ${item.clientId} ${item.reason}`);
          break;
      }
    }

    if (!options.yes || options.dryRun) {
      console.log(pc.yellow("未写入或未完全写入。使用 -y 应用所有 planned 项。"));
    }
  });

cli.command("current", "显示所有客户端当前 provider/model").action(async () => {
  const status = await app.status();
  for (const client of status.clients) {
    console.log(`${pc.cyan(client.clientId)} ${client.providerId ?? "-"} ${client.modelId ?? "-"}`);
  }
});

cli.command("route <action> [target]", "路由命令：list / set-default / add-fallback / remove / clear")
  .option("--json", "输出 JSON")
  .action(async (action: string, target: string | undefined, options) => {
    if (action === "list") {
      const route = (await app.loadConfig()).routes.default?.candidates ?? [];
      if (options.json) {
        console.log(JSON.stringify({ candidates: route }, null, 2));
        return;
      }
      if (route.length === 0) {
        console.log(pc.dim("默认路由未配置。代理会按 provider 默认模型或第一个模型路由。"));
        return;
      }
      route.forEach((candidate, index) => {
        const prefix = index === 0 ? pc.green("primary") : pc.yellow(`fallback ${index}`);
        console.log(`${prefix} ${candidate.providerId}/${candidate.modelId}`);
      });
      return;
    }
    if (action === "set-default") {
      if (!target) throw new Error("Missing route target");
      const route = await app.setDefaultRoute(target);
      console.log(`${pc.green("OK")} default route ${formatRoute(route)}`);
      return;
    }
    if (action === "add-fallback") {
      if (!target) throw new Error("Missing route target");
      const route = await app.addRouteFallback(target);
      console.log(`${pc.green("OK")} default route ${formatRoute(route)}`);
      return;
    }
    if (action === "remove") {
      if (!target) throw new Error("Missing route target");
      const route = await app.removeRouteCandidate(target);
      console.log(`${pc.green("OK")} default route ${formatRoute(route)}`);
      return;
    }
    if (action === "clear") {
      await app.clearDefaultRoute();
      console.log(`${pc.green("OK")} default route cleared`);
      return;
    }
  throw new Error(`Unsupported route action: ${action}`);
  });

cli.command("completion <shell>", "输出 shell completion：zsh / bash").action((shell: string) => {
  console.log(completionScript(shell));
});

cli.command("proxy <action>", "代理命令：start / stop / status / enable / disable / set")
  .option("--daemon", "后台启动代理")
  .option("--foreground", "前台启动代理")
  .option("--force", "忽略 proxy.enabled 配置，直接前台启动")
  .option("--host <host>", "代理监听地址")
  .option("--port <port>", "代理监听端口")
  .option("--upstream-proxy <url>", "上游网络代理，例如 http://127.0.0.1:7890")
  .option("--retry <enabled>", "是否启用重试：true / false")
  .option("--max-attempts <n>", "最大重试次数")
  .option("--failover <enabled>", "是否启用自动切换：true / false")
  .option("--json", "输出 JSON")
  .action(async (action: string, options) => {
  if (action === "start") {
    if (options.force) await app.updateProxyConfig({ enabled: true });
    if (options.daemon && !options.foreground) {
      const pid = startProxyDaemon();
      console.log(`${pc.green("OK")} proxy daemon starting pid=${pid}`);
      return;
    }
    await startProxy();
    return;
  }
  if (action === "stop") {
    const stopped = await stopProxy();
    console.log(stopped ? pc.green("OK 已发送停止信号") : pc.yellow("没有正在运行的 agent-switch proxy"));
    return;
  }
  if (action === "status") {
    const status = await proxyStatus();
    if (options.json) {
      const config = await app.loadConfig();
      console.log(JSON.stringify({ ...status, proxy: config.proxy }, null, 2));
      return;
    }
    console.log(status.running ? `${pc.green("running")} pid=${status.pid}` : pc.yellow("stopped"));
    return;
  }
  if (action === "enable") {
    const proxy = await app.updateProxyConfig({ enabled: true });
    console.log(`${pc.green("OK")} proxy enabled ${proxy.host}:${proxy.port}`);
    return;
  }
  if (action === "disable") {
    const proxy = await app.updateProxyConfig({ enabled: false });
    console.log(`${pc.green("OK")} proxy disabled ${proxy.host}:${proxy.port}`);
    return;
  }
  if (action === "set") {
    const proxy = await app.updateProxyConfig({
      host: optionalString(options.host),
      port: optionalNumber(options.port),
      upstreamProxy: optionalString(options.upstreamProxy),
      retryEnabled: optionalBoolean(options.retry),
      maxAttempts: optionalNumber(options.maxAttempts),
      failoverEnabled: optionalBoolean(options.failover),
    });
    console.log(`${pc.green("OK")} proxy ${proxy.enabled ? "enabled" : "disabled"} ${proxy.host}:${proxy.port}`);
    console.log(`${pc.dim("upstream proxy:")} ${proxy.upstreamProxy ?? "none"}`);
    console.log(`${pc.dim("retry:")} ${proxy.retry.enabled} maxAttempts=${proxy.retry.maxAttempts}`);
    console.log(`${pc.dim("failover:")} ${proxy.failover.enabled}`);
    return;
  }
  throw new Error(`Unsupported proxy action: ${action}`);
});

cli.parse(process.argv, { run: false });

try {
  await cli.runMatchedCommand();
} catch (error) {
  console.error(pc.red((error as Error).message));
  process.exitCode = 1;
}

function providerFromOptions(options: Record<string, unknown>, current?: ProviderProfile): ProviderProfile {
  const id = stringOption(options.id, "id", current?.id);
  const name = stringOption(options.name, "name", current?.name ?? id);
  const type = stringOption(options.type, "type", current?.type ?? "openai-chat-compatible") as ProviderProfile["type"];
  const models = normalizeModels(options.model).map((model) => ({ id: model }));
  const provider: ProviderProfile = {
    id,
    name,
    type,
    models: models.length > 0 ? models : current?.models ?? [],
  };
  const defaultModel = optionalString(options.defaultModel, current?.defaultModel);
  if (defaultModel) {
    if (!provider.models.some((model) => model.id === defaultModel)) {
      throw new Error(`Model not found for provider ${id}: ${defaultModel}`);
    }
    provider.defaultModel = defaultModel;
  }
  const baseUrl = optionalString(options.baseUrl, current?.baseUrl);
  if (baseUrl) provider.baseUrl = baseUrl;
  const apiKeyEnv = optionalString(options.apiKeyEnv, current?.apiKeyEnv);
  if (apiKeyEnv) provider.apiKeyEnv = apiKeyEnv;
  const apiKey = optionalString(options.apiKey, undefined);
  if (apiKey) provider.apiKey = { kind: "inline", value: apiKey };
  else if (current?.apiKey) provider.apiKey = current.apiKey;
  return provider;
}

function stringOption(value: unknown, name: string, fallback?: string): string {
  const resolved = optionalString(value, fallback);
  if (!resolved) throw new Error(`Missing --${name}`);
  return resolved;
}

function optionalString(value: unknown, fallback?: string): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  return fallback;
}

function normalizeModels(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function firstModelOption(value: unknown): string | undefined {
  if (Array.isArray(value)) return value.length > 0 ? String(value[0]) : undefined;
  if (typeof value === "string") return value;
  return undefined;
}

function formatRoute(route: { providerId: string; modelId: string }[]): string {
  return route.length > 0 ? route.map((item) => `${item.providerId}/${item.modelId}`).join(" -> ") : "empty";
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`Expected integer, got ${String(value)}`);
  return parsed;
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (value === true || value === false) return value;
  if (String(value).toLowerCase() === "true") return true;
  if (String(value).toLowerCase() === "false") return false;
  throw new Error(`Expected true or false, got ${String(value)}`);
}
