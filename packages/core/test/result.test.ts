import { describe, expect, it } from "vitest";
import { CortexError, err, ok } from "../src/result.js";

describe("ok and err", () => {
  it("ok wraps a value", () => {
    expect(ok(42)).toEqual({ ok: true, value: 42 });
  });

  it("err wraps a CortexError", () => {
    const error = new CortexError("boom", "TEST_BOOM");
    expect(err(error)).toEqual({ ok: false, error });
  });

  it("narrows by the ok flag", () => {
    const result = ok("fine") as ReturnType<typeof ok<string>> | ReturnType<typeof err>;
    if (result.ok) expect(result.value).toBe("fine");
    else throw new Error("expected ok");
  });
});

describe("CortexError", () => {
  it("is an Error carrying a message, a stable code and an optional cause", () => {
    const cause = new Error("root cause");
    const error = new CortexError("something failed", "TEST_FAILED", cause);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("something failed");
    expect(error.code).toBe("TEST_FAILED");
    expect(error.cause).toBe(cause);
  });

  it("names itself after the concrete subclass", () => {
    class SpecificError extends CortexError {
      constructor() {
        super("specific", "TEST_SPECIFIC");
      }
    }
    const error = new SpecificError();

    expect(error.name).toBe("SpecificError");
    expect(error).toBeInstanceOf(CortexError);
  });

  it("leaves the cause undefined when none is given", () => {
    expect(new CortexError("m", "C").cause).toBeUndefined();
  });
});
