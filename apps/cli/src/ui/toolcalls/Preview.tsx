import React, { useMemo } from "react";
import { Box, Text } from "ink";
import type { ToolPreview } from "@cortex/tools";
import { truncateRows } from "../../format/diff.js";
import { highlightLines, languageOf } from "../../format/highlight.js";
import { displayWidth } from "../../format/table.js";
import { useTheme } from "../theme/ThemeContext.js";
import { commandLines, diffOf, type CommandPreview, type DiffPreview } from "./preview-model.js";

/** Same line breaks as the diff sees, and tabs as two spaces, which have no reliable width in a terminal layout. */
const normalize = (text: string) => text.replace(/\r\n?/g, "\n").replace(/\t/g, "  ");

interface PreviewProps {
  preview: ToolPreview;
  /** Columns available; added and removed lines are filled out to it as a band. */
  width: number;
  /** Most lines to draw; the rest are summarised in a "N more lines" row. */
  maxLines: number;
  /** Cut each line off at the width instead of wrapping it, so a line is always exactly one row (the approval prompt needs this). */
  truncate?: boolean;
  /** Add "(ctrl+t to expand)" to the "N more lines" row. */
  expandHint?: boolean;
}

/** What a tool call is going to do: a diff of a file change, or the command to run. */
export function Preview({ preview, ...rest }: PreviewProps) {
  return preview.kind === "diff" ? <DiffView preview={preview} {...rest} /> : <CommandView preview={preview} {...rest} />;
}

function MoreRow({ hidden, expandHint }: { hidden: number; expandHint?: boolean }) {
  const theme = useTheme();
  return (
    <Text color={theme.muted}>
      … {hidden} more line{hidden === 1 ? "" : "s"}
      {expandHint ? " (ctrl+t to expand)" : ""}
    </Text>
  );
}

function DiffView({ preview, width, maxLines, truncate, expandHint }: PreviewProps & { preview: DiffPreview }) {
  const theme = useTheme();
  const language = languageOf(preview.path);
  const diff = diffOf(preview);
  const before = useMemo(() => highlightLines(normalize(preview.before), language), [preview, language]);
  const after = useMemo(() => highlightLines(normalize(preview.after), language), [preview, language]);
  const { rows, hidden } = truncateRows(diff.rows, maxLines);

  // The gutter is as wide as the biggest line number anywhere in the diff, so it does not change width as lines are revealed.
  const biggest = Math.max(1, ...diff.rows.flatMap((row) => (row.kind === "gap" ? [] : [row.kind === "del" ? row.oldLine : row.newLine])));
  const gutter = String(biggest).length;
  const contentWidth = Math.max(10, width - gutter - 3); // the number and its space, then the sign and its space

  return (
    <Box flexDirection="column">
      {rows.map((row, index) => {
        if (row.kind === "gap") {
          return (
            <Text key={index} color={theme.muted}>
              {" ".repeat(gutter)} ⋯ {row.hidden} unchanged lines
            </Text>
          );
        }

        const runs = (row.kind === "del" ? before[row.oldLine - preview.startLine] : after[row.newLine - preview.startLine]) ?? [{ text: row.text }];
        const background = row.kind === "add" ? theme.diff.added : row.kind === "del" ? theme.diff.removed : undefined;
        const signColor = row.kind === "add" ? theme.status.success : row.kind === "del" ? theme.status.error : undefined;
        const sign = row.kind === "add" ? "+" : row.kind === "del" ? "-" : " ";
        const used = runs.reduce((sum, run) => sum + displayWidth(run.text), 0);

        return (
          <Text key={index} wrap={truncate ? "truncate-end" : "wrap"}>
            <Text color={theme.muted}>{String(row.kind === "del" ? row.oldLine : row.newLine).padStart(gutter)} </Text>
            <Text backgroundColor={background}>
              <Text color={signColor}>{sign} </Text>
              {runs.map((run, runIndex) => (
                <Text key={runIndex} color={run.scope ? theme.syntax[run.scope] : undefined}>
                  {run.text}
                </Text>
              ))}
              {background ? " ".repeat(Math.max(0, contentWidth - used)) : ""}
            </Text>
          </Text>
        );
      })}
      {hidden > 0 && <MoreRow hidden={hidden} expandHint={expandHint} />}
    </Box>
  );
}

function CommandView({ preview, maxLines, truncate, expandHint }: PreviewProps & { preview: CommandPreview }) {
  const theme = useTheme();
  const lines = commandLines(preview);
  const shown = lines.slice(0, Math.max(0, maxLines));

  return (
    <Box flexDirection="column">
      {shown.map((line, index) => (
        <Text key={index} wrap={truncate ? "truncate-end" : "wrap"}>
          <Text color={theme.muted}>{index === 0 ? "$ " : "  "}</Text>
          <Text color={theme.secondary}>{line}</Text>
        </Text>
      ))}
      {lines.length > shown.length && <MoreRow hidden={lines.length - shown.length} expandHint={expandHint} />}
    </Box>
  );
}
