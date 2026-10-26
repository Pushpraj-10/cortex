import { useEffect } from "react";
import { useStdin } from "ink";
import {
  deleteBefore,
  deleteToLineEnd,
  deleteToLineStart,
  deleteWordBefore,
  moveCursor,
  moveToLineEnd,
  moveToLineStart,
  moveWordLeft,
  moveWordRight,
  type TextState,
} from "./useTextInput.js";

// ---- The editing keymap ----

/** The parts of Ink's `Key` the keymap looks at. */
export interface EditingKey {
  ctrl: boolean;
  meta: boolean;
  backspace: boolean;
  delete: boolean;
  leftArrow: boolean;
  rightArrow: boolean;
}

export type TextEdit = (state: TextState) => TextState;

const CTRL_LETTERS: Record<string, TextEdit> = {
  a: moveToLineStart,
  e: moveToLineEnd,
  u: deleteToLineStart,
  k: deleteToLineEnd,
  w: deleteWordBefore,
};

/**
 * What a key does to the text: an edit to apply, `"ignore"` for a combination that should do nothing (so ctrl+x does not
 * type an "x"), or undefined when it is not an editing key and the caller decides (enter, up/down, plain typing).
 */
export function editFor(typed: string, key: EditingKey): TextEdit | "ignore" | undefined {
  if ((key.backspace || key.delete) && key.meta) return deleteWordBefore; // alt+backspace
  if (key.backspace || key.delete) return deleteBefore;
  if (key.leftArrow) return key.ctrl || key.meta ? moveWordLeft : (state) => moveCursor(state, -1);
  if (key.rightArrow) return key.ctrl || key.meta ? moveWordRight : (state) => moveCursor(state, 1);
  if (key.meta && typed === "b") return moveWordLeft;
  if (key.meta && typed === "f") return moveWordRight;
  if (key.ctrl) return Object.hasOwn(CTRL_LETTERS, typed) ? CTRL_LETTERS[typed] : "ignore";
  if (key.meta && typed) return "ignore"; // an alt+letter nothing is bound to
  return undefined;
}

// ---- The `@file` menu's keys ----

/** The parts of Ink's `Key` the menu looks at. */
export interface MenuKey {
  upArrow: boolean;
  downArrow: boolean;
  tab: boolean;
  return: boolean;
  escape: boolean;
  shift: boolean;
  meta: boolean;
}

export type MentionMenuAction = "previous" | "next" | "accept" | "dismiss";

/**
 * What a key does while the `@file` menu is open, or undefined when it is not for the menu (typing carries on). Tab always
 * picks the highlighted file. Enter picks it only once something is typed after the `@`, so a lone `@` in a message
 * ("meet @ 5pm") can still be sent; shift/alt+enter stay a newline.
 */
export function mentionMenuAction(key: MenuKey, query: string): MentionMenuAction | undefined {
  if (key.upArrow) return "previous";
  if (key.downArrow) return "next";
  if (key.tab) return "accept";
  if (key.return && !key.shift && !key.meta && query !== "") return "accept";
  if (key.escape) return "dismiss";
  return undefined;
}

// ---- Keys Ink's useInput does not report ----
//
// Ink parses Home and End but gives `useInput` no flag for them (the input is an empty string, the same as for Insert or
// the function keys), so they are recognised here from the raw sequence Ink hands to its own listeners.

export type EdgeKey = "home" | "end";

// Terminals disagree on how they spell these: `ESC [ H`, `ESC O H`, `ESC [ 1 ~`, `ESC [ 7 ~` (rxvt), and with a modifier `ESC [ 1 ; 5 H`.
const HOME = /^\u001b(?:\[(?:1;\d+)?H|OH|\[[17]~)$/;
const END = /^\u001b(?:\[(?:1;\d+)?F|OF|\[[48]~)$/;

/** Which of Home or End a raw chunk of terminal input is, if either. */
export function edgeKeyOf(sequence: string): EdgeKey | undefined {
  if (HOME.test(sequence)) return "home";
  if (END.test(sequence)) return "end";
  return undefined;
}

// ---- The mouse wheel ----
//
// With mouse reporting on (see terminal.ts) the terminal sends each wheel notch, click and drag as an SGR report,
// `ESC [ < button ; column ; row M` (or `m` on release). Wheel notches are buttons 64 (up) and 65 (down), plus 4, 8 and 16 for
// shift, alt and ctrl. Everything else is not wanted, but must not be typed into the box either.

const MOUSE_REPORT = /\u001b\[<(\d+);\d+;\d+[Mm]/g;
// Ink hands `useInput` the report without its leading ESC.
const TYPED_MOUSE_REPORT = /^\[<\d+;\d+;\d+[Mm]/;

/** Whether text `useInput` received is a mouse report, which the input box must ignore. */
export function isMouseReport(typed: string): boolean {
  return TYPED_MOUSE_REPORT.test(typed);
}

/** The wheel notches in a raw chunk of terminal input: positive for up (towards older content), negative for down, 0 for none. */
export function wheelRowsOf(sequence: string): number {
  let notches = 0;
  for (const report of sequence.matchAll(MOUSE_REPORT)) {
    const button = Number(report[1]);
    if ((button & 64) === 0) continue;
    notches += (button & 3) === 0 ? 1 : (button & 3) === 1 ? -1 : 0;
  }
  return notches;
}

/** Calls `onWheel` with the net notches (see `wheelRowsOf`) of each chunk of input that has any. */
export function useMouseWheel(onWheel: (notches: number) => void, isActive: boolean): void {
  const { internal_eventEmitter: emitter } = useStdin();

  useEffect(() => {
    if (!isActive || !emitter) return;
    const listener = (data: unknown) => {
      const notches = wheelRowsOf(String(data));
      if (notches !== 0) onWheel(notches);
    };
    emitter.on("input", listener);
    return () => {
      emitter.removeListener("input", listener);
    };
  }, [emitter, isActive, onWheel]);
}

/**
 * Calls `onKey` for Home and End. Ink keeps its raw-input emitter on the stdin context under an `internal_` name; if a
 * future Ink drops it these two keys quietly stop working (ctrl+a and ctrl+e still do the same thing).
 */
export function useHomeEnd(onKey: (key: EdgeKey) => void, isActive: boolean): void {
  const { internal_eventEmitter: emitter } = useStdin();

  useEffect(() => {
    if (!isActive || !emitter) return;
    const listener = (data: unknown) => {
      const key = edgeKeyOf(String(data));
      if (key) onKey(key);
    };
    emitter.on("input", listener);
    return () => {
      emitter.removeListener("input", listener);
    };
  }, [emitter, isActive, onKey]);
}
