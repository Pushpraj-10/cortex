import { describe, expect, it } from "vitest";
import { packageNameOf } from "../../src/graph/package-name-of.js";

describe("packageNameOf", () => {
  it.each([
    ["lodash", "lodash"],
    ["lodash/fp", "lodash"],
    ["@cortex/shared", "@cortex/shared"],
    ["@cortex/shared/sub/path", "@cortex/shared"],
  ])("maps %s to %s", (specifier, expected) => {
    expect(packageNameOf(specifier)).toBe(expected);
  });

  it.each(["./a.js", "../b", "/abs/path", "node:fs", "@scopeOnly"])("returns undefined for %s", (specifier) => {
    expect(packageNameOf(specifier)).toBeUndefined();
  });
});
