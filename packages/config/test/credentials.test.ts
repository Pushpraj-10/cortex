import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { credentialsPath, loadCredentials, removeProviderCredentials, saveProviderCredentials } from "../src/credentials.js";

describe("credentials", () => {
  let home: string;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(process.cwd(), "test-"));
  });

  afterEach(async () => {
    await fs.rm(home, { recursive: true, force: true });
  });

  it("lives in the user's .cortex folder", () => {
    expect(credentialsPath(home)).toBe(path.join(home, ".cortex", "credentials.json"));
  });

  it("loads an empty result when nothing has been saved", async () => {
    expect(await loadCredentials(home)).toEqual({ providers: {} });
  });

  it("saves a provider's values and loads them back", async () => {
    await saveProviderCredentials("google", { apiKey: "key-1", model: "gemini-test" }, { home });
    expect(await loadCredentials(home)).toEqual({ providers: { google: { apiKey: "key-1", model: "gemini-test" } } });
  });

  it("makes a provider the default only when asked to", async () => {
    await saveProviderCredentials("google", { apiKey: "k", model: "m" }, { home });
    expect((await loadCredentials(home)).activeProvider).toBeUndefined();

    await saveProviderCredentials("anthropic", { apiKey: "k2", model: "m2" }, { home, activate: true });
    expect((await loadCredentials(home)).activeProvider).toBe("anthropic");
  });

  it("merges new values over what was saved, keeping fields that were not given", async () => {
    await saveProviderCredentials("google", { apiKey: "old-key", model: "old-model" }, { home });
    await saveProviderCredentials("google", { model: "new-model" }, { home });
    expect((await loadCredentials(home)).providers.google).toEqual({ apiKey: "old-key", model: "new-model" });
  });

  it("trims values and drops blank ones and unknown fields", async () => {
    await saveProviderCredentials("google", { apiKey: "  key  ", model: "   ", extra: "x" } as never, { home });
    expect((await loadCredentials(home)).providers.google).toEqual({ apiKey: "key" });
  });

  it("keeps other providers when one is saved", async () => {
    await saveProviderCredentials("google", { apiKey: "g" }, { home });
    await saveProviderCredentials("anthropic", { apiKey: "a" }, { home });
    expect(Object.keys((await loadCredentials(home)).providers).sort()).toEqual(["anthropic", "google"]);
  });

  it.skipIf(process.platform === "win32")("writes the file readable by its owner only", async () => {
    await saveProviderCredentials("google", { apiKey: "secret" }, { home });
    const mode = (await fs.stat(credentialsPath(home))).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("leaves no temporary file behind", async () => {
    await saveProviderCredentials("google", { apiKey: "secret" }, { home });
    expect(await fs.readdir(path.join(home, ".cortex"))).toEqual(["credentials.json"]);
  });

  it("removes a provider, and clears the default if it was that provider", async () => {
    await saveProviderCredentials("google", { apiKey: "g" }, { home, activate: true });
    await saveProviderCredentials("anthropic", { apiKey: "a" }, { home });

    expect(await removeProviderCredentials("google", home)).toBe(true);

    const after = await loadCredentials(home);
    expect(after.providers).toEqual({ anthropic: { apiKey: "a" } });
    expect(after.activeProvider).toBeUndefined();
  });

  it("reports false when there was nothing saved to remove", async () => {
    expect(await removeProviderCredentials("google", home)).toBe(false);
  });

  it("fails on a malformed file naming the path, but never echoing its contents", async () => {
    await fs.mkdir(path.join(home, ".cortex"));
    await fs.writeFile(credentialsPath(home), '{ "providers": { "google": { "apiKey": "SECRET-VALUE" ');

    const error = await loadCredentials(home).catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("credentials.json");
    expect((error as Error).message).not.toContain("SECRET-VALUE");
  });

  it("ignores entries and fields it does not understand", async () => {
    await fs.mkdir(path.join(home, ".cortex"));
    await fs.writeFile(
      credentialsPath(home),
      JSON.stringify({ activeProvider: 5, providers: { google: { apiKey: "k", other: 1 }, bad: "nope" } }),
    );
    expect(await loadCredentials(home)).toEqual({ providers: { google: { apiKey: "k" }, bad: {} } });
  });
});
