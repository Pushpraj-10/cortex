import { useState } from "react";
import { deleteBefore, insertAt, moveCursor, type TextState } from "../text-edit.js";

export interface TextInput {
  value: string;
  cursorOffset: number;
  insert(text: string): void;
  deleteBackward(): void;
  moveLeft(): void;
  moveRight(): void;
  /** Replaces the whole value; the cursor goes to `cursor`, or the end when omitted. */
  set(value: string, cursor?: number): void;
}

/** The input box's text and cursor. Updates are functional so fast typing or pasting never loses a keystroke. */
export function useTextInput(): TextInput {
  const [state, setState] = useState<TextState>({ value: "", cursor: 0 });

  return {
    value: state.value,
    cursorOffset: state.cursor,
    insert: (text) => setState((s) => insertAt(s, text)),
    deleteBackward: () => setState(deleteBefore),
    moveLeft: () => setState((s) => moveCursor(s, -1)),
    moveRight: () => setState((s) => moveCursor(s, 1)),
    set: (value, cursor) => setState({ value, cursor: cursor ?? value.length }),
  };
}
