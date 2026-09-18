import { describe, expect, it } from "vitest";
import { parseDotEnv } from "../../src/wiring/parse-dot-env.js";

describe("parseDotEnv", () => {
  it("parses KEY=VALUE lines", () => {
    expect(parseDotEnv("FOO=bar\nBAZ=qux")).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("skips blank lines and # comments", () => {
    expect(parseDotEnv("# a comment\n\nFOO=bar\n  \n# another\nBAZ=qux")).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("trims whitespace around keys and values", () => {
    expect(parseDotEnv("  FOO  =  bar  ")).toEqual({ FOO: "bar" });
  });

  it("strips matching surrounding quotes from values", () => {
    expect(parseDotEnv('FOO="bar"\nBAZ=\'qux\'')).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("leaves mismatched or partial quotes untouched", () => {
    expect(parseDotEnv('FOO="bar')).toEqual({ FOO: '"bar' });
  });

  it("keeps the rest of the line intact when the value itself contains =", () => {
    expect(parseDotEnv("URL=http://localhost:11434/api?x=1")).toEqual({ URL: "http://localhost:11434/api?x=1" });
  });

  it("ignores a line with no = separator", () => {
    expect(parseDotEnv("not a valid line\nFOO=bar")).toEqual({ FOO: "bar" });
  });

  it("returns an empty object for empty input", () => {
    expect(parseDotEnv("")).toEqual({});
  });
});
