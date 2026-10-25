import { describe, expect, it } from "vitest";
import { afterMeasure, initialScroll, scrolledBy, scrolledToBottom, type ScrollState } from "../../../src/ui/hooks/useTranscriptScroll.js";

const state = (offset: number, contentHeight: number, max: number): ScrollState => ({ offset, contentHeight, max });

describe("afterMeasure", () => {
  it("takes the first measurement as it is: nothing to scroll to until the content is taller than the viewport", () => {
    expect(afterMeasure(initialScroll, 50, 10)).toEqual(state(0, 50, 40));
    expect(afterMeasure(initialScroll, 8, 10)).toEqual(state(0, 8, 0));
  });

  it("returns the very same state when nothing changed, so measuring after every render cannot loop", () => {
    const measured = state(5, 50, 40);
    expect(afterMeasure(measured, 50, 10)).toBe(measured);
  });

  it("follows the newest content when at the bottom: the offset stays 0 as the content grows", () => {
    expect(afterMeasure(state(0, 50, 40), 56, 10)).toEqual(state(0, 56, 46));
  });

  it("keeps the text being read where it is while scrolled up and rows arrive", () => {
    expect(afterMeasure(state(5, 50, 40), 53, 10)).toEqual(state(8, 53, 43));
  });

  it("does not move the view when the content shrinks by less than the room above", () => {
    expect(afterMeasure(state(5, 50, 40), 47, 10)).toEqual(state(5, 47, 37));
  });

  it("never offsets past what there is to scroll to, when the conversation got shorter", () => {
    expect(afterMeasure(state(30, 50, 40), 20, 10)).toEqual(state(10, 20, 10));
    expect(afterMeasure(state(30, 50, 40), 5, 10)).toEqual(state(0, 5, 0));
  });

  it("limits the offset when the viewport gets taller", () => {
    expect(afterMeasure(state(40, 50, 40), 50, 30)).toEqual(state(20, 50, 20));
  });

  it("allows more to scroll back through when the viewport gets shorter, and leaves the offset alone", () => {
    expect(afterMeasure(state(4, 50, 40), 50, 8)).toEqual(state(4, 50, 42));
  });
});

describe("scrolledBy", () => {
  it("scrolls up towards older content, and stops at the top", () => {
    expect(scrolledBy(state(0, 50, 40), 18)).toEqual(state(18, 50, 40));
    expect(scrolledBy(state(30, 50, 40), 18)).toEqual(state(40, 50, 40));
  });

  it("scrolls down towards the newest, and stops at the bottom", () => {
    expect(scrolledBy(state(30, 50, 40), -18)).toEqual(state(12, 50, 40));
    expect(scrolledBy(state(10, 50, 40), -18)).toEqual(state(0, 50, 40));
  });

  it("returns the same state when it cannot move, so nothing re-renders", () => {
    const atTop = state(40, 50, 40);
    const atBottom = state(0, 50, 40);
    const nothingToScroll = state(0, 8, 0);
    expect(scrolledBy(atTop, 5)).toBe(atTop);
    expect(scrolledBy(atBottom, -5)).toBe(atBottom);
    expect(scrolledBy(nothingToScroll, 5)).toBe(nothingToScroll);
  });
});

describe("scrolledToBottom", () => {
  it("goes back to following the newest content", () => {
    expect(scrolledToBottom(state(25, 50, 40))).toEqual(state(0, 50, 40));
  });

  it("returns the same state when already there", () => {
    const atBottom = state(0, 50, 40);
    expect(scrolledToBottom(atBottom)).toBe(atBottom);
  });
});
