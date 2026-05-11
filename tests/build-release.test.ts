import { describe, expect, test } from "bun:test";
import { platformConfig, renderSha256Line, runtimeReleasePlatform } from "../scripts/build-release";

describe("release build helpers", () => {
  test("windows platform uses exe suffix", () => {
    const config = platformConfig("windows-x64");

    expect(config.binarySuffix).toBe(".exe");
    expect(config.archiveName).toBe("agent-switch-windows-x64.tar.gz");
    expect(config.binaryName("agent-switch")).toBe("agent-switch.exe");
    expect(config.binaryName("as")).toBe("as.exe");
  });

  test("unix platform keeps bare executable names", () => {
    const config = platformConfig("darwin-arm64");

    expect(config.binarySuffix).toBe("");
    expect(config.archiveName).toBe("agent-switch-darwin-arm64.tar.gz");
    expect(config.binaryName("agent-switch")).toBe("agent-switch");
    expect(config.binaryName("as")).toBe("as");
  });

  test("sha256 lines use standard spacing", () => {
    expect(renderSha256Line("deadbeef", "agent-switch-linux-x64.tar.gz")).toBe(
      "deadbeef  agent-switch-linux-x64.tar.gz",
    );
  });

  test("runtime platform detection maps supported hosts", () => {
    expect(runtimeReleasePlatform({ platform: "darwin", arch: "arm64" })).toBe("darwin-arm64");
    expect(runtimeReleasePlatform({ platform: "win32", arch: "x64" })).toBe("windows-x64");
  });
});
