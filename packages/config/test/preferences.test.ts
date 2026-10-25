import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadPreferences, preferencesPath, savePreferences } from "../src/preferences.js";

describe("preferences", () => {
  let home: string;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(process.cwd(), "test-"));
  });

  afterEach(async () => {
    await fs.rm(home, { recursive: true, force: true });
  });

  it("lives in the user's .cortex folder", () => {
    expect(preferencesPath(home)).toBe(path.join(home, ".cortex", "preferences.json"));
  });

  it("loads an empty result when nothing has been saved", async () => {
    expect(await loadPreferences(home)).toEqual({});
  });

  it("saves a theme and loads it back", async () => {
    await savePreferences({ theme: "light" }, home);
    expect(await loadPreferences(home)).toEqual({ theme: "light" });
  });

  it("replaces the theme on a later save", async () => {
    await savePreferences({ theme: "light" }, home);
    await savePreferences({ theme: "mono" }, home);
    expect(await loadPreferences(home)).toEqual({ theme: "mono" });
  });

  it("treats a malformed file as nothing chosen instead of failing", async () => {
    await fs.mkdir(path.dirname(preferencesPath(home)), { recursive: true });
    await fs.writeFile(preferencesPath(home), "{ not json");
    expect(await loadPreferences(home)).toEqual({});
  });

  it("ignores a theme that is not a non-empty string", async () => {
    await fs.mkdir(path.dirname(preferencesPath(home)), { recursive: true });
    await fs.writeFile(preferencesPath(home), JSON.stringify({ theme: 7 }));
    expect(await loadPreferences(home)).toEqual({});
    await fs.writeFile(preferencesPath(home), JSON.stringify({ theme: "  " }));
    expect(await loadPreferences(home)).toEqual({});
  });

  it("can overwrite a malformed file with a fresh save", async () => {
    await fs.mkdir(path.dirname(preferencesPath(home)), { recursive: true });
    await fs.writeFile(preferencesPath(home), "garbage");
    await savePreferences({ theme: "dark" }, home);
    expect(await loadPreferences(home)).toEqual({ theme: "dark" });
  });

  it("leaves no temporary file behind", async () => {
    await savePreferences({ theme: "dark" }, home);
    expect(await fs.readdir(path.dirname(preferencesPath(home)))).toEqual(["preferences.json"]);
  });
});
