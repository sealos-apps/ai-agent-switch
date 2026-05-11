import pc from "picocolors";
import type { AppStatus, DoctorReport } from "../core/app";
import type { ProviderProfile, ValidationResult } from "../config/schema";
import type { ClientId, PatchPlan } from "../clients";

export function printProviders(providers: ProviderProfile[]): void {
  if (providers.length === 0) {
    console.log(pc.dim("暂无 provider。使用 provider add 添加。"));
    return;
  }

  for (const provider of providers) {
    const models = provider.models.map((model) => model.id).join(", ");
    console.log(`${pc.cyan(provider.id)} ${pc.dim(provider.type)} ${provider.baseUrl ?? pc.dim("no baseUrl")}`);
    console.log(`  ${pc.dim("models:")} ${models}`);
    if (provider.apiKeyEnv) console.log(`  ${pc.dim("apiKeyEnv:")} ${provider.apiKeyEnv}`);
    if (provider.apiKey) console.log(`  ${pc.dim("apiKey:")} ${provider.apiKey.kind === "inline" ? provider.apiKey.value : `$${provider.apiKey.name}`}`);
  }
}

export function printStatus(status: AppStatus): void {
  console.log(pc.bold("agent-switch status"));
  console.log(`${pc.dim("config:")} ${status.configPath}`);
  console.log(`${pc.dim("state:")} ${status.statePath}`);
  console.log(`${pc.dim("proxy:")} ${status.proxy.enabled ? pc.green("enabled") : pc.yellow("disabled")} ${status.proxy.host}:${status.proxy.port}`);
  console.log(`${pc.dim("upstream proxy:")} ${status.proxy.upstreamProxy ?? pc.dim("none")}`);
  const route = status.routes.default?.candidates ?? [];
  console.log(`${pc.dim("default route:")} ${route.length > 0 ? route.map((item) => `${item.providerId}/${item.modelId}`).join(" -> ") : pc.dim("not configured")}`);
  if (status.state.lastSwitch) {
    console.log(
      `${pc.dim("last switch:")} ${status.state.lastSwitch.clientId} ${status.state.lastSwitch.providerId}/${status.state.lastSwitch.modelId} ${pc.dim(
        status.state.lastSwitch.at,
      )}`,
    );
  }
  console.log("");
  console.log(pc.bold("clients"));
  for (const client of status.clients) {
    console.log(
      `${pc.cyan(client.clientId)} ${client.providerId ?? pc.dim("no provider")} ${client.modelId ?? pc.dim("no model")} ${pc.dim(client.configPath)}`,
    );
  }
  console.log("");
  console.log(pc.bold("providers"));
  printProviders(status.providers);
}

export function printDoctor(report: DoctorReport): void {
  for (const check of report.checks) {
    const mark = check.ok ? pc.green("OK") : pc.red("FAIL");
    console.log(`${mark} ${check.name} ${pc.dim(check.detail)}`);
  }
  process.exitCode = report.ok ? 0 : 1;
}

export function printValidation(result: ValidationResult): void {
  if (result.ok) {
    console.log(pc.green("OK"));
    return;
  }
  console.log(pc.red("FAIL"));
  for (const issue of result.issues) console.log(`- ${issue}`);
  process.exitCode = 1;
}

export function printPatchPlan(plan: PatchPlan): void {
  console.log(pc.bold(plan.summary));
  for (const file of plan.files) {
    const beforeLength = file.before?.length ?? 0;
    console.log(`${pc.dim("file:")} ${file.path}`);
    console.log(`${pc.dim("change:")} ${beforeLength} bytes -> ${file.after.length} bytes`);
  }
}

export function parseClientId(value: string): ClientId {
  const allowed = ["codex", "gemini", "qwen", "openclaw", "hermes", "crush", "opencode", "cowagent", "claude-code"] as const;
  if (!allowed.includes(value as ClientId)) {
    throw new Error(`Unsupported client: ${value}`);
  }
  return value as ClientId;
}
