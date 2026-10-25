import { promises as fs } from "node:fs";
import { resolveWorkspacePath } from "@cortex/shared";
import path from "node:path";
import { walkWorkspace } from "../workspace/walk-workspace.js";
import { isIndexedFile } from "./is-indexed-file.js";
import { mapInBatches } from "./map-in-batches.js";
import { readFileSpecifiers } from "./read-file-specifiers.js";
import { readPackageManifest } from "./read-package-manifest.js";
import type { ImportIndex, IndexedFile } from "./types.js";

const MAX_DEPTH = 8;
const MAX_FILES = 20_000;
const BATCH_SIZE = 32;
/** Generated bundles and data dumps aren't worth parsing; they stay in the index with no imports. */
const DEFAULT_MAX_FILE_BYTES = 256 * 1024;

export interface UpdateImportIndexOptions {
  /** Files larger than this are indexed with no imports instead of being read. Defaults to 256 KiB. */
  maxFileBytes?: number;
  signal?: AbortSignal;
}

/**
 * Brings an import index up to date with the workspace and returns the new one. Every source
 * file and `package.json` is `stat`ed (cheap), but only files that are new or whose mtime/size
 * changed are read and parsed (the expensive part); unchanged records are carried over as-is
 * and files that no longer exist drop out. So the first call on a workspace pays for a full
 * scan, and each later call costs roughly one `stat` per file plus a re-parse of whatever was
 * edited since.
 */
export async function updateImportIndex(
  workspaceRoot: string,
  previous?: ImportIndex,
  options: UpdateImportIndexOptions = {},
): Promise<ImportIndex> {
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;

  const walked = await walkWorkspace(workspaceRoot, { maxDepth: MAX_DEPTH, maxEntries: MAX_FILES });
  const sourceFiles = walked.filter(isIndexedFile);

  const stats = await mapInBatches(
    sourceFiles,
    BATCH_SIZE,
    async (file) => {
      try {
        const { mtimeMs, size } = await fs.stat(resolveWorkspacePath(workspaceRoot, file));
        return { file, mtimeMs, size };
      } catch {
        return undefined; // vanished between the walk and the stat
      }
    },
    options.signal,
  );

  const next: ImportIndex = new Map();
  const changed: { file: string; mtimeMs: number; size: number }[] = [];

  for (const stat of stats) {
    if (!stat) continue;
    const known = previous?.get(stat.file);
    if (known && known.mtimeMs === stat.mtimeMs && known.size === stat.size) {
      next.set(stat.file, known);
    } else {
      changed.push(stat);
    }
  }

  const parsed = await mapInBatches(
    changed,
    BATCH_SIZE,
    async (stat): Promise<[string, IndexedFile]> => {
      const record: IndexedFile = { mtimeMs: stat.mtimeMs, size: stat.size, specifiers: [] };
      if (stat.size > maxFileBytes) return [stat.file, record];

      if (path.posix.basename(stat.file) === "package.json") {
        const manifest = await readPackageManifest(workspaceRoot, stat.file);
        if (manifest) {
          record.packageName = manifest.name;
          record.packageMain = manifest.main;
        }
      } else {
        record.specifiers = await readFileSpecifiers(workspaceRoot, stat.file);
      }
      return [stat.file, record];
    },
    options.signal,
  );

  for (const [file, record] of parsed) next.set(file, record);

  return next;
}
