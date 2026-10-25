import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme/ThemeContext.js";
import type { SlashCommand } from "../types.js";

interface SlashCommandMenuProps {
  commands: SlashCommand[];
  selectedIndex: number;
  /** Shown before each name: "/" for commands; "" when the menu lists something else, like providers. */
  prefix?: string;
  /** Which end of a line too long for the terminal is cut: the end for commands, the start for paths so the file name survives. */
  truncate?: "end" | "start";
}

/** A list of things to pick from. Every item is one row, which the layout counts on. An item with no description shows just its name. */
export function SlashCommandMenu({ commands, selectedIndex, prefix = "/", truncate = "end" }: SlashCommandMenuProps) {
  const theme = useTheme();
  if (commands.length === 0) {
    return (
      <Box borderStyle="round" borderColor={theme.border} paddingX={1}>
        <Text color={theme.muted}>No matching commands</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.primary} paddingX={1}>
      {commands.map((command, i) => {
        const selected = i === selectedIndex;
        return (
          <Text key={command.name} color={selected ? theme.primary : undefined} bold={selected} wrap={truncate === "start" ? "truncate-start" : "truncate-end"}>
            {selected ? "› " : "  "}{prefix}{command.name}
            {command.description ? <Text color={theme.muted}> — {command.description}</Text> : null}
          </Text>
        );
      })}
    </Box>
  );
}
