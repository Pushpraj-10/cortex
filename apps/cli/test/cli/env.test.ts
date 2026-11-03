import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PROJECT_ENV_ALLOWED, loadDotEnv, parseDotEnv } from "../../src/cli/env.js";
import { PROVIDER_ENV, PROVIDER_IDS } from "../../src/provider/config.js";

describe("parseDotEnv", () => {
  it("parses KEY=VALUE lines", () => {
    expect(parseDotEnv("FOO=bar\nBAZ=qux")).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("skips blank lines and # comments", () => {
    expect(parseDotEnv("# a comment\n\nFOO=bar\n  \n# another\nBAZ=qux")).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("trims whitespace around keys and values", () => {
    expect(parseDotEnv("  FOO  =  bar  ")).toEqual({ FOO: "bar" });
  });

  it("strips matching surrounding quotes from values", () => {
    expect(parseDotEnv('FOO="bar"\nBAZ=\'qux\'')).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("leaves mismatched or partial quotes untouched", () => {
    expect(parseDotEnv('FOO="bar')).toEqual({ FOO: '"bar' });
  });

  it("keeps the rest of the line intact when the value itself contains =", () => {
    expect(parseDotEnv("URL=http://localhost:11434/api?x=1")).toEqual({ URL: "http://localhost:11434/api?x=1" });
  });

  it("ignores a line with no = separator", () => {
    expect(parseDotEnv("not a valid line\nFOO=bar")).toEqual({ FOO: "bar" });
  });

  it("returns an empty object for empty input", () => {
    expect(parseDotEnv("")).toEqual({});
  });
});

describe("loadDotEnv: a project's .env", () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(process.cwd(), "test-"));
    file = path.join(dir, ".env");
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const load = async (content: string, env: NodeJS.ProcessEnv = {}) => {
    await fs.writeFile(file, content);
    const refused = loadDotEnv(file, env);
    return { env, refused };
  };

  it("sets Cortex's own provider settings: which provider, and each provider's model and API key", async () => {
    const { env, refused } = await load(
      ["CORTEX_PROVIDER=google", "OLLAMA_MODEL=llama3.1", "GOOGLE_API_KEY=g-key", "GOOGLE_MODEL=gemini-x", "ANTHROPIC_API_KEY=a-key", "ANTHROPIC_MODEL=claude-x"].join("\n"),
    );
    expect(env).toEqual({
      CORTEX_PROVIDER: "google",
      OLLAMA_MODEL: "llama3.1",
      GOOGLE_API_KEY: "g-key",
      GOOGLE_MODEL: "gemini-x",
      ANTHROPIC_API_KEY: "a-key",
      ANTHROPIC_MODEL: "claude-x",
    });
    expect(refused).toEqual([]);
  });

  it("allows exactly those names, derived from what the providers read, and no server URL", () => {
    expect([...PROJECT_ENV_ALLOWED].sort()).toEqual(
      ["ANTHROPIC_API_KEY", "ANTHROPIC_MODEL", "CORTEX_PROVIDER", "GOOGLE_API_KEY", "GOOGLE_MODEL", "OLLAMA_MODEL"].sort(),
    );
    for (const id of PROVIDER_IDS) expect(PROJECT_ENV_ALLOWED.has(PROVIDER_ENV[id].baseUrl)).toBe(false);
  });

  it("refuses a server URL, so a repository cannot send a saved key to a server of its choosing, and says which", async () => {
    const { env, refused } = await load(
      ["GOOGLE_BASE_URL=https://evil.example", "ANTHROPIC_BASE_URL=http://10.0.0.9:8000", "OLLAMA_BASE_URL=http://attacker:11434", "GOOGLE_MODEL=gemini-x"].join("\n"),
    );
    expect(env).toEqual({ GOOGLE_MODEL: "gemini-x" });
    expect(refused).toEqual(["GOOGLE_BASE_URL", "ANTHROPIC_BASE_URL", "OLLAMA_BASE_URL"]);
  });

  it("refuses a server URL silently when it is only the usual address, as in a copied .env.example", async () => {
    const { env, refused } = await load(
      [
        "OLLAMA_BASE_URL=http://localhost:11434",
        "GOOGLE_BASE_URL=https://generativelanguage.googleapis.com",
        "ANTHROPIC_BASE_URL=https://api.anthropic.com/",
        "OLLAMA_MODEL=llama3.1",
      ].join("\n"),
    );
    expect(env).toEqual({ OLLAMA_MODEL: "llama3.1" });
    expect(refused).toEqual([]);
  });

  it("refuses the variables a child process would run code from, without a word, as it does everything else that is not Cortex's", async () => {
    const hostile = ["NODE_OPTIONS=--require ./evil.js", "PATH=/tmp/evil", "BASH_ENV=./evil.sh", "LD_PRELOAD=./evil.so", "HTTPS_PROXY=http://evil", "NODE_EXTRA_CA_CERTS=./ca.pem", "DATABASE_URL=postgres://x"];
    const { env, refused } = await load(hostile.join("\n"));
    expect(env).toEqual({});
    expect(refused).toEqual([]);
  });

  it("mentions another variable that looks meant for Cortex or a provider, since a user may expect it to work", async () => {
    const { env, refused } = await load(["CORTEX_THEME=light", "GOOGLE_PROJECT=x", "OLLAMA_HOST=0.0.0.0", "ANTHROPIC_BETA=1"].join("\n"));
    expect(env).toEqual({});
    expect(refused).toEqual(["CORTEX_THEME", "GOOGLE_PROJECT", "OLLAMA_HOST", "ANTHROPIC_BETA"]);
  });

  it("never overwrites a variable the shell already exported, allowed or not, and does not mention it", async () => {
    const { env, refused } = await load(
      ["GOOGLE_API_KEY=from-file", "GOOGLE_BASE_URL=https://evil.example", "CORTEX_PROVIDER=google"].join("\n"),
      { GOOGLE_API_KEY: "from-shell", GOOGLE_BASE_URL: "https://mine.example", CORTEX_PROVIDER: "ollama" },
    );
    expect(env).toEqual({ GOOGLE_API_KEY: "from-shell", GOOGLE_BASE_URL: "https://mine.example", CORTEX_PROVIDER: "ollama" });
    expect(refused).toEqual([]);
  });

  it("takes an empty value for an allowed name, as .env.example has for CORTEX_PROVIDER", async () => {
    const { env } = await load("CORTEX_PROVIDER=\nGOOGLE_API_KEY=");
    expect(env).toEqual({ CORTEX_PROVIDER: "", GOOGLE_API_KEY: "" });
  });

  it("is fine with no file at all", () => {
    const env: NodeJS.ProcessEnv = {};
    expect(loadDotEnv(path.join(dir, "missing.env"), env)).toEqual([]);
    expect(env).toEqual({});
  });

  it("writes to the environment it is given, not the process's own, unless told to use that", async () => {
    const before = { ...process.env };
    await load("GOOGLE_MODEL=only-in-the-object");
    expect(process.env.GOOGLE_MODEL).toBe(before.GOOGLE_MODEL);
  });
});
