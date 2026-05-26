import { readFile } from "node:fs/promises";
import { describe, expect, test } from "bun:test";
import { releaseAssetName, platformPackageConfig } from "../scripts/build-npm-package";

describe("release binary install contract", () => {
  test("linux x64 release asset uses tar.gz name for template curl install", () => {
    const config = platformPackageConfig("linux-x64", "0.1.3");

    expect(releaseAssetName(config)).toBe("ai-agent-switch-linux-x64.tar.gz");
  });

  test("windows release asset keeps zip suffix", () => {
    const config = platformPackageConfig("windows-x64", "0.1.3");

    expect(releaseAssetName(config)).toBe("ai-agent-switch-windows-x64.zip");
  });

  test("install script downloads GitHub release assets and verifies version", async () => {
    const text = await readFile("install.sh", "utf8");

    expect(text).toContain("curl -fsSL https://raw.githubusercontent.com/sealos-apps/ai-agent-switch/main/install.sh | sh -s -- v0.1.3");
    expect(text).toContain("AI_AGENT_SWITCH_REPO=\"${AI_AGENT_SWITCH_REPO:-sealos-apps/ai-agent-switch}\"");
    expect(text).toContain("v*.*.*)");
    expect(text).toContain("mktemp -d 2>/dev/null || mktemp -d -t ai-agent-switch");
    expect(text).toContain("ai-agent-switch-linux-x64.tar.gz");
    expect(text).toContain("ai-agent-switch --version");
  });

  test("release workflow uploads binary assets to GitHub releases", async () => {
    const text = await readFile(".github/workflows/release.yml", "utf8");

    expect(text).toContain("Pack release binary");
    expect(text).toContain("ai-agent-switch-${{ matrix.platform }}.tar.gz");
    expect(text).toContain("gh release upload");
    expect(text).toContain("contents: read");
    expect(text).toContain("contents: write");
  });
});
