/** Showing a folder in a narrow space: the home directory as `~`, then cut from the start so the end (the part you recognise) survives. */
import { displayWidth } from "./table.js";

const sameSeparators = (path: string) => path.replace(/\\/g, "/");

/** Replaces a leading home directory with `~`, keeping the path's own separators. Case-insensitive, as Windows paths are. */
export function tildify(path: string, home: string): string {
  const normalizedHome = sameSeparators(home).replace(/\/+$/, "");
  if (normalizedHome === "") return path;
  const normalized = sameSeparators(path);
  const at = normalizedHome.length;
  const inside = normalized.length === at || normalized[at] === "/";
  if (!normalized.toLowerCase().startsWith(normalizedHome.toLowerCase()) || !inside) return path;
  return `~${path.slice(at)}`;
}

/**
 * Fits `path` in `max` columns by dropping folders from the start and putting `…` in front, keeping as many whole
 * folders as fit: `~/work/app/src/ui` in 12 columns is `…/app/src/ui`. If even the last folder is too long, its start is cut.
 */
export function shortenPath(path: string, max: number): string {
  if (displayWidth(path) <= max) return path;
  if (max <= 1) return "…".slice(0, Math.max(0, max));

  const separators = [...path.matchAll(/[\\/]/g)].map((match) => match.index!);
  // Try each folder boundary, earliest first, so the most that fits is kept.
  for (const index of separators) {
    const tail = `…${path.slice(index)}`;
    if (displayWidth(tail) <= max) return tail;
  }
  return `…${path.slice(path.length - (max - 1))}`;
}
