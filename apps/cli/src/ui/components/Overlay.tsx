import React, { useMemo } from "react";
import { Box, Text } from "ink";
import { useTerminalSize } from "../hooks/terminal.js";

interface OverlayProps {
  /** Exactly how many rows `children` draw. The layout already counts them, so the caller passes that count. */
  rows: number;
  children: React.ReactNode;
}

/**
 * Draws `children` on top of the rows just above this spot (the bottom of the transcript) instead of making room
 * for them, so a menu or a prompt opening never moves what is already on screen.
 *
 * Ink 5 has no `bottom` offset and no stacking order, so this leans on two things it does have. An absolutely
 * positioned box with no offsets is placed by its parent's alignment, so a zero-height parent that aligns to the
 * end puts the box's bottom edge at this spot and lets it grow upward; and whatever is drawn later wins a cell, so
 * the overlay goes after the transcript in the tree. Ink only draws a box's border and text, never its empty inside,
 * so a backdrop of spaces goes under the children to stop the transcript showing through.
 */
export function Overlay({ rows, children }: OverlayProps) {
  const { columns } = useTerminalSize();
  const backdrop = useMemo(() => Array.from({ length: rows }, () => " ".repeat(columns)).join("\n"), [rows, columns]);
  if (rows <= 0) return null;

  return (
    <Box height={0} flexShrink={0} flexDirection="column" justifyContent="flex-end">
      {/* Children are aligned to the end too, so a miscount shows at the top of the overlay rather than over the input box. */}
      <Box position="absolute" flexDirection="column" justifyContent="flex-end" width={columns} height={rows}>
        <Box position="absolute">
          <Text>{backdrop}</Text>
        </Box>
        {children}
      </Box>
    </Box>
  );
}
