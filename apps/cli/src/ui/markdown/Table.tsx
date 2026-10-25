import React, { useMemo } from "react";
import { Box, Text } from "ink";
import type { Align } from "../../format/markdown.js";
import { layoutTable } from "../../format/table.js";
import { useTheme } from "../theme/ThemeContext.js";

interface TableProps {
  rows: string[][];
  align: Align[];
  /** Columns available; the table narrows its widest columns and wraps their cells to fit. */
  width: number;
}

/** A boxed table. The layout (widths, wrapping, borders) is `layoutTable`'s; this only colours it. */
export function Table({ rows, align, width }: TableProps) {
  const theme = useTheme();
  const layout = useMemo(() => layoutTable(rows, align, width), [rows, align, width]);
  const border = theme.border;

  return (
    <Box flexDirection="column">
      {layout.lines.map((line, index) =>
        line.kind === "border" ? (
          <Text key={index} color={border}>
            {line.text}
          </Text>
        ) : (
          <Text key={index}>
            <Text color={border}>│ </Text>
            {line.cells.map((cell, column) => (
              <React.Fragment key={column}>
                {column > 0 && <Text color={border}> │ </Text>}
                <Text bold={line.kind === "header"}>{cell}</Text>
              </React.Fragment>
            ))}
            <Text color={border}> │</Text>
          </Text>
        ),
      )}
    </Box>
  );
}
