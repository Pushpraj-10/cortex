import { useState } from "react";

// ---- Where the transcript is scrolled to ----
//
// The transcript sits bottom-anchored in a fixed-height viewport. Scrolling up is "this many rows from the bottom", so 0
// follows the newest content. The numbers are plain rows measured after layout; the maths is pure, so it is tested alone.

export interface ScrollState {
  /** Rows scrolled up from the bottom; 0 follows the newest content. */
  offset: number;
  /** The transcript's full height as last measured; 0 before the first measurement. */
  contentHeight: number;
  /** The most it can be scrolled up: the content's height less what the viewport shows. */
  max: number;
}

export const initialScroll: ScrollState = { offset: 0, contentHeight: 0, max: 0 };

/**
 * A new measurement of the transcript and of the rows its viewport shows. While scrolled up, rows that arrive push the
 * offset up by as many, so the text being read stays where it is; at the bottom the view simply follows. The offset never
 * passes what there is to scroll to (the conversation got shorter, the window got taller).
 */
export function afterMeasure(state: ScrollState, contentHeight: number, viewportHeight: number): ScrollState {
  const max = Math.max(0, contentHeight - viewportHeight);
  const grew = state.contentHeight > 0 ? contentHeight - state.contentHeight : 0;
  const offset = Math.min(max, state.offset > 0 && grew > 0 ? state.offset + grew : state.offset);
  if (offset === state.offset && contentHeight === state.contentHeight && max === state.max) return state;
  return { offset, contentHeight, max };
}

/** Scrolls by `rows`: up (towards older content) when positive, down when negative, within the limits. */
export function scrolledBy(state: ScrollState, rows: number): ScrollState {
  const offset = Math.min(state.max, Math.max(0, state.offset + rows));
  return offset === state.offset ? state : { ...state, offset };
}

/** Back to following the newest content. */
export function scrolledToBottom(state: ScrollState): ScrollState {
  return state.offset === 0 ? state : { ...state, offset: 0 };
}

// ---- The hook ----

export interface TranscriptScroll {
  /** Rows scrolled up from the bottom. */
  offset: number;
  scrollUp(rows: number): void;
  scrollDown(rows: number): void;
  toBottom(): void;
  /** For the transcript to report its full height and the rows its viewport shows, after each layout. */
  onMeasure(contentHeight: number, viewportHeight: number): void;
}

export function useTranscriptScroll(): TranscriptScroll {
  const [state, setState] = useState(initialScroll);
  return {
    offset: state.offset,
    scrollUp: (rows) => setState((current) => scrolledBy(current, rows)),
    scrollDown: (rows) => setState((current) => scrolledBy(current, -rows)),
    toBottom: () => setState(scrolledToBottom),
    // Returns the same state when nothing changed, so measuring after every render does not cause another render.
    onMeasure: (contentHeight, viewportHeight) => setState((current) => afterMeasure(current, contentHeight, viewportHeight)),
  };
}
