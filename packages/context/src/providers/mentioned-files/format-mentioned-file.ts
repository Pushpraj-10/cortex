/** A rendered file excerpt, ready to become a ContextFragment's title and content. */
export interface MentionedFileSection {
  title: string;
  content: string;
}

/**
 * Wraps a file excerpt in a code fence long enough that backticks inside the file can't
 * close it early. Pure — no IO.
 */
export function formatMentionedFile(relativePath: string, excerpt: string): MentionedFileSection {
  const longestBacktickRun = Math.max(0, ...(excerpt.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(Math.max(3, longestBacktickRun + 1));

  return { title: `File: ${relativePath}`, content: `${fence}\n${excerpt}\n${fence}` };
}
