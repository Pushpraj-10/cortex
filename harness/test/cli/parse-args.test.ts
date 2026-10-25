import { describe, expect, it } from "vitest";
import { parseArgs } from "../../src/cli/parse-args";

describe("parseArgs", () => {
  it("reads --mode and -p values", () => {
    expect(parseArgs(["--mode", "plan", "-p", "fix the bug"])).toEqual({ mode: "plan", prompt: "fix the bug" });
  });

  it("leaves absent flags undefined", () => {
    expect(parseArgs([])).toEqual({ mode: undefined, prompt: undefined });
  });
});
