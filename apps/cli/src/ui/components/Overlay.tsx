import React, { useMemo } from "react";
import { Box, Text } from "ink";
import { fitPieces, piecesWidth, type Piece } from "../../format/panel.js";
import { useTerminalSize } from "../hooks/terminal.js";
import { useTheme } from "../theme/ThemeContext.js";

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
 *
 * The backdrop is also what gives the panel its look: no border, a background across the whole width (the theme's
 * `panelBackground`). Text drawn onto a cell replaces it whole, backdrop included, so the children draw their rows
 * with `PanelRow`, which carries the background itself.
 */
export function Overlay({ rows, children }: OverlayProps) {
  const theme = useTheme();
  const { columns } = useTerminalSize();
  const backdrop = useMemo(() => Array.from({ length: rows }, () => " ".repeat(columns)).join("\n"), [rows, columns]);
  if (rows <= 0) return null;

  return (
    <Box height={0} flexShrink={0} flexDirection="column" justifyContent="flex-end">
      {/* Children are aligned to the end too, so a miscount shows at the top of the overlay rather than over the input box. */}
      <Box position="absolute" flexDirection="column" justifyContent="flex-end" width={columns} height={rows}>
        <Box position="absolute">
          <Text backgroundColor={theme.panelBackground}>{backdrop}</Text>
        </Box>
        {children}
      </Box>
    </Box>
  );
}

/** Blank columns before a row's content. */
const ROW_INDENT = 1;

interface PanelRowProps {
  /** The row's content, left to right. Cut to fit, so the row is always exactly one line. */
  pieces: Piece[];
  /** Which end of a row too long for the terminal is cut: the end for commands, the start of the last piece for paths so the file name survives. */
  cut?: "end" | "start";
}

/** One line of a panel: indented, in the panel's background, and filled out to the full width. An empty `pieces` is a blank line of the panel. */
export function PanelRow({ pieces, cut = "end" }: PanelRowProps) {
  const theme = useTheme();
  const { columns } = useTerminalSize();
  const fitted = fitPieces(pieces, Math.max(0, columns - ROW_INDENT * 2), cut);
  const fill = Math.max(0, columns - ROW_INDENT - piecesWidth(fitted));
  return (
    <Text backgroundColor={theme.panelBackground} wrap="truncate-end">
      {" ".repeat(ROW_INDENT)}
      {fitted.map((piece, index) => (
        <Text key={index} color={piece.color} bold={piece.bold}>
          {piece.text}
        </Text>
      ))}
      {" ".repeat(fill)}
    </Text>
  );
}
