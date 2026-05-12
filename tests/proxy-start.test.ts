import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AiAgentSwitchApp } from "../src/core/app";
import { assertProxyStartAllowed, startProxyDaemon } from "../src/proxy/server";

describe("proxy start checks", () => {
  test("refuses to start when proxy is disabled", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-proxy-start-"));
    try {
      const app = new AiAgentSwitchApp({ homeDir: home, cwd: home });
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

  test("starts daemon in a detached process group from a source script", async () => {
    const originalArgv = process.argv;
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-proxy-daemon-"));
    const script = join(home, "ai-agent-switch.js");
    let unrefCalled = false;
    let detached: boolean | undefined;
    try {
      await writeFile(script, "");
      process.argv = ["bun", script];
      const pid = startProxyDaemon((argv, options) => {
        expect(argv).toEqual([process.execPath, script, "proxy", "start", "--foreground"]);
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
      await rm(home, { recursive: true, force: true });
    }
  });

  test("starts daemon directly from a compiled executable", () => {
    const originalArgv = process.argv;
    let unrefCalled = false;
    try {
      process.argv = ["bun", "/$bunfs/root/ai-agent-switch", "proxy", "start", "--daemon"];
      const pid = startProxyDaemon((argv) => {
        expect(argv).toEqual([process.execPath, "proxy", "start", "--foreground"]);
        return {
          pid: 12346,
          unref() {
            unrefCalled = true;
          },
        };
      });

      expect(pid).toBe(12346);
      expect(unrefCalled).toBe(true);
    } finally {
      process.argv = originalArgv;
    }
  });
});
