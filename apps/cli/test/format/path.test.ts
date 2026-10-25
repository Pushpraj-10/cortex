import { describe, expect, it } from "vitest";
import { shortenPath, tildify } from "../../src/format/path.js";
import { displayWidth } from "../../src/format/table.js";

describe("tildify", () => {
  it("replaces the home directory with ~, keeping the rest and its separators", () => {
    expect(tildify("/home/ann/work/app", "/home/ann")).toBe("~/work/app");
    expect(tildify("C:\\Users\\pushp\\Project\\Cortex", "C:\\Users\\pushp")).toBe("~\\Project\\Cortex");
  });

  it("turns the home directory itself into ~", () => {
    expect(tildify("/home/ann", "/home/ann")).toBe("~");
    expect(tildify("/home/ann/", "/home/ann/")).toBe("~/");
  });

  it("ignores case, as Windows does, and mixed separators", () => {
    expect(tildify("c:\\users\\Pushp\\app", "C:\\Users\\pushp")).toBe("~\\app");
    expect(tildify("C:/Users/pushp/app", "C:\\Users\\pushp")).toBe("~/app");
  });

  it("leaves a path outside home alone, including one that merely starts with the same letters", () => {
    expect(tildify("/srv/app", "/home/ann")).toBe("/srv/app");
    expect(tildify("/home/annette/app", "/home/ann")).toBe("/home/annette/app");
  });

  it("does nothing without a home directory", () => {
    expect(tildify("/a/b", "")).toBe("/a/b");
  });
});

describe("shortenPath", () => {
  it("leaves a path that fits alone", () => {
    expect(shortenPath("~/work/app", 20)).toBe("~/work/app");
    expect(shortenPath("~/work/app", 10)).toBe("~/work/app");
  });

  it("drops folders from the start, keeping as many whole ones as fit", () => {
    expect(shortenPath("~/work/app/src/ui", 12)).toBe("…/app/src/ui");
    expect(shortenPath("~/work/app/src/ui", 11)).toBe("…/src/ui");
    expect(shortenPath("~/work/app/src/ui", 5)).toBe("…/ui");
  });

  it("works with Windows separators", () => {
    expect(shortenPath("D:\\Project(Development)\\Cortex", 10)).toBe("…\\Cortex");
  });

  it("cuts the start of the last folder when even that does not fit", () => {
    expect(shortenPath("~/a/verylongfoldername", 8)).toBe("…dername");
  });

  it("never returns more than the room it was given", () => {
    for (const max of [0, 1, 2, 3, 5, 8, 13, 40]) {
      expect(displayWidth(shortenPath("~/work/app/src/ui/components/deeply/nested", max))).toBeLessThanOrEqual(max);
    }
  });
});
