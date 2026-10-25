import path from "node:path";
import { isFileInWorkspace } from "./is-file-in-workspace.js";

const TEST_FILE = /\.(test|spec)\.[^./]+$/;
const TEST_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];
const TEST_DIRECTORY_NAMES = ["test", "tests"];

/**
 * Finds the test files that sit next to a source file by convention, as `/`-separated
 * workspace-relative paths: `a.test.ts`/`a.spec.ts` beside it, in a sibling `__tests__/`,
 * or in a `test/` (or `tests/`) tree that mirrors `src/` — this repo's layout, where
 * `packages/p/src/a/b.ts` is tested by `packages/p/test/a/b.test.ts`. Returns `[]` for a
 * file that is itself a test, or has no tests by those conventions.
 */
export async function findRelatedTests(workspaceRoot: string, sourceFile: string): Promise<string[]> {
  if (TEST_FILE.test(sourceFile)) return [];

  const found: string[] = [];
  for (const candidate of candidatesFor(sourceFile)) {
    if (!found.includes(candidate) && (await isFileInWorkspace(workspaceRoot, candidate))) found.push(candidate);
  }
  return found;
}

function candidatesFor(sourceFile: string): string[] {
  const directory = path.posix.dirname(sourceFile);
  const name = path.posix.basename(sourceFile, path.posix.extname(sourceFile));
  const testNames = ["test", "spec"].flatMap((kind) => TEST_EXTENSIONS.map((ext) => `${name}.${kind}${ext}`));
  const inDirectory = (dir: string) => testNames.map((testName) => path.posix.join(dir, testName));

  const candidates = [...inDirectory(directory), ...inDirectory(path.posix.join(directory, "__tests__"))];

  const segments = sourceFile.split("/");
  const srcIndex = segments.indexOf("src");
  if (srcIndex !== -1) {
    const packageRoot = segments.slice(0, srcIndex);
    const insideSrc = segments.slice(srcIndex + 1, -1);
    for (const testDirectory of TEST_DIRECTORY_NAMES) {
      candidates.push(...inDirectory(path.posix.join(...packageRoot, testDirectory, ...insideSrc)));
    }
  }

  return candidates;
}
