import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { parse as parseJsonc } from "jsonc-parser";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { writeAtomic } from "../fs/atomic";
import type { PatchPlan } from "./types";

export async function readTextIfExists(path: string): Promise<string | undefined> {
  if (!existsSync(path)) return undefined;
  return readFile(path, "utf8");
}

export async function applyPatchPlan(plan: PatchPlan): Promise<void> {
  for (const file of plan.files) {
    await writeAtomic(file.path, file.after);
  }
}

export async function ensureParent(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}

export function parseJsonObject(text: string | undefined): Record<string, unknown> {
  if (!text || text.trim() === "") return {};
  const parsed = JSON.parse(text) as unknown;
  return asRecord(parsed);
}

export function parseJsoncObject(text: string | undefined): Record<string, unknown> {
  if (!text || text.trim() === "") return {};
  return asRecord(parseJsonc(text));
}

export function stringifyJson(data: unknown): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

export function parseTomlObject(text: string | undefined): Record<string, unknown> {
  if (!text || text.trim() === "") return {};
  return asRecord(parseToml(text));
}

export function stringifyTomlObject(data: Record<string, unknown>): string {
  return stringifyToml(data).trimEnd() + "\n";
}

export function parseYamlObject(text: string | undefined): Record<string, unknown> {
  if (!text || text.trim() === "") return {};
  return asRecord(parseYaml(text) ?? {});
}

export function stringifyYamlObject(data: Record<string, unknown>): string {
  return stringifyYaml(data).trimEnd() + "\n";
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function recordAt(root: Record<string, unknown>, key: string): Record<string, unknown> {
  const current = root[key];
  if (current && typeof current === "object" && !Array.isArray(current)) {
    return current as Record<string, unknown>;
  }
  const next: Record<string, unknown> = {};
  root[key] = next;
  return next;
}

export function envKeyForProvider(providerId: string): string {
  return `${providerId.toUpperCase().replaceAll(/[^A-Z0-9]/g, "_")}_API_KEY`;
}

export async function writeEnvValue(path: string, key: string, value: string): Promise<void> {
  const existing = await readTextIfExists(path);
  const lines = existing ? existing.split(/\r?\n/).filter(Boolean) : [];
  const assignment = `${key}=${JSON.stringify(value)}`;
  const next = lines.some((line) => line.startsWith(`${key}=`))
    ? lines.map((line) => (line.startsWith(`${key}=`) ? assignment : line))
    : [...lines, assignment];
  await ensureParent(path);
  await writeFile(path, `${next.join("\n")}\n`, { mode: 0o600 });
}

export async function commandExists(command: string): Promise<boolean> {
  const executable = process.platform === "win32" ? "where" : "which";
  const proc = Bun.spawn([executable, command], {
    stdout: "ignore",
    stderr: "ignore",
  });
  const exitCode = await proc.exited;
  return exitCode === 0;
}
