import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme/ThemeContext.js";
import type { SlashCommand } from "../types.js";

interface SlashCommandMenuProps {
  commands: SlashCommand[];
  selectedIndex: number;
  /** Shown before each name: "/" for commands; "" when the menu lists something else, like providers. */
  prefix?: string;
}

export function SlashCommandMenu({ commands, selectedIndex, prefix = "/" }: SlashCommandMenuProps) {
  const theme = useTheme();
  if (commands.length === 0) {
    return (
      <Box borderStyle="round" borderColor={theme.border.default} paddingX={1}>
        <Text color={theme.text.secondary}>No matching commands</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.border.focus} paddingX={1}>
      {commands.map((command, i) => {
        const selected = i === selectedIndex;
        return (
          <Text key={command.name} color={selected ? theme.text.accent : undefined} bold={selected}>
            {selected ? "› " : "  "}{prefix}{command.name}
            <Text color={theme.text.secondary}> — {command.description}</Text>
          </Text>
        );
      })}
    </Box>
  );
}
