import path from "node:path";
import { isSourceFile } from "./is-source-file.js";

/** True for the files the import index tracks: JS/TS source, plus `package.json` (it names the workspace packages other files import). */
export function isIndexedFile(relativePath: string): boolean {
  return isSourceFile(relativePath) || path.posix.basename(relativePath) === "package.json";
}
