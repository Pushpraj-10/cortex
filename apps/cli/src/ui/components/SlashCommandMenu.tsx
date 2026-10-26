import React from "react";
import { Box } from "ink";
import type { Piece } from "../../format/panel.js";
import { displayWidth } from "../../format/table.js";
import { useTheme } from "../theme/ThemeContext.js";
import type { SlashCommand } from "../types.js";
import { PanelRow } from "./Overlay.js";

interface SlashCommandMenuProps {
  commands: SlashCommand[];
  selectedIndex: number;
  /** Shown before each name: "/" for commands; "" when the menu lists something else, like providers. */
  prefix?: string;
  /** Which end of a line too long for the terminal is cut: the end for commands, the start for paths so the file name survives. */
  truncate?: "end" | "start";
}

/** Blank columns between the longest name and the descriptions, which all start in one column. */
const NAME_GAP = 2;

/**
 * A list of things to pick from, drawn as the rows of a panel (see Overlay): no border, a background across the full width,
 * the selected row in the accent colour with a `❯`. Every item is one row, which the layout counts on. An item with no
 * description shows just its name.
 */
export function SlashCommandMenu({ commands, selectedIndex, prefix = "/", truncate = "end" }: SlashCommandMenuProps) {
  const theme = useTheme();
  if (commands.length === 0) return <PanelRow pieces={[{ text: "No matching commands", color: theme.muted }]} />;

  const nameWidth = Math.max(...commands.map((command) => displayWidth(prefix + command.name)));

  return (
    <Box flexDirection="column">
      {commands.map((command, index) => {
        const selected = index === selectedIndex;
        const name = prefix + command.name;
        const pieces: Piece[] = [{ text: selected ? "❯ " : "  ", color: theme.primary }];
        if (command.description) {
          pieces.push({ text: name + " ".repeat(nameWidth - displayWidth(name) + NAME_GAP), color: selected ? theme.primary : undefined, bold: selected });
          pieces.push({ text: command.description, color: selected ? theme.primary : theme.muted });
        } else {
          pieces.push({ text: name, color: selected ? theme.primary : undefined, bold: selected });
        }
        return <PanelRow key={command.name} pieces={pieces} cut={truncate} />;
      })}
    </Box>
  );
}
