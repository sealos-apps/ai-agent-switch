import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { QwenAdapter } from "../src/clients/qwen";

describe("client detection", () => {
  test("reports executable detection separately from config existence", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-agent-switch-detect-"));
    try {
      const adapter = new QwenAdapter(home, {
        commandExists: async (command) => command === "qwen",
      });

      const detection = await adapter.detect();
      expect(detection.installed).toBe(true);
      expect(detection.configExists).toBe(false);
      expect(detection.details).toContain("Command available: qwen");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
