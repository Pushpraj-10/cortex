import { ok } from "@cortex/shared";
import type { ContextProvider } from "../../core/context-provider.js";
import type { ContextFragment } from "../../types.js";
import { extractFileMentions } from "../../workspace/extract-file-mentions.js";
import { resolveMentionedFiles } from "../../workspace/resolve-mentioned-files.js";
import { readFileExcerpt } from "../../workspace/read-file-excerpt.js";
import { formatMentionedFile } from "./format-mentioned-file.js";

/**
 * Attaches the contents of the files the user's message names, so the model starts the
 * turn already looking at them instead of spending a tool call to find and read them.
 * Applies only when the message contains something that looks like a file; mentions that
 * don't resolve to exactly one real, readable file are quietly skipped.
 */
export const mentionedFilesProvider: ContextProvider = {
  id: "mentioned-files",
  displayName: "Mentioned Files",
  applies: (request) => extractFileMentions(request.userMessage).length > 0,
  async gather(request) {
    const files = await resolveMentionedFiles(request.workspaceRoot, extractFileMentions(request.userMessage));

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
