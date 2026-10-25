import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readVersion } from "../../src/cli/version.js";

describe("readVersion", () => {
  let container: string;
  /** One level below the container, so the fallback's `../..` stays inside the (otherwise empty) container. */
  let dir: string;

  beforeEach(async () => {
    container = await fs.mkdtemp(path.join(process.cwd(), "test-"));
    dir = path.join(container, "work");
  });

  afterEach(async () => {
    await fs.rm(container, { recursive: true, force: true });
  });

  async function manifest(relative: string, content: string) {
    const file = path.join(dir, relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content);
  }

  it("reads the package.json next to the bundled file", async () => {
    await manifest("dist/package.json", JSON.stringify({ version: "9.9.9" }));
    expect(readVersion(pathToFileURL(path.join(dir, "dist", "cortex.js")))).toBe("9.9.9");
  });

  it("falls back to the package.json two folders above the source file", async () => {
    await manifest("package.json", JSON.stringify({ version: "1.2.3" }));
    expect(readVersion(pathToFileURL(path.join(dir, "src", "cli", "version.ts")))).toBe("1.2.3");
  });

  it("prefers the one next to the file when both exist", async () => {
    await manifest("dist/package.json", JSON.stringify({ version: "2.0.0" }));
    await manifest("package.json", JSON.stringify({ version: "1.0.0" }));
    expect(readVersion(pathToFileURL(path.join(dir, "dist", "cortex.js")))).toBe("2.0.0");
  });

  it("says dev when no usable package.json is found", async () => {
    await manifest("dist/package.json", "{ not json");
    expect(readVersion(pathToFileURL(path.join(dir, "dist", "cortex.js")))).toBe("dev");
    await manifest("dist/package.json", JSON.stringify({ version: 7 }));
    expect(readVersion(pathToFileURL(path.join(dir, "dist", "cortex.js")))).toBe("dev");
  });

  it("finds this app's own version when run from source", () => {
    expect(readVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
