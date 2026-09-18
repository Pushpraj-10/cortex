import React from "react";
import { Box, Text } from "ink";
import { colors } from "../theme.js";
import type { SlashCommand } from "../types.js";

interface SlashCommandMenuProps {
  commands: SlashCommand[];
  selectedIndex: number;
}

export function SlashCommandMenu({ commands, selectedIndex }: SlashCommandMenuProps) {
  if (commands.length === 0) {
    return (
      <Box borderStyle="round" borderColor={colors.muted} paddingX={1}>
        <Text color={colors.muted}>No matching commands</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={colors.accent} paddingX={1}>
      {commands.map((command, i) => {
        const selected = i === selectedIndex;
        return (
          <Text key={command.name} color={selected ? colors.accent : undefined} bold={selected}>
            {selected ? "› " : "  "}/{command.name}
            <Text color={colors.muted}> — {command.description}</Text>
          </Text>
        );
      })}
    </Box>
  );
}
