import { describe, expect, it } from "vitest";
import { globToRegex } from "../../../src/tools/_shared/glob-to-regex";

describe("globToRegex", () => {
  it("handles ** across directories, including zero", () => {
    const re = globToRegex("src/**/*.ts");
    expect(re.test("src/a.ts")).toBe(true);
    expect(re.test("src/x/y/a.ts")).toBe(true);
    expect(re.test("lib/a.ts")).toBe(false);
  });

  it("* does not cross slashes and dots are literal", () => {
    expect(globToRegex("*.ts").test("a/b.ts")).toBe(false);
    expect(globToRegex("a.ts").test("aXts")).toBe(false);
  });
});
