import { describe, expect, test } from "bun:test";
import { packageVersion } from "../src/cli/version";

describe("root package manifest", () => {
  test("optionalDependencies stay aligned with the package version", async () => {
    const packageJson = JSON.parse(await Bun.file(new URL("../package.json", import.meta.url)).text()) as {
      version: string;
      optionalDependencies: Record<string, string>;
    };

    expect(packageJson.optionalDependencies).toEqual({
      "ai-agent-switch-linux-x64": packageJson.version,
      "ai-agent-switch-darwin-arm64": packageJson.version,
      "ai-agent-switch-darwin-x64": packageJson.version,
      "ai-agent-switch-windows-x64": packageJson.version,
    });
  });

  test("CLI version stays aligned with the package version", async () => {
    const packageJson = JSON.parse(await Bun.file(new URL("../package.json", import.meta.url)).text()) as {
      version: string;
    };

    expect(packageVersion()).toBe(packageJson.version);
  });
});
