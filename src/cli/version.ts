import packageJson from "../../package.json" with { type: "json" };

export function packageVersion(): string {
  return packageJson.version;
}
