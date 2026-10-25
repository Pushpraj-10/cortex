import { describe, expect, it } from "vitest";
import { parseArgs, UsageError } from "../../src/cli/args.js";

describe("parseArgs", () => {
  it("returns defaults for no arguments", () => {
    expect(parseArgs([])).toEqual({ ok: true, value: { help: false } });
  });

  it("reads --mode and -p", () => {
    expect(parseArgs(["--mode", "plan", "-p", "fix the bug"])).toEqual({
      ok: true,
      value: { help: false, mode: "plan", prompt: "fix the bug" },
    });
  });

  it("recognises -h and --help", () => {
    expect(parseArgs(["-h"])).toEqual({ ok: true, value: { help: true } });
    expect(parseArgs(["--help"])).toEqual({ ok: true, value: { help: true } });
  });

  it("rejects an unknown mode, naming the valid ones", () => {
    const result = parseArgs(["--mode", "yolo"]);
    expect(!result.ok && result.error).toBeInstanceOf(UsageError);
    expect(!result.ok && result.error.message).toContain("acceptEdits");
  });

  it("rejects a flag with no value", () => {
    expect(parseArgs(["-p"]).ok).toBe(false);
    expect(parseArgs(["--mode"]).ok).toBe(false);
  });

  it("rejects an unknown option", () => {
    const result = parseArgs(["--frobnicate"]);
    expect(!result.ok && result.error.message).toBe("Unknown option: --frobnicate");
  });
});
