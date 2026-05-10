import type { TuiInputAction } from "./types";

export function keyToTuiAction(key: string): TuiInputAction | undefined {
  if (key === "\u001b[B") return { type: "move", delta: 1 };
  if (key === "\u001b[A") return { type: "move", delta: -1 };
  if (key === "\r") return { type: "enter" };
  if (key === "\u001b") return { type: "escape" };
  if (key === "h") return { type: "help" };
  if (key === "q" || key === "\u0003") return { type: "quit" };
  if (key === " ") return { type: "toggle" };
  if (key === "A") return { type: "apply-all" };
  if (key === "a") return { type: "add" };
  if (key === "x") return { type: "remove" };
  if (key === "e") return { type: "edit" };
  if (key === "t") return { type: "test" };
  if (key === "d") return { type: "detect" };
  if (key === "v") return { type: "show" };
  if (key === "*") return { type: "default-model" };
  if (key === "r") return { type: "route-primary" };
  if (key === "f") return { type: "route-fallback" };
  return undefined;
}
