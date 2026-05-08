import { describe, expect, test } from "bun:test";
import { parseUseTarget } from "../src/cli/use";

describe("use command parsing", () => {
  test("accepts provider/model refs where model contains slashes", () => {
    expect(parseUseTarget("openrouter/qwen/qwen3-coder")).toEqual({
      providerId: "openrouter",
      modelId: "qwen/qwen3-coder",
    });
  });

  test("rejects malformed refs", () => {
    expect(() => parseUseTarget("openrouter")).toThrow("Expected provider/model");
  });
});
