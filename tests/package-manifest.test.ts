import { describe, expect, test } from "bun:test";

describe("root package manifest", () => {
  test("optionalDependencies stay aligned with the package version", async () => {
    const packageJson = JSON.parse(await Bun.file(new URL("../package.json", import.meta.url)).text()) as {
      version: string;
      optionalDependencies: Record<string, string>;
    };

    expect(packageJson.optionalDependencies).toEqual({
      "@ai-agent-switch/linux-x64": packageJson.version,
      "@ai-agent-switch/darwin-arm64": packageJson.version,
      "@ai-agent-switch/darwin-x64": packageJson.version,
      "@ai-agent-switch/windows-x64": packageJson.version,
    });
  });
});
