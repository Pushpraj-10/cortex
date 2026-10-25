import { describe, expect, it } from "vitest";
import { matchRule } from "../../src/permissions/match-rule";

describe("matchRule", () => {
  it("matches by tool name alone", () => {
    expect(matchRule("Bash", "Bash", { command: "anything" })).toBe(true);
    expect(matchRule("Bash", "Read", {})).toBe(false);
  });

  it("matches exact, prefix:* and * patterns", () => {
    expect(matchRule("Bash(npm test)", "Bash", { command: "npm test" })).toBe(true);
    expect(matchRule("Bash(npm test)", "Bash", { command: "npm test -- x" })).toBe(false);
    expect(matchRule("Bash(npm test:*)", "Bash", { command: "npm test -- x" })).toBe(true);
    expect(matchRule("Read(src/*)", "Read", { file_path: "src/a.ts" })).toBe(true);
    expect(matchRule("Read(src/*)", "Read", { file_path: "lib/a.ts" })).toBe(false);
  });
});
