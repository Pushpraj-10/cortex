import { useState } from "react";

// ---- Pure text-editing primitives, so the hook below stays a thin wrapper ----

export interface TextState {
  value: string;
  /** Index into `value` where the next character is inserted. */
  cursor: number;
}

export function insertAt(state: TextState, text: string): TextState {
  return {
    value: state.value.slice(0, state.cursor) + text + state.value.slice(state.cursor),
    cursor: state.cursor + text.length,
  };
}

/** Deletes the character before the cursor (backspace). A no-op at the start. */
export function deleteBefore(state: TextState): TextState {
  if (state.cursor === 0) return state;
  return {
    value: state.value.slice(0, state.cursor - 1) + state.value.slice(state.cursor),
    cursor: state.cursor - 1,
  };
}

export function moveCursor(state: TextState, delta: number): TextState {
  return { ...state, cursor: Math.min(state.value.length, Math.max(0, state.cursor + delta)) };
}

export interface CursorLocation {
  line: number;
  col: number;
}

/** Maps a flat string offset to a (line, column) position, accounting for \n boundaries. */
export function locateCursor(value: string, offset: number): CursorLocation {
  const lines = value.split("\n");
  let remaining = offset;

  for (let i = 0; i < lines.length; i += 1) {
    const lineLength = lines[i]?.length ?? 0;
    if (remaining <= lineLength) return { line: i, col: remaining };
    remaining -= lineLength + 1; // +1 for the newline consumed between lines
  }

  const lastLine = lines.length - 1;
  return { line: lastLine, col: lines[lastLine]?.length ?? 0 };
}

// ---- Words and lines: movement and deletion ----

/** A word is a run of non-whitespace; movement skips the whitespace before it, like a shell's alt+b / alt+f. */
export function wordStartBefore(value: string, offset: number): number {
  let i = offset;
  while (i > 0 && /\s/.test(value[i - 1]!)) i -= 1;
  while (i > 0 && !/\s/.test(value[i - 1]!)) i -= 1;
  return i;
}

export function wordEndAfter(value: string, offset: number): number {
  let i = offset;
  while (i < value.length && /\s/.test(value[i]!)) i += 1;
  while (i < value.length && !/\s/.test(value[i]!)) i += 1;
  return i;
}

export function moveWordLeft(state: TextState): TextState {
  return { ...state, cursor: wordStartBefore(state.value, state.cursor) };
}

export function moveWordRight(state: TextState): TextState {
  return { ...state, cursor: wordEndAfter(state.value, state.cursor) };
}

/** Offset of the first character of the line the cursor is on. */
export function lineStartOf(value: string, offset: number): number {
  return value.lastIndexOf("\n", offset - 1) + 1;
}

/** Offset just past the last character of the line the cursor is on (before its newline). */
export function lineEndOf(value: string, offset: number): number {
  const newline = value.indexOf("\n", offset);
  return newline === -1 ? value.length : newline;
}

export function moveToLineStart(state: TextState): TextState {
  return { ...state, cursor: lineStartOf(state.value, state.cursor) };
}

export function moveToLineEnd(state: TextState): TextState {
  return { ...state, cursor: lineEndOf(state.value, state.cursor) };
}

/** ctrl+w: deletes the word before the cursor (and the whitespace between it and the cursor). */
export function deleteWordBefore(state: TextState): TextState {
  const start = wordStartBefore(state.value, state.cursor);
  return { value: state.value.slice(0, start) + state.value.slice(state.cursor), cursor: start };
}

/** ctrl+u: deletes from the start of the line to the cursor. */
export function deleteToLineStart(state: TextState): TextState {
  const start = lineStartOf(state.value, state.cursor);
  return { value: state.value.slice(0, start) + state.value.slice(state.cursor), cursor: start };
}

/** ctrl+k: deletes from the cursor to the end of the line; at the end of a line it joins the next line instead. */
export function deleteToLineEnd(state: TextState): TextState {
  const end = lineEndOf(state.value, state.cursor);
  const stop = end === state.cursor && end < state.value.length ? end + 1 : end;
  return { value: state.value.slice(0, state.cursor) + state.value.slice(stop), cursor: state.cursor };
}

/**
 * Up (-1) or down (+1) one line, keeping the column where the line is long enough. Returns undefined when there is no
 * line that way, so the caller can fall back to something else (history recall).
 */
export function moveVertical(state: TextState, direction: -1 | 1): TextState | undefined {
  const { line, col } = locateCursor(state.value, state.cursor);
  const lines = state.value.split("\n");
  const target = line + direction;
  if (target < 0 || target >= lines.length) return undefined;

  let offset = 0;
  for (let i = 0; i < target; i += 1) offset += lines[i]!.length + 1;
  return { ...state, cursor: offset + Math.min(col, lines[target]!.length) };
}

/** A backslash right before the cursor followed by enter means "newline, don't send"; undefined when there is none. */
export function continueLine(state: TextState): TextState | undefined {
  if (state.value[state.cursor - 1] !== "\\") return undefined;
  return insertAt(deleteBefore(state), "\n");
}

/**
 * Text that arrived in one piece (a paste) as it should be stored: terminals send a pressed return as `\r`, so every
 * line break becomes `\n`, tabs become spaces, and other control characters (an escape sequence's tail, say) are dropped.
 * For a one-line field (an API key) the line breaks are dropped too, so a pasted key's trailing newline is not part of it.
 */
export function normalizePaste(text: string, options: { singleLine?: boolean } = {}): string {
  const unified = text.replace(/\r\n?/g, "\n").replace(/\t/g, options.singleLine ? "" : "  ");
  return unified.replace(options.singleLine ? /[\u0000-\u001f\u007f]/g : /[\u0000-\u0009\u000b-\u001f\u007f]/g, "");
}

// ---- useTextInput ----

export interface TextInput {
  value: string;
  cursorOffset: number;
  insert(text: string): void;
  deleteBackward(): void;
  moveLeft(): void;
  moveRight(): void;
  /** Replaces the whole value; the cursor goes to `cursor`, or the end when omitted. */
  set(value: string, cursor?: number): void;
  /** Applies one of the editing functions above to the current text; like the others, safe under fast input. */
  apply(edit: (state: TextState) => TextState): void;
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
    apply: (edit) => setState(edit),
  };
}
