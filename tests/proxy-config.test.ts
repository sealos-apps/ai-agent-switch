import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AiAgentSwitchApp } from "../src/core/app";

describe("proxy config", () => {
  test("updates proxy enablement, upstream proxy, retry, and failover settings", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-proxy-config-"));
    try {
      const app = new AiAgentSwitchApp({ homeDir: home, cwd: home });
      await app.updateProxyConfig({
        enabled: true,
        host: "127.0.0.1",
        port: 18080,
        upstreamProxy: "http://127.0.0.1:7890",
        retryEnabled: false,
        maxAttempts: 1,
        failoverEnabled: false,
      });

      const config = await app.loadConfig();
      expect(config.proxy.enabled).toBe(true);
      expect(config.proxy.port).toBe(18080);
      expect(config.proxy.upstreamProxy).toBe("http://127.0.0.1:7890");
      expect(config.proxy.retry.enabled).toBe(false);
      expect(config.proxy.retry.maxAttempts).toBe(1);
      expect(config.proxy.failover.enabled).toBe(false);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
