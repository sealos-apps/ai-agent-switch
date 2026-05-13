import { describe, expect, test } from "bun:test";
import { binaryPathForCommand, platformPackageName, runCommand } from "../bin/launcher.js";

describe("npm launcher", () => {
  test("maps linux x64 to the linux platform package", () => {
    expect(platformPackageName({ platform: "linux", arch: "x64" })).toBe("ai-agent-switch-linux-x64");
  });

  test("maps windows x64 to the windows platform package", () => {
    expect(platformPackageName({ platform: "win32", arch: "x64" })).toBe("ai-agent-switch-windows-x64");
  });

  test("builds unix binary paths from the command name", () => {
    expect(binaryPathForCommand("/tmp/pkg", "ai-agent-switch", false)).toBe("/tmp/pkg/ai-agent-switch");
    expect(binaryPathForCommand("/tmp/pkg", "as", false)).toBe("/tmp/pkg/as");
  });

  test("builds windows binary paths with exe suffix", () => {
    expect(binaryPathForCommand("/tmp/pkg", "ai-agent-switch", true)).toBe("/tmp/pkg/ai-agent-switch.exe");
    expect(binaryPathForCommand("/tmp/pkg", "as", true)).toBe("/tmp/pkg/as.exe");
  });

  test("runCommand resolves the platform package and forwards argv", () => {
    const calls: Array<{ binaryPath: string; argv: string[]; options: { stdio: string } }> = [];
    const status = runCommand("as", {
      runtime: { platform: "win32", arch: "x64" },
      argv: ["doctor", "--json"],
      requireFn: {
        resolve: (specifier: string) => {
          expect(specifier).toBe("ai-agent-switch-windows-x64/package.json");
          return "/tmp/node_modules/ai-agent-switch-windows-x64/package.json";
        },
      },
      spawnFn: (binaryPath: string, argv: string[], options: { stdio: string }) => {
        calls.push({ binaryPath, argv, options });
        return { status: 0 };
      },
    });

    expect(status).toBe(0);
    expect(calls).toEqual([
      {
        binaryPath: "/tmp/node_modules/ai-agent-switch-windows-x64/as.exe",
        argv: ["doctor", "--json"],
        options: { stdio: "inherit" },
      },
    ]);
  });
});
