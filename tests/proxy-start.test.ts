import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AgentSwitchApp } from "../src/core/app";
import { assertProxyStartAllowed, startProxyDaemon } from "../src/proxy/server";

describe("proxy start checks", () => {
  test("refuses to start when proxy is disabled", async () => {
    const home = await mkdtemp(join(tmpdir(), "agent-switch-proxy-start-"));
    try {
      const app = new AgentSwitchApp({ homeDir: home, cwd: home });
      await app.addProvider({
        id: "local",
        name: "Local",
        type: "openai-compatible",
        baseUrl: "http://127.0.0.1:11434/v1",
        models: [{ id: "model" }],
      });

      const config = await app.loadConfig();
      expect(() => assertProxyStartAllowed(config)).toThrow("Proxy is disabled");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("starts daemon in a detached process group", () => {
    const originalArgv = process.argv;
    let unrefCalled = false;
    let detached: boolean | undefined;
    try {
      process.argv = ["bun", "/tmp/agent-switch.js"];
      const pid = startProxyDaemon((argv, options) => {
        expect(argv).toEqual([process.execPath, "/tmp/agent-switch.js", "proxy", "start", "--foreground"]);
        detached = options.detached;
        return {
          pid: 12345,
          unref() {
            unrefCalled = true;
          },
        };
      });

      expect(pid).toBe(12345);
      expect(detached).toBe(true);
      expect(unrefCalled).toBe(true);
    } finally {
      process.argv = originalArgv;
    }
  });
});
