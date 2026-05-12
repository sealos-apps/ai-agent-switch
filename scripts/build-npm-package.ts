import { chmod, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

export type NpmPlatform = "linux-x64" | "darwin-arm64" | "darwin-x64" | "windows-x64";

export type NpmPlatformConfig = {
  platform: NpmPlatform;
  version: string;
  packageName: string;
  binarySuffix: ".exe" | "";
  os: "linux" | "darwin" | "win32";
  cpu: "x64" | "arm64";
  binaryName: (baseName: string) => string;
};

export type RuntimePlatform = {
  platform: NodeJS.Platform;
  arch: string;
};

export type BuildNpmPackageOptions = {
  platform: NpmPlatform;
  outDir: string;
  version?: string;
  entrypoint?: string;
};

export type BuildNpmPackageResult = {
  platform: NpmPlatform;
  packageRoot: string;
  packageJsonPath: string;
  mainBinaryPath: string;
  aliasBinaryPath: string;
};

const supportedPlatforms = new Set<NpmPlatform>(["linux-x64", "darwin-arm64", "darwin-x64", "windows-x64"]);

export function platformPackageConfig(platform: NpmPlatform, version: string): NpmPlatformConfig {
  if (!supportedPlatforms.has(platform)) {
    throw new Error(`Unsupported npm package platform: ${platform}`);
  }

  const binarySuffix = platform === "windows-x64" ? ".exe" : "";
  const os = platform === "windows-x64" ? "win32" : platform.split("-")[0];
  const cpu = platform.endsWith("arm64") ? "arm64" : "x64";

  return {
    platform,
    version,
    packageName: `@ai-agent-switch/${platform}`,
    binarySuffix,
    os: os as NpmPlatformConfig["os"],
    cpu,
    binaryName: (baseName: string) => `${baseName}${binarySuffix}`,
  };
}

export function runtimePackagePlatform(
  runtime: RuntimePlatform = { platform: process.platform, arch: process.arch },
): NpmPlatform {
  if (runtime.platform === "win32" && runtime.arch === "x64") return "windows-x64";
  if (runtime.platform === "linux" && runtime.arch === "x64") return "linux-x64";
  if (runtime.platform === "darwin" && runtime.arch === "arm64") return "darwin-arm64";
  if (runtime.platform === "darwin" && runtime.arch === "x64") return "darwin-x64";
  throw new Error(`Unsupported runtime platform: ${runtime.platform}/${runtime.arch}`);
}

export function renderPackageManifest(config: NpmPlatformConfig) {
  return {
    name: config.packageName,
    version: config.version,
    description: `ai-agent-switch standalone executable for ${config.platform}`,
    os: [config.os],
    cpu: [config.cpu],
    bin: {
      "ai-agent-switch": `./${config.binaryName("ai-agent-switch")}`,
      as: `./${config.binaryName("as")}`,
    },
    files: [config.binaryName("ai-agent-switch"), config.binaryName("as")],
    publishConfig: {
      access: "public",
    },
  };
}

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

async function readRootVersion(): Promise<string> {
  const packageJsonPath = path.resolve(repoRoot(), "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as { version?: string };
  if (!packageJson.version) {
    throw new Error("Missing root package version");
  }
  return packageJson.version;
}

export async function buildNpmPackage(options: BuildNpmPackageOptions): Promise<BuildNpmPackageResult> {
  const runtimePlatform = runtimePackagePlatform();
  if (runtimePlatform !== options.platform) {
    throw new Error(`NPM package platform ${options.platform} does not match runtime ${runtimePlatform}`);
  }

  const version = options.version ?? (await readRootVersion());
  const config = platformPackageConfig(options.platform, version);
  const packageRoot = path.resolve(options.outDir, config.packageName);
  const packageJsonPath = path.join(packageRoot, "package.json");
  const entrypoint = options.entrypoint ?? path.resolve(repoRoot(), "src/cli/main.ts");
  const mainBinaryPath = path.join(packageRoot, config.binaryName("ai-agent-switch"));
  const aliasBinaryPath = path.join(packageRoot, config.binaryName("as"));

  await rm(packageRoot, { recursive: true, force: true });
  await mkdir(packageRoot, { recursive: true });

  execFileSync(process.execPath, ["build", "--compile", "--outfile", mainBinaryPath, entrypoint], {
    stdio: "inherit",
  });

  await copyFile(mainBinaryPath, aliasBinaryPath);

  if (config.binarySuffix === "") {
    await chmod(mainBinaryPath, 0o755);
    await chmod(aliasBinaryPath, 0o755);
  }

  await writeFile(packageJsonPath, `${JSON.stringify(renderPackageManifest(config), null, 2)}\n`);

  return {
    platform: config.platform,
    packageRoot,
    packageJsonPath,
    mainBinaryPath,
    aliasBinaryPath,
  };
}

type CliOptions = {
  platform?: NpmPlatform;
  outDir: string;
  version?: string;
  entrypoint?: string;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { outDir: path.resolve(repoRoot(), "dist", "npm-packages") };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--platform") {
      const value = argv[index + 1];
      if (!value) throw new Error("Missing value for --platform");
      options.platform = value as NpmPlatform;
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
    if (argument === "--version") {
      const value = argv[index + 1];
      if (!value) throw new Error("Missing value for --version");
      options.version = value;
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
  const result = await buildNpmPackage({
    platform: options.platform,
    outDir: options.outDir,
    ...(options.version ? { version: options.version } : {}),
    ...(options.entrypoint ? { entrypoint: options.entrypoint } : {}),
  });
  console.log(JSON.stringify(result, null, 2));
}
