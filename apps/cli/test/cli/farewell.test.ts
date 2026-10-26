import { describe, expect, it } from "vitest";
import { REPO_URL, farewell, wantsColor } from "../../src/cli/farewell.js";

describe("farewell", () => {
  it("points at the repository", () => {
    expect(farewell(false)).toContain(REPO_URL);
  });

  it("is plain text, with no escape codes, when colour is off", () => {
    expect(farewell(false)).not.toContain("\x1b");
  });

  it("is coloured when colour is on", () => {
    expect(farewell(true)).toContain("\x1b[");
  });
});

describe("wantsColor", () => {
  it("colours a real terminal", () => {
    expect(wantsColor({ TERM: "xterm-256color" }, true)).toBe(true);
  });

  it("does not colour piped output", () => {
    expect(wantsColor({ TERM: "xterm-256color" }, false)).toBe(false);
  });

  it("honours NO_COLOR and a dumb terminal", () => {
    expect(wantsColor({ NO_COLOR: "1" }, true)).toBe(false);
    expect(wantsColor({ TERM: "dumb" }, true)).toBe(false);
  });
});
