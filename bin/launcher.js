#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const platformPackageNames = {
  "linux-x64": "@agent-switch/linux-x64",
  "darwin-arm64": "@agent-switch/darwin-arm64",
  "darwin-x64": "@agent-switch/darwin-x64",
  "windows-x64": "@agent-switch/windows-x64",
};

export function platformPackageName(runtime = { platform: process.platform, arch: process.arch }) {
  if (runtime.platform === "win32" && runtime.arch === "x64") return platformPackageNames["windows-x64"];
  if (runtime.platform === "linux" && runtime.arch === "x64") return platformPackageNames["linux-x64"];
  if (runtime.platform === "darwin" && runtime.arch === "arm64") return platformPackageNames["darwin-arm64"];
  if (runtime.platform === "darwin" && runtime.arch === "x64") return platformPackageNames["darwin-x64"];
  throw new Error(`Unsupported runtime platform: ${runtime.platform}/${runtime.arch}`);
}

export function binaryPathForCommand(packageRoot, commandName, isWindows = process.platform === "win32") {
  return join(packageRoot, `${commandName}${isWindows ? ".exe" : ""}`);
}

export function resolvePlatformPackageRoot(
  runtime = { platform: process.platform, arch: process.arch },
  requireFn = createRequire(import.meta.url),
) {
  const packageName = platformPackageName(runtime);
  try {
    return dirname(requireFn.resolve(`${packageName}/package.json`));
  } catch {
    throw new Error(`Platform package not found: ${packageName}`);
  }
}

export function runCommand(
  commandName,
  options = {},
) {
  const runtime = options.runtime ?? { platform: process.platform, arch: process.arch };
  const requireFn = options.requireFn ?? createRequire(import.meta.url);
  const spawn = options.spawnFn ?? spawnSync;
  const argv = options.argv ?? process.argv.slice(2);
  const packageRoot = resolvePlatformPackageRoot(runtime, requireFn);
  const binaryPath = binaryPathForCommand(packageRoot, commandName, runtime.platform === "win32");
  const result = spawn(binaryPath, argv, { stdio: "inherit" });
  if (result.error) {
    throw result.error;
  }
  return result.status ?? 1;
}
