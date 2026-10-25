/**
 * Mentioned-files provider: attaches the contents of the files the user's message names.
 */
import { ok } from "@cortex/core";
import type { ContextProvider, ContextFragment } from "../types.js";
import { extractFileMentions, resolveRequestMentions, readFileExcerpt } from "../workspace.js";

// ---- Formatting ----

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

// ---- The provider ----

/**
 * Attaches the contents of the files the user's message names, so the model starts the
 * turn already looking at them instead of spending a tool call to find and read them.
 * Applies only when the message contains something that looks like a file; mentions that
 * don't resolve to exactly one real, readable file are quietly skipped.
 */
export const mentionedFilesProvider: ContextProvider = {
  id: "mentioned-files",
  applies: (request) => extractFileMentions(request.userMessage).length > 0,
  async gather(request) {
    const files = await resolveRequestMentions(request);

    const fragments: ContextFragment[] = [];
    for (const file of files) {
      const excerpt = await readFileExcerpt(request.workspaceRoot, file);
      if (!excerpt.ok) continue;

      const { title, content } = formatMentionedFile(file, excerpt.value);
      fragments.push({ providerId: "mentioned-files", title, content, relevance: 1 });
    }

    return ok(fragments);
  },
};
