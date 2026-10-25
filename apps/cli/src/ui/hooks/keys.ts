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
