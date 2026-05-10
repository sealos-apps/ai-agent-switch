import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ConfigStore } from "../src/config/store";

describe("ConfigStore", () => {
  test("creates a default JSONC config lazily", async () => {
    const home = await mkdtemp(join(tmpdir(), "agent-switch-config-"));
    try {
      const store = new ConfigStore({ homeDir: home });
      const config = await store.load();

      expect(config.version).toBe(1);
      expect(config.proxy.enabled).toBe(false);
      expect(config.proxy.upstreamProxy).toBe("http://127.0.0.1:7890");
      expect(config.clients).toEqual({});
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("preserves JSONC comments when patching providers", async () => {
    const home = await mkdtemp(join(tmpdir(), "agent-switch-jsonc-"));
    try {
      const store = new ConfigStore({ homeDir: home });
      await store.ensure();
      const file = store.configPath;
      await writeFile(
        file,
        `{
  // keep me
  "version": 1,
  "clients": {},
  "providers": {},
  "routes": {},
  "proxy": { "enabled": false, "host": "127.0.0.1", "port": 17890, "upstreamProxy": "http://127.0.0.1:7890", "retry": { "enabled": true, "maxAttempts": 3 }, "failover": { "enabled": true, "strategy": "ordered" } },
  "ui": { "theme": "default" }
}
`,
      );

      await store.update((config) => {
        config.providers.local = {
          id: "local",
          name: "Local",
          type: "openai-compatible",
          baseUrl: "http://127.0.0.1:11434/v1",
          models: [{ id: "llama3.1" }],
        };
        return config;
      });

      const text = await readFile(file, "utf8");
      expect(text).toContain("// keep me");
      expect(text).toContain('"local"');
      expect(await store.validate()).toEqual({ ok: true, issues: [] });
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
