import React, { useMemo } from "react";
import { Text } from "ink";
import { parseInline } from "../../format/inline.js";
import { useTheme } from "../theme/ThemeContext.js";

/**
 * One line of inline markdown as styled text, to be placed inside a <Text>: bold, italic, strikethrough,
 * code spans in the accent colour, and links underlined with their URL after them unless the text already is the URL.
 */
export function Inline({ text }: { text: string }) {
  const theme = useTheme();
  const spans = useMemo(() => parseInline(text), [text]);

  return (
    <>
      {spans.map((span, index) => (
        <React.Fragment key={index}>
          <Text
            bold={span.bold}
            italic={span.italic}
            strikethrough={span.strike}
            underline={span.link !== undefined}
            color={span.link !== undefined || span.code ? theme.secondary : undefined}
          >
            {span.text}
          </Text>
          {span.link !== undefined && span.link.replace(/\/$/, "") !== span.text.replace(/\/$/, "") && (
            <Text color={theme.muted}> ({span.link})</Text>
          )}
        </React.Fragment>
      ))}
    </>
  );
}
