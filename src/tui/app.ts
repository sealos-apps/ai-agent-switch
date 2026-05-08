import pc from "picocolors";
import type { AgentSwitchApp, AppStatus } from "../core/app";
import type { ClientId } from "../clients";

type Candidate = {
  providerId: string;
  modelId: string;
  label: string;
};

export async function runTui(app: AgentSwitchApp): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    const status = await app.status();
    renderStatic(status);
    return;
  }

  let status = await app.status();
  let selectedClient = 0;
  let selectedCandidate = 0;
  let message = "j/k 选择客户端，n/p 选择模型，Enter 应用，r 刷新，q 退出";

  const refresh = async () => {
    status = await app.status();
    selectedClient = clamp(selectedClient, 0, Math.max(0, status.clients.length - 1));
    selectedCandidate = clamp(selectedCandidate, 0, Math.max(0, candidates(status).length - 1));
    render(status, selectedClient, selectedCandidate, message);
  };

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  render(status, selectedClient, selectedCandidate, message);

  await new Promise<void>((resolve) => {
    const onData = (key: string) => {
      void (async () => {
        if (key === "\u0003" || key === "q") {
          cleanup(onData);
          resolve();
          return;
        }
        if (key === "j" || key === "\u001b[B") selectedClient++;
        if (key === "k" || key === "\u001b[A") selectedClient--;
        if (key === "n" || key === "\u001b[C") selectedCandidate++;
        if (key === "p" || key === "\u001b[D") selectedCandidate--;
        if (key === "r") {
          message = "已刷新";
          await refresh();
          return;
        }
        if (key === "\r") {
          const client = status.clients[selectedClient];
          const candidate = candidates(status)[selectedCandidate];
          if (!client || !candidate) {
            message = "没有可应用的客户端或模型";
          } else {
            try {
              await app.useClient({
                clientId: client.clientId as ClientId,
                target: `${candidate.providerId}/${candidate.modelId}`,
                yes: true,
              });
              message = `已应用 ${client.clientId} -> ${candidate.label}`;
              status = await app.status();
            } catch (error) {
              message = `错误：${(error as Error).message}`;
            }
          }
        }
        selectedClient = clamp(selectedClient, 0, Math.max(0, status.clients.length - 1));
        selectedCandidate = clamp(selectedCandidate, 0, Math.max(0, candidates(status).length - 1));
        render(status, selectedClient, selectedCandidate, message);
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

function render(status: AppStatus, selectedClient: number, selectedCandidate: number, message: string): void {
  const rows = process.stdout.rows || 30;
  const cols = process.stdout.columns || 100;
  const allCandidates = candidates(status);
  process.stdout.write("\x1b[?25l\x1b[2J\x1b[H");
  writeLine(pc.bold(pc.cyan("agent-switch")) + pc.dim("  多 Agent Provider / Model 控制台"), cols);
  writeLine(pc.dim(`config ${status.configPath}`), cols);
  writeLine("─".repeat(Math.min(cols, 120)), cols);

  const bodyRows = Math.max(8, rows - 8);
  for (let i = 0; i < bodyRows; i++) {
    const client = status.clients[i];
    const candidate = allCandidates[i];
    const left = client
      ? `${i === selectedClient ? pc.inverse(" ") : " "} ${pc.cyan(client.clientId.padEnd(12))} ${(client.providerId ?? "-").padEnd(14)} ${client.modelId ?? "-"}`
      : "";
    const right = candidate
      ? `${i === selectedCandidate ? pc.inverse(" ") : " "} ${pc.green(candidate.providerId.padEnd(14))} ${candidate.modelId}`
      : "";
    writeLine(twoColumn(left, right, cols), cols);
  }

  writeLine("─".repeat(Math.min(cols, 120)), cols);
  writeLine(
    `proxy ${status.proxy.enabled ? pc.green("on") : pc.yellow("off")} ${status.proxy.host}:${status.proxy.port} upstream ${
      status.proxy.upstreamProxy ?? "none"
    }`,
    cols,
  );
  const route = status.routes.default?.candidates ?? [];
  writeLine(`route ${route.length > 0 ? route.map((item) => `${item.providerId}/${item.modelId}`).join(" -> ") : "not configured"}`, cols);
  writeLine(pc.dim(message), cols);
}

function twoColumn(left: string, right: string, cols: number): string {
  const split = Math.floor(cols * 0.52);
  return left.padEnd(split) + right;
}

function writeLine(line: string, cols: number): void {
  process.stdout.write(`${line.slice(0, Math.max(0, cols - 1))}\n`);
}

function candidates(status: AppStatus): Candidate[] {
  return status.providers.flatMap((provider) =>
    provider.models.map((model) => ({
      providerId: provider.id,
      modelId: model.id,
      label: `${provider.id}/${model.id}`,
    })),
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
