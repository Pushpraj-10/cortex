/** Pure text-editing primitives behind the input box, so the React hook stays a thin wrapper. */

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
