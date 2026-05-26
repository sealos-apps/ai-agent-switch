import { describe, expect, test } from "bun:test";
import { platformPackageConfig, renderPackageManifest, runtimePackagePlatform } from "../scripts/build-npm-package";
import { providerTypeForModelApiMode } from "../src/config/schema";

describe("npm package builder", () => {
  test("windows package uses exe suffix and public access", () => {
    const config = platformPackageConfig("windows-x64", "0.1.0");
    const manifest = renderPackageManifest(config);

    expect(config.packageName).toBe("ai-agent-switch-windows-x64");
    expect(config.binarySuffix).toBe(".exe");
    expect(config.binaryName("ai-agent-switch")).toBe("ai-agent-switch.exe");
    expect(config.binaryName("as")).toBe("as.exe");
    expect(manifest.name).toBe("ai-agent-switch-windows-x64");
    expect(manifest.os).toEqual(["win32"]);
    expect(manifest.cpu).toEqual(["x64"]);
    expect(manifest.bin["ai-agent-switch"]).toBe("./ai-agent-switch.exe");
    expect(manifest.bin.as).toBe("./as.exe");
    expect(manifest.files).toEqual(["ai-agent-switch.exe", "as.exe"]);
    expect(manifest.publishConfig.access).toBe("public");
  });

  test("unix package keeps bare executable names", () => {
    const config = platformPackageConfig("darwin-arm64", "0.1.0");
    const manifest = renderPackageManifest(config);

    expect(config.binarySuffix).toBe("");
    expect(config.binaryName("ai-agent-switch")).toBe("ai-agent-switch");
    expect(config.binaryName("as")).toBe("as");
    expect(manifest.os).toEqual(["darwin"]);
    expect(manifest.cpu).toEqual(["arm64"]);
    expect(manifest.bin["ai-agent-switch"]).toBe("./ai-agent-switch");
    expect(manifest.bin.as).toBe("./as");
    expect(manifest.files).toEqual(["ai-agent-switch", "as"]);
  });

  test("runtime platform detection maps supported hosts", () => {
    expect(runtimePackagePlatform({ platform: "darwin", arch: "arm64" })).toBe("darwin-arm64");
    expect(runtimePackagePlatform({ platform: "win32", arch: "x64" })).toBe("windows-x64");
  });

  test("provider type mapping rejects unexpected model API modes", () => {
    expect(() => providerTypeForModelApiMode("responses" as never)).toThrow("Unsupported model API mode: responses");
  });
});
