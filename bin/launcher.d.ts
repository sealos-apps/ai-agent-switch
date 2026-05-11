export interface RuntimePlatform {
  platform: NodeJS.Platform;
  arch: string;
}

export interface LauncherOptions {
  runtime?: RuntimePlatform;
  requireFn?: {
    resolve(specifier: string): string;
  };
  spawnFn?: (binaryPath: string, argv: string[], options: { stdio: "inherit" }) => { error?: Error; status?: number | null };
  argv?: string[];
}

export function platformPackageName(runtime?: RuntimePlatform): string;
export function binaryPathForCommand(packageRoot: string, commandName: string, isWindows?: boolean): string;
export function resolvePlatformPackageRoot(runtime?: RuntimePlatform, requireFn?: { resolve(specifier: string): string }): string;
export function runCommand(commandName: string, options?: LauncherOptions): number;
