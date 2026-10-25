import React from "react";
import { describe, expect, it } from "vitest";
import {
  historyMatches,
  stepHistorySearch,
  useInputHistory,
  type HistorySearch,
  type InputHistory,
  type SearchKey,
} from "../../../src/ui/hooks/useInputHistory.js";
import { mountElement, settle } from "../support/render-frame.js";

describe("useInputHistory", () => {
  /** Mounts the hook over `entries`; `current()` is the handle from the latest render. */
  function mount(entries: string[]) {
    const handles: { history?: InputHistory } = {};
    function Harness() {
      handles.history = useInputHistory(entries);
      return null;
    }
    const mounted = mountElement(<Harness />);
    return { current: () => handles.history!, unmount: mounted.unmount };
  }

  it("recalls from the newest entry back, and returns to the draft past the newest", async () => {
    const { current, unmount } = mount(["one", "two", "three"]);
    expect(current().up("my draft")).toBe("three");
    await settle();
    expect(current().up("three")).toBe("two");
    await settle();
    expect(current().up("two")).toBe("one");
    await settle();
    expect(current().up("one")).toBe("one"); // already at the oldest
    await settle();
    expect(current().down()).toBe("two");
    await settle();
    expect(current().down()).toBe("three");
    await settle();
    expect(current().down()).toBe("my draft");
    unmount();
  });

  it("leaves the text alone when there is no history, and starts over after reset", async () => {
    const empty = mount([]);
    expect(empty.current().up("typed")).toBe("typed");
    empty.unmount();

    const { current, unmount } = mount(["one", "two"]);
    expect(current().up("")).toBe("two");
    await settle();
    current().reset();
    await settle();
    expect(current().up("")).toBe("two");
    unmount();
  });
});

describe("historyMatches", () => {
  const entries = ["fix the parser", "add tests", "Fix the Parser again", "fix the parser", "explain src/a.ts"];

  it("lists the entries containing the query, newest first, ignoring case", () => {
    expect(historyMatches(entries, "PARSER")).toEqual(["fix the parser", "Fix the Parser again"]);
  });

  it("lists every entry, newest first, once each, for an empty query", () => {
    expect(historyMatches(entries, "")).toEqual(["explain src/a.ts", "fix the parser", "Fix the Parser again", "add tests"]);
  });

  it("matches anywhere in a multi-line entry", () => {
    expect(historyMatches(["first line\nsecond line"], "second")).toEqual(["first line\nsecond line"]);
  });

  it("finds nothing for a query that is not there, and nothing in no history", () => {
    expect(historyMatches(entries, "zzz")).toEqual([]);
    expect(historyMatches([], "a")).toEqual([]);
  });
});

describe("stepHistorySearch", () => {
  const noKey: SearchKey = {
    ctrl: false,
    meta: false,
    return: false,
    escape: false,
    tab: false,
    backspace: false,
    delete: false,
    upArrow: false,
    downArrow: false,
    leftArrow: false,
    rightArrow: false,
  };
  const step = (search: HistorySearch, typed: string, flags: Partial<SearchKey> = {}, matchCount = 5) =>
    stepHistorySearch(search, typed, { ...noKey, ...flags }, matchCount);
  const at = (query: string, index = 0): HistorySearch => ({ query, index });

  it("narrows the query as letters are typed, going back to the newest match", () => {
    expect(step(at("pa", 3), "r")).toEqual({ search: at("par", 0) });
  });

  it("takes a pasted piece whole, without line breaks or control characters", () => {
    expect(step(at(""), "a\nb\u001bc")).toEqual({ search: at("abc") });
  });

  it("shortens the query with backspace or delete, and does nothing on an empty one", () => {
    expect(step(at("par", 2), "", { backspace: true })).toEqual({ search: at("pa", 0) });
    expect(step(at("par"), "", { delete: true })).toEqual({ search: at("pa", 0) });
    expect(step(at(""), "", { backspace: true })).toEqual({ search: at("", 0) });
  });

  it("goes to an older match with ctrl+r or up, and to a newer one with down, staying in range", () => {
    expect(step(at("p", 0), "r", { ctrl: true })).toEqual({ search: at("p", 1) });
    expect(step(at("p", 0), "", { upArrow: true })).toEqual({ search: at("p", 1) });
    expect(step(at("p", 4), "r", { ctrl: true }, 5)).toEqual({ search: at("p", 4) });
    expect(step(at("p", 0), "r", { ctrl: true }, 0)).toEqual({ search: at("p", 0) });
    expect(step(at("p", 2), "", { downArrow: true })).toEqual({ search: at("p", 1) });
    expect(step(at("p", 0), "", { downArrow: true })).toEqual({ search: at("p", 0) });
  });

  it("takes the shown match with enter, tab or a sideways arrow, and gives up with escape", () => {
    for (const flags of [{ return: true }, { tab: true }, { leftArrow: true }, { rightArrow: true }]) {
      expect(step(at("p", 1), "", flags).outcome).toBe("accept");
    }
    expect(step(at("p", 1), "", { escape: true }).outcome).toBe("cancel");
  });

  it("changes nothing for a key it has no use for, so a stray ctrl or alt key does not type its letter", () => {
    expect(step(at("p", 1), "x", { ctrl: true })).toEqual({ search: at("p", 1) });
    expect(step(at("p", 1), "x", { meta: true })).toEqual({ search: at("p", 1) });
    expect(step(at("p", 1), "")).toEqual({ search: at("p", 1) });
  });
});
