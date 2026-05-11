import { createHash } from "node:crypto";
import { chmod, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

export type ReleasePlatform = "linux-x64" | "darwin-arm64" | "darwin-x64" | "windows-x64";

export type ReleasePlatformConfig = {
  platform: ReleasePlatform;
  binarySuffix: ".exe" | "";
  archiveName: string;
  rootDirName: string;
  binaryName: (baseName: string) => string;
};

export type RuntimePlatform = {
  platform: NodeJS.Platform;
  arch: string;
};

const supportedPlatforms = new Set<ReleasePlatform>(["linux-x64", "darwin-arm64", "darwin-x64", "windows-x64"]);

export function platformConfig(platform: ReleasePlatform): ReleasePlatformConfig {
  if (!supportedPlatforms.has(platform)) {
    throw new Error(`Unsupported release platform: ${platform}`);
  }

  const binarySuffix = platform === "windows-x64" ? ".exe" : "";
  return {
    platform,
    binarySuffix,
    archiveName: `agent-switch-${platform}.tar.gz`,
    rootDirName: `agent-switch-${platform}`,
    binaryName: (baseName: string) => `${baseName}${binarySuffix}`,
  };
}

export function renderSha256Line(hash: string, fileName: string) {
  return `${hash}  ${fileName}`;
}

export function runtimeReleasePlatform(runtime: RuntimePlatform = { platform: process.platform, arch: process.arch }): ReleasePlatform {
  if (runtime.platform === "win32" && runtime.arch === "x64") {
    return "windows-x64";
  }
  if (runtime.platform === "linux" && runtime.arch === "x64") {
    return "linux-x64";
  }
  if (runtime.platform === "darwin" && runtime.arch === "arm64") {
    return "darwin-arm64";
  }
  if (runtime.platform === "darwin" && runtime.arch === "x64") {
    return "darwin-x64";
  }
  throw new Error(`Unsupported runtime platform: ${runtime.platform}/${runtime.arch}`);
}

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

async function sha256File(filePath: string) {
  const content = await readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

export type BuildReleaseOptions = {
  platform: ReleasePlatform;
  outDir: string;
  entrypoint?: string;
};

export type BuildReleaseResult = {
  platform: ReleasePlatform;
  archivePath: string;
  checksumPath: string;
  rootDirPath: string;
};

export async function buildRelease(options: BuildReleaseOptions): Promise<BuildReleaseResult> {
  const runtimePlatform = runtimeReleasePlatform();
  if (runtimePlatform !== options.platform) {
    throw new Error(`Release platform ${options.platform} does not match runtime ${runtimePlatform}`);
  }

  const config = platformConfig(options.platform);
  const rootDirPath = path.resolve(options.outDir, config.platform, config.rootDirName);
  const archivePath = path.resolve(options.outDir, config.platform, config.archiveName);
  const checksumPath = path.resolve(options.outDir, config.platform, "SHA256SUMS");
  const entrypoint = options.entrypoint ?? path.resolve(repoRoot(), "src/cli/main.ts");
  const mainBinaryPath = path.join(rootDirPath, config.binaryName("agent-switch"));
  const aliasBinaryPath = path.join(rootDirPath, config.binaryName("as"));

  await rm(path.resolve(options.outDir, config.platform), { recursive: true, force: true });
  await mkdir(rootDirPath, { recursive: true });

  execFileSync(process.execPath, ["build", "--compile", "--outfile", mainBinaryPath, entrypoint], {
    stdio: "inherit",
  });

  await copyFile(mainBinaryPath, aliasBinaryPath);

  if (config.binarySuffix === "") {
    await chmod(mainBinaryPath, 0o755);
    await chmod(aliasBinaryPath, 0o755);
  }

  execFileSync("tar", ["-czf", archivePath, "-C", path.dirname(rootDirPath), config.rootDirName], {
    stdio: "inherit",
  });

  const digest = await sha256File(archivePath);
  await writeFile(checksumPath, `${renderSha256Line(digest, path.basename(archivePath))}\n`);

  return {
    platform: config.platform,
    archivePath,
    checksumPath,
    rootDirPath,
  };
}

type CliOptions = {
  platform?: ReleasePlatform;
  outDir: string;
  entrypoint?: string;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { outDir: path.resolve(repoRoot(), "dist", "release") };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--platform") {
      const value = argv[index + 1];
      if (!value) throw new Error("Missing value for --platform");
      options.platform = value as ReleasePlatform;
      index += 1;
      continue;
    }
    if (argument === "--out-dir") {
      const value = argv[index + 1];
      if (!value) throw new Error("Missing value for --out-dir");
      options.outDir = path.resolve(value);
      index += 1;
      continue;
    }
    if (argument === "--entrypoint") {
      const value = argv[index + 1];
      if (!value) throw new Error("Missing value for --entrypoint");
      options.entrypoint = path.resolve(value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

if (import.meta.main) {
  const options = parseArgs(process.argv.slice(2));
  if (!options.platform) {
    throw new Error("--platform is required");
  }
  const result = await buildRelease({
    platform: options.platform,
    outDir: options.outDir,
    ...(options.entrypoint ? { entrypoint: options.entrypoint } : {}),
  });
  console.log(JSON.stringify(result, null, 2));
}
