import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { credentialsPath, loadCredentials, saveProviderCredentials } from "@cortex/config";
import {
  anthropicProviderDescriptor,
  googleProviderDescriptor,
  ollamaProviderDescriptor,
  registerLlmProvider,
} from "@cortex/providers";
import { resolveProvider } from "../src/provider-config.js";
import { createProviderManager } from "../src/provider-manager.js";

const SECRET = "AIza-very-secret-key";

describe("createProviderManager", () => {
  let root: string;
  let home: string;
  const fetchMock = vi.fn();
  const request = { messages: [{ role: "user" as const, content: "hi" }] };

  beforeAll(() => {
    for (const descriptor of [ollamaProviderDescriptor, googleProviderDescriptor, anthropicProviderDescriptor]) {
      registerLlmProvider(descriptor);
    }
  });

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(process.cwd(), "test-"));
    home = path.join(root, "home");
    await fs.mkdir(home);
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) =>
      new Response(
        JSON.stringify(
          url.includes("google")
            ? { candidates: [{ content: { parts: [{ text: "google reply" }] } }] }
            : { message: { content: "ollama reply" } },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await fs.rm(root, { recursive: true, force: true });
  });

  const ollama = () => {
    const choice = resolveProvider("ollama", { OLLAMA_MODEL: "llama3.1", OLLAMA_BASE_URL: "http://ollama.test" });
    if (!choice.ok) throw new Error("fixture failed");
    return choice.value;
  };

  it("is unconfigured at first, and its client explains how to fix that", async () => {
    const manager = createProviderManager({ env: {}, home });

    expect(manager.active()).toBeNull();
    const reply = await manager.llm.chat(request);
    expect(!reply.ok && reply.error.code).toBe("CLI_NO_PROVIDER");
    expect(!reply.ok && reply.error.message).toContain("/provider");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("delegates to the provider it started with", async () => {
    const manager = createProviderManager({ env: {}, home, initial: ollama() });

    expect(manager.active()).toEqual({ provider: "ollama", model: "llama3.1" });
    const reply = await manager.llm.chat(request);
    expect(reply.ok && reply.value.content).toBe("ollama reply");
    expect(fetchMock.mock.calls[0]![0]).toBe("http://ollama.test/api/chat");
  });

  describe("configure", () => {
    const google = { apiKey: SECRET, model: "gemini-test", baseUrl: "http://google.test" };

    it("saves the settings, makes the provider the default, and switches the running client to it", async () => {
      const manager = createProviderManager({ env: {}, home, initial: ollama() });

      const result = await manager.configure("google", google);

      expect(result.ok && result.value).toEqual({
        provider: "google",
        model: "gemini-test",
        savedTo: credentialsPath(home),
        overriddenBy: [],
      });
      expect(manager.active()).toEqual({ provider: "google", model: "gemini-test" });
      expect(await loadCredentials(home)).toEqual({ activeProvider: "google", providers: { google } });

      const reply = await manager.llm.chat(request);
      expect(reply.ok && reply.value.content).toBe("google reply");
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("http://google.test/v1beta/models/gemini-test:generateContent");
      expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(SECRET);
    });

    it("never returns the key in its result", async () => {
      const manager = createProviderManager({ env: {}, home });
      const result = await manager.configure("google", google);
      expect(JSON.stringify(result)).not.toContain(SECRET);
    });

    it("works from a completely unconfigured start", async () => {
      const manager = createProviderManager({ env: {}, home });
      expect((await manager.configure("google", google)).ok).toBe(true);
      expect((await manager.llm.chat(request)).ok).toBe(true);
    });

    it("reports which environment variables override what was saved, and uses the environment's values", async () => {
      const manager = createProviderManager({ env: { GOOGLE_API_KEY: "env-key" }, home });

      const result = await manager.configure("google", google);

      expect(result.ok && result.value.overriddenBy).toEqual(["GOOGLE_API_KEY"]);
      await manager.llm.chat(request);
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("env-key");
    });

    it("reports CORTEX_PROVIDER when it points elsewhere, since it wins at the next start", async () => {
      const manager = createProviderManager({ env: { CORTEX_PROVIDER: "ollama" }, home });
      const result = await manager.configure("google", google);
      expect(result.ok && result.value.overriddenBy).toContain("CORTEX_PROVIDER");
    });

    it("does not call an environment variable an override when it matches what was saved", async () => {
      const manager = createProviderManager({ env: { GOOGLE_API_KEY: SECRET }, home });
      const result = await manager.configure("google", google);
      expect(result.ok && result.value.overriddenBy).toEqual([]);
    });

    it("fails with the missing field when the settings are incomplete, leaving the running provider alone", async () => {
      const manager = createProviderManager({ env: {}, home, initial: ollama() });

      const result = await manager.configure("google", { apiKey: SECRET });

      expect(!result.ok && result.error.code).toBe("CLI_MISSING_GOOGLE_MODEL");
      expect(manager.active()?.provider).toBe("ollama");
    });

    it("turns a filesystem failure into an error that does not contain the key", async () => {
      const blocker = path.join(root, "not-a-folder");
      await fs.writeFile(blocker, "x");
      const manager = createProviderManager({ env: {}, home: blocker });

      const result = await manager.configure("google", google);

      expect(!result.ok && result.error.code).toBe("CLI_CREDENTIALS_FAILED");
      expect(!result.ok && result.error.message).not.toContain(SECRET);
    });
  });

  it("reports each provider's status from saved settings and the environment", async () => {
    await saveProviderCredentials("google", { apiKey: SECRET, model: "gemini-test" }, { home });
    const manager = createProviderManager({ env: { OLLAMA_MODEL: "llama3.1" }, home, initial: ollama() });

    const status = await manager.status();

    expect(status).toEqual([
      { id: "ollama", active: true, configured: true, model: "llama3.1", needsKey: false, hasKey: false },
      { id: "google", active: false, configured: true, model: "gemini-test", needsKey: true, hasKey: true },
      { id: "anthropic", active: false, configured: false, model: undefined, needsKey: true, hasKey: false },
    ]);
    expect(JSON.stringify(status)).not.toContain(SECRET);
  });

  it("returns only what is saved on disk for a provider, not the environment", async () => {
    await saveProviderCredentials("google", { apiKey: SECRET, model: "m" }, { home });
    const manager = createProviderManager({ env: { GOOGLE_API_KEY: "env-key" }, home });

    expect(await manager.saved("google")).toEqual({ apiKey: SECRET, model: "m" });
    expect(await manager.saved("anthropic")).toEqual({});
  });

  it("removes saved settings, reports whether there were any, and leaves the running provider in place", async () => {
    const manager = createProviderManager({ env: {}, home });
    await manager.configure("google", { apiKey: SECRET, model: "m" });

    expect(await manager.remove("google")).toEqual({ ok: true, value: { removed: true } });
    expect(await manager.saved("google")).toEqual({});
    expect((await loadCredentials(home)).activeProvider).toBeUndefined();
    expect(await manager.remove("google")).toEqual({ ok: true, value: { removed: false } });
    expect(manager.active()?.provider).toBe("google");
  });
});
