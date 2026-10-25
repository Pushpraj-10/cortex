import React, { useMemo } from "react";
import { Box, Text } from "ink";
import { highlightLines } from "../../format/highlight.js";
import { useTheme } from "../theme/ThemeContext.js";

interface CodeBlockProps {
  language: string;
  content: string;
}

/**
 * A fenced code block: a light bracket down the left (`╭─ ts` / `│` / `╰─`) instead of a full box, so the code
 * keeps the whole width, with syntax colours from the theme when the language is known. Long lines wrap.
 */
export function CodeBlock({ language, content }: CodeBlockProps) {
  const theme = useTheme();
  // Tabs have no reliable width in a terminal layout, so they become two spaces.
  const lines = useMemo(() => highlightLines(content.replace(/\t/g, "  "), language), [content, language]);
  const border = theme.border;

  return (
    <Box flexDirection="column">
      <Text color={border}>╭─{language ? ` ${language}` : ""}</Text>
      {lines.map((runs, index) => (
        <Box key={index}>
          <Text color={border}>│ </Text>
          <Box flexGrow={1}>
            <Text wrap="wrap">
              {runs.length === 0
                ? " "
                : runs.map((run, runIndex) => (
                    <Text key={runIndex} color={run.scope ? theme.syntax[run.scope] : undefined}>
                      {run.text}
                    </Text>
                  ))}
            </Text>
          </Box>
        </Box>
      ))}
      <Text color={border}>╰─</Text>
    </Box>
  );
}
