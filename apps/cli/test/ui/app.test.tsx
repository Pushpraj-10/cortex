import { afterEach, describe, expect, it } from "vitest";
import type { AgentModeId, AgentPolicy, AgentSession } from "@cortex/agent";
import { CortexError, err, ok } from "@cortex/core";
import { registerTool } from "@cortex/tools";
import type { ProviderManager } from "../../src/provider/manager.js";
import { createPermissionBridge } from "../../src/runtime/permission-bridge.js";
import { slashCommands } from "../../src/ui/commands.js";
import { KEY, driveApp, type DrivenApp } from "./support/drive-app.js";
import { settle } from "./support/render-frame.js";

const BACKSLASH = String.fromCharCode(92);

let app: DrivenApp | undefined;

afterEach(async () => {
  await app?.unmount();
  app = undefined;
});

/** Starts the app and returns it, so the tests read as what a person does. */
async function start(options: Parameters<typeof driveApp>[0] = {}): Promise<DrivenApp> {
  app = await driveApp(options);
  return app;
}

describe("App: typing and sending", () => {
  it("shows what is typed, and sends it to the agent and to the history on enter", async () => {
    const a = await start();
    await a.type("hello");
    expect(a.screen()).toContain("> hello");

    await a.press(KEY.enter);
    expect(a.sent).toEqual(["hello"]);
    expect(a.remembered).toEqual(["hello"]);
  });

  it("remembers the same message sent twice in a row only once", async () => {
    const a = await start();
    for (const text of ["same", "same", "other", "same"]) {
      await a.type(text);
      await a.press(KEY.enter);
    }
    expect(a.sent).toEqual(["same", "same", "other", "same"]);
    expect(a.remembered).toEqual(["same", "other", "same"]);
  });
});

describe("App: /agent", () => {
  const policyWith = (agent?: AgentModeId): AgentPolicy => ({
    mode: "default",
    agent,
    rules: { allow: [], deny: [] },
    hooks: [],
    askPermission: async () => false,
  });

  it("switches the shared policy's agent, shows it in the status line, and does not send the command to the model", async () => {
    const policy = policyWith();
    const a = await start({ policy });

    await a.type("/agent scan");
    await a.press(KEY.enter);

    expect(policy.agent).toBe("scan");
    expect(a.screen()).toContain("scan agent");
    expect(a.screen()).toContain("Agent: scan");
    expect(a.sent).toEqual([]);
  });

  it("returns to the general agent with /agent off", async () => {
    const policy = policyWith("fix");
    const a = await start({ policy });
    expect(a.screen()).toContain("fix agent");

    await a.type("/agent off");
    await a.press(KEY.enter);

    expect(policy.agent).toBeUndefined();
    expect(a.screen()).not.toContain("fix agent");
  });

  it("keeps the agent through /clear", async () => {
    const policy = policyWith("suggest");
    const a = await start({ policy });
    await a.type("/clear");
    await a.press(KEY.enter);
    expect(policy.agent).toBe("suggest");
    expect(a.screen()).toContain("suggest agent");
  });
});

describe("App: ctrl+g switches the agent", () => {
  const SHIFT_TAB = "\u001b[Z";
  const newPolicy = (): AgentPolicy => ({ mode: "default", rules: { allow: [], deny: [] }, hooks: [], askPermission: async () => false });

  it("steps through scan, suggest, fix and back to none, naming each in the status line", async () => {
    const policy = newPolicy();
    const a = await start({ policy });
    expect(policy.agent).toBeUndefined();

    await a.press(KEY.ctrlG);
    expect(policy.agent).toBe("scan");
    expect(a.screen()).toContain("scan agent (ctrl+g to cycle)");

    await a.press(KEY.ctrlG);
    expect(policy.agent).toBe("suggest");
    expect(a.screen()).toContain("suggest agent");
    expect(a.screen()).not.toContain("scan agent");

    await a.press(KEY.ctrlG);
    expect(policy.agent).toBe("fix");
    expect(a.screen()).toContain("fix agent");

    await a.press(KEY.ctrlG);
    expect(policy.agent).toBeUndefined();
    expect(a.screen()).not.toContain("fix agent");
    expect(a.screen()).toContain("? for shortcuts");
  });

  it("does not type anything, and does not send anything to the agent", async () => {
    const a = await start();
    await a.type("ab");
    await a.press(KEY.ctrlG);

    expect(a.screen()).toContain("> ab");
    expect(a.screen()).not.toContain("> abg");
    expect(a.sent).toEqual([]);
    expect(a.remembered).toEqual([]);
  });

  it("leaves the permission mode alone, and shift+tab leaves the agent alone", async () => {
    const policy = newPolicy();
    const a = await start({ policy });

    await a.press(KEY.ctrlG);
    await a.press(SHIFT_TAB);
    expect(policy.mode).toBe("acceptEdits");
    expect(policy.agent).toBe("scan");

    await a.press(KEY.ctrlG);
    expect(policy.mode).toBe("acceptEdits");
    expect(policy.agent).toBe("suggest");
  });

  it("carries on from an agent chosen with /agent", async () => {
    const policy = newPolicy();
    const a = await start({ policy });
    await a.type("/agent suggest");
    await a.press(KEY.enter);
    expect(policy.agent).toBe("suggest");

    await a.press(KEY.ctrlG);
    expect(policy.agent).toBe("fix");
  });

  it("does nothing while the agent is working, so a turn keeps the agent it began with", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const session: AgentSession = {
      // eslint-disable-next-line require-yield
      async *chat() {
        await gate;
      },
    };
    const policy = newPolicy();
    const a = await start({ policy, initialSession: session });
    await a.press("go");
    await a.press(KEY.enter);

    await a.press(KEY.ctrlG);
    expect(policy.agent).toBeUndefined();

    release();
    await settle();
    await a.press(KEY.ctrlG);
    expect(policy.agent).toBe("scan");
  });

  it("does nothing while the agent is waiting for an approval", async () => {
    const permissions = createPermissionBridge();
    const session: AgentSession = {
      // eslint-disable-next-line require-yield
      async *chat() {
        await permissions.ask("approval-test-edit", { path: "a.ts" });
      },
    };
    const policy = newPolicy();
    const a = await start({ policy, permissions, initialSession: session });
    await a.press("go");
    await a.press(KEY.enter);
    expect(a.screen()).toContain("Edit a.ts");

    await a.press(KEY.ctrlG);
    expect(policy.agent).toBeUndefined();
    expect(a.screen()).toContain("Edit a.ts"); // still asking
  });

  it("does nothing while /provider is asking something", async () => {
    const policy = newPolicy();
    const a = await start({ policy });
    await a.press("/provider");
    await a.press(KEY.enter);
    expect(a.screen()).toContain("Google Gemini");

    await a.press(KEY.ctrlG);
    expect(policy.agent).toBeUndefined();
    expect(a.screen()).toContain("Google Gemini");
  });
});

describe("App: choosing a command from the / menu", () => {
  it("runs the highlighted command on the first enter, instead of only filling in its name", async () => {
    const a = await start();
    await a.type("/hel");
    await a.press(KEY.enter);

    expect(a.screen()).toContain("Commands:"); // /help's output
    expect(a.screen()).not.toContain("> /help");
    expect(a.sent).toEqual([]);
    expect(a.remembered).toEqual(["/help"]);
  });

  it("runs the command picked with the arrow keys", async () => {
    const policy: AgentPolicy = { mode: "default", rules: { allow: [], deny: [] }, hooks: [], askPermission: async () => false };
    const a = await start({ policy });
    await a.press("/");
    const target = slashCommands.findIndex((command) => command.name === "model");
    for (let step = 0; step < target; step++) await a.press(KEY.down);
    await a.press(KEY.enter);

    expect(a.screen()).toContain("Model: llama3 (ollama)");
    expect(a.remembered).toEqual(["/model"]);
  });

  it("runs a command that takes an argument as if typed without one, showing its current value", async () => {
    const a = await start();
    await a.type("/mod");
    await a.press(KEY.enter);

    expect(a.screen()).toContain("Mode: default. Set one with /mode");
  });

  it("still fills the name in on tab, so an argument can be added", async () => {
    const a = await start();
    await a.type("/mod");
    await a.press(KEY.tab);

    expect(a.screen()).toContain("> /mode"); // the space after the name is there, but the screen text trims it
    await a.type("plan");
    expect(a.screen()).toContain("> /mode plan");
    expect(a.remembered).toEqual([]);
    expect(a.screen()).not.toContain("Mode: default");
  });

  it("does not run anything on enter when no command matches, but sends the line like any other", async () => {
    const a = await start();
    await a.type("/zzz");
    await a.press(KEY.enter);

    expect(a.screen()).toContain("Unknown command /zzz");
    expect(a.sent).toEqual([]);
  });
});

describe("App: menus and prompts are drawn over the transcript", () => {
  const size = { rows: 24, columns: 80 };
  /** The input box is 3 rows (one of text) and the status line 1, so a quiet screen has 20 rows of transcript. */
  const TRANSCRIPT_ROWS = 24 - 3 - 1;

  /** Sends `count` one-word messages. */
  async function sendMessages(a: DrivenApp, count: number) {
    for (let i = 0; i < count; i += 1) {
      await a.press(`m${i}`);
      await a.press(KEY.enter);
    }
  }

  it("opens the / menu over the bottom of the transcript, and the rows above it do not move", async () => {
    const a = await start(size);
    await sendMessages(a, 20);
    const before = a.screen().split("\n");

    await a.press("/");
    const after = a.screen().split("\n");

    const menuRows = slashCommands.length; // one row each; the menu has no border
    expect(after).toHaveLength(24);
    expect(after.slice(0, TRANSCRIPT_ROWS - menuRows)).toEqual(before.slice(0, TRANSCRIPT_ROWS - menuRows));
    expect(after.slice(TRANSCRIPT_ROWS - menuRows, TRANSCRIPT_ROWS).join("\n")).toContain("/help");
    expect(after[TRANSCRIPT_ROWS + 1]).toContain("> /"); // the input box is where it was, just under the menu
    expect(after[23]).toBe(before[23]);
  });

  it("closes the / menu and puts the transcript back as it was", async () => {
    const a = await start(size);
    await sendMessages(a, 20);
    const before = a.screen().split("\n");

    await a.press("/");
    await a.press(KEY.backspace);
    expect(a.screen().split("\n").slice(0, TRANSCRIPT_ROWS)).toEqual(before.slice(0, TRANSCRIPT_ROWS));
  });

  it("shows the approval prompt over the transcript without moving it", async () => {
    // The 20th message either waits forever or asks to edit a file; everything before it is the same.
    const sessionWhose = (twentieth: () => Promise<unknown>): AgentSession => {
      let calls = 0;
      return {
        // eslint-disable-next-line require-yield
        async *chat() {
          calls += 1;
          if (calls === 20) await twentieth();
        },
      };
    };
    const run = async (twentieth: (permissions: ReturnType<typeof createPermissionBridge>) => Promise<unknown>) => {
      const permissions = createPermissionBridge();
      const a = await start({ ...size, permissions, initialSession: sessionWhose(() => twentieth(permissions)) });
      await sendMessages(a, 20);
      const screen = a.screen().split("\n");
      await a.unmount();
      app = undefined;
      return screen;
    };

    const waiting = await run(() => new Promise(() => undefined));
    const asking = await run((permissions) => permissions.ask("edit_file", { path: "a.ts" }));

    // The approval window takes the input box's place and is drawn up from the status line: Yes and No (no tool is registered
    // here, so there is no "don't ask again"), plus a blank row, the title, the question and the hint.
    const promptRows = 4 + 2;
    const unmoved = 24 - 1 - promptRows;
    expect(asking).toHaveLength(24);
    expect(asking.join("\n")).toContain("Run edit_file"); // no tools are registered here, so the summary falls back to the tool's name
    expect(asking.join("\n")).toContain("Do you want to proceed?");
    expect(asking.slice(0, unmoved)).toEqual(waiting.slice(0, unmoved));
    expect(asking[23]).toBe(waiting[23]);
    // The input box is hidden while the window is up.
    expect(waiting.some((row) => /^ > /.test(row))).toBe(true);
    expect(asking.some((row) => /^ > /.test(row))).toBe(false);
  });
});

describe("App: the approval window", () => {
  const size = { rows: 30, columns: 100 };
  const SHIFT_TAB = "\u001b[Z";

  registerTool({ name: "approval-test-edit", description: "", kind: "edit", parametersSchema: {}, summarize: (args) => `Edit ${(args as { path: string }).path}`, handler: async () => ok(null) });
  registerTool({ name: "approval-test-run", description: "", kind: "execute", parametersSchema: {}, summarize: (args) => `Run ${(args as { command: string }).command}`, handler: async () => ok(null) });

  /** The app, its policy, and the one call the agent is waiting for approval of; `outcome.answer` is what the agent was told. */
  async function askAbout(toolName: string, args: unknown) {
    const permissions = createPermissionBridge();
    const outcome: { answer?: boolean } = {};
    const policy: AgentPolicy = { mode: "default", rules: { allow: [], deny: [] }, hooks: [], askPermission: async () => false };
    const session: AgentSession = {
      // eslint-disable-next-line require-yield
      async *chat() {
        outcome.answer = await permissions.ask(toolName, args);
      },
    };
    const a = await start({ ...size, permissions, policy, initialSession: session });
    await a.press("go");
    await a.press(KEY.enter);
    return { a, policy, outcome };
  }

  it("takes the input box's place with numbered choices, the first one marked", async () => {
    const { a } = await askAbout("approval-test-edit", { path: "a.ts" });
    const screen = a.screen();
    expect(screen).toContain("Edit a.ts");
    expect(screen).toContain("❯ 1. Yes");
    expect(screen).toContain("  2. Yes, and don't ask again for edits this session (shift+tab)");
    expect(screen).toContain("  3. No (esc)");
    expect(screen.split("\n").some((row) => /^ > /.test(row))).toBe(false); // no input box
    expect(screen).not.toMatch(/[╭╮╰╯]/); // and no border
  });

  it("moves the mark with the arrow keys, stopping at the ends, and answers with enter", async () => {
    const { a, outcome } = await askAbout("approval-test-edit", { path: "a.ts" });

    await a.press(KEY.down);
    expect(a.screen()).toContain("❯ 2. Yes, and don't ask again");
    await a.press(KEY.down);
    await a.press(KEY.down);
    expect(a.screen()).toContain("❯ 3. No");
    await a.press(KEY.up);
    expect(a.screen()).toContain("❯ 2. Yes, and don't ask again");
    await a.press(KEY.up);
    await a.press(KEY.up);
    expect(a.screen()).toContain("❯ 1. Yes");

    await a.press(KEY.enter);
    expect(outcome.answer).toBe(true);
  });

  it("brings the input box back once it is answered, with what was typed before still in it", async () => {
    const { a } = await askAbout("approval-test-edit", { path: "a.ts" });
    await a.press(KEY.enter);
    expect(a.screen()).not.toContain("Do you want to proceed?");
    expect(a.screen().split("\n").some((row) => /^ > /.test(row))).toBe(true);
  });

  it("answers no with enter on the last choice, with esc, or with n, and does not remember anything", async () => {
    for (const answer of [() => [KEY.down, KEY.down, KEY.enter], () => [KEY.escape], () => ["n"]]) {
      const { a, policy, outcome } = await askAbout("approval-test-edit", { path: "a.ts" });
      for (const key of answer()) await a.press(key);
      expect(outcome.answer).toBe(false);
      expect(policy.mode).toBe("default");
      await a.unmount();
      app = undefined;
    }
  });

  it("answers by number, and 'y' means yes", async () => {
    const first = await askAbout("approval-test-edit", { path: "a.ts" });
    await first.a.press("3");
    expect(first.outcome.answer).toBe(false);
    await first.a.unmount();
    app = undefined;

    const second = await askAbout("approval-test-edit", { path: "a.ts" });
    await second.a.press("y");
    expect(second.outcome.answer).toBe(true);
    expect(second.policy.mode).toBe("default");
  });

  it("ignores a number with no choice behind it", async () => {
    const { a, outcome } = await askAbout("approval-test-edit", { path: "a.ts" });
    await a.press("9");
    expect(outcome.answer).toBeUndefined();
    expect(a.screen()).toContain("Do you want to proceed?");
  });

  it("'yes, don't ask again' for an edit switches to accept-edits mode, as does shift+tab", async () => {
    const byNumber = await askAbout("approval-test-edit", { path: "a.ts" });
    await byNumber.a.press("2");
    expect(byNumber.outcome.answer).toBe(true);
    expect(byNumber.policy.mode).toBe("acceptEdits");
    expect(byNumber.a.screen()).toContain("accept edits on");
    await byNumber.a.unmount();
    app = undefined;

    const byKey = await askAbout("approval-test-edit", { path: "a.ts" });
    await byKey.a.press(SHIFT_TAB);
    expect(byKey.outcome.answer).toBe(true);
    expect(byKey.policy.mode).toBe("acceptEdits");
  });

  it("'yes, don't ask again' for a command remembers only that exact command", async () => {
    const { a, policy, outcome } = await askAbout("approval-test-run", { command: "npm test" });
    expect(a.screen()).toContain("2. Yes, and don't ask again for this exact command this session");
    await a.press("2");
    expect(outcome.answer).toBe(true);
    expect(policy.rules.allow).toEqual(["approval-test-run(npm test)"]);
    expect(policy.mode).toBe("default");
  });

  it("offers only yes and no for a call it cannot safely remember, and shift+tab then does nothing", async () => {
    const { a, outcome } = await askAbout("approval-test-run", { command: "echo a\necho b" });
    expect(a.screen()).toContain("2. No (esc)");
    expect(a.screen()).not.toContain("don't ask again");
    await a.press(SHIFT_TAB);
    expect(outcome.answer).toBeUndefined();
  });

  it("ignores typing while it is up, so it cannot reach the input box", async () => {
    const { a, outcome } = await askAbout("approval-test-edit", { path: "a.ts" });
    await a.press("x");
    expect(outcome.answer).toBeUndefined();
    await a.press(KEY.enter);
    await a.press(KEY.enter);
    expect(a.screen()).not.toContain("> x");
  });
});

describe("App: a conversation longer than the screen", () => {
  it("keeps showing the newest messages, and does not draw the top of the banner over the oldest one showing", async () => {
    const a = await start({ rows: 24, columns: 80 });
    for (let i = 0; i < 20; i += 1) {
      await a.type(`m${i}`);
      await a.press(KEY.enter);
    }
    const screen = a.screen();
    expect(screen).toContain("> m19");
    expect(screen).not.toMatch(/^> m0\s*$/m); // the oldest has scrolled off the top
    expect(screen).not.toContain("Press esc to interrupt a running request."); // nor is a banner row overwritten by a message
    expect(screen.split("\n")).toHaveLength(24);
  });
});

describe("App: scrolling the transcript (page up and page down)", () => {
  /** Sends `count` messages, `m0`, `m1`…, each in one piece to keep the test quick. */
  async function sendMessages(a: DrivenApp, count: number, from = 0) {
    for (let i = from; i < from + count; i += 1) {
      await a.press(`m${i}`);
      await a.press(KEY.enter);
    }
  }
  const size = { rows: 24, columns: 80 };

  it("page up shows older messages and a notice saying how far; page down comes back to the newest", async () => {
    const a = await start(size);
    await sendMessages(a, 20);
    expect(a.screen()).toContain("> m19");
    expect(a.screen()).not.toContain("rows below");

    await a.press(KEY.pageUp);
    expect(a.screen()).toContain("rows below");
    expect(a.screen()).not.toContain("> m19");
    expect(a.screen().split("\n")).toHaveLength(24);

    await a.press(KEY.pageDown);
    expect(a.screen()).toContain("> m19");
    expect(a.screen()).not.toContain("rows below");
    expect(a.screen().split("\n")).toHaveLength(24);
  });

  it("reaches the very top, where the banner is, and stops there however many times it is pressed", async () => {
    const a = await start(size);
    await sendMessages(a, 20);
    for (let i = 0; i < 6; i += 1) await a.press(KEY.pageUp);
    expect(a.screen()).toContain("v0.0.0-test");
    expect(a.screen()).toContain("> m0");
    expect(a.screen().split("\n")).toHaveLength(24);
    await a.press(KEY.pageUp);
    expect(a.screen()).toContain("> m0");
  });

  it("jumps back to the newest messages when a message is sent", async () => {
    const a = await start(size);
    await sendMessages(a, 20);
    await a.press(KEY.pageUp);
    expect(a.screen()).toContain("rows below");

    await a.type("z");
    await a.press(KEY.enter);
    expect(a.screen()).toContain("> z");
    expect(a.screen()).not.toContain("rows below");
  });

  it("types nothing and leaves a draft alone", async () => {
    const a = await start(size);
    await sendMessages(a, 20);
    await a.type("draft");
    await a.press(KEY.pageUp);
    await a.press(KEY.pageDown);
    await a.press(KEY.enter);
    expect(a.sent.at(-1)).toBe("draft");
  });

  it("has nothing to scroll in a conversation that fits on the screen", async () => {
    const a = await start(size);
    await sendMessages(a, 2);
    await a.press(KEY.pageUp);
    expect(a.screen()).not.toContain("rows below");
    expect(a.screen()).toContain("v0.0.0-test");
  });

  it("works while the agent is still working on a reply", async () => {
    let release!: () => void;
    let turns = 0;
    const session: AgentSession = {
      // eslint-disable-next-line require-yield
      async *chat() {
        turns += 1;
        if (turns === 21) await new Promise<void>((resolve) => (release = resolve));
      },
    };
    const a = await start({ ...size, initialSession: session });
    await sendMessages(a, 21); // the last turn starts and does not finish
    expect(a.screen()).toContain("esc to interrupt");

    await a.press(KEY.pageUp);
    expect(a.screen()).toContain("rows below");
    expect(a.screen()).toContain("esc to interrupt");

    release();
    await settle();
  });
});

describe("App: the terminal", () => {
  it("listens for the terminal being resized once, however long the conversation gets (Node warns past ten listeners)", async () => {
    const a = await start();
    const atStart = a.resizeListeners();
    expect(atStart).toBeLessThanOrEqual(2); // Ink's own, and the app's one shared subscription
    for (let i = 0; i < 12; i += 1) {
      await a.type("x"); // more messages than Node's limit of ten listeners, and each is a component of its own
      await a.press(KEY.enter);
    }
    expect(a.resizeListeners()).toBe(atStart);
  });
});

describe("App: editing keys", () => {
  it("ctrl+w deletes the word before the cursor", async () => {
    const a = await start();
    await a.type("alpha bravo charlie");
    await a.press(KEY.ctrlW);
    expect(a.screen()).not.toContain("charlie");
    await a.type("X"); // the space before the deleted word is kept, and the cursor is right after it
    expect(a.screen()).toContain("> alpha bravo X");
  });

  it("alt+backspace deletes a word too", async () => {
    const a = await start();
    await a.type("alpha bravo");
    await a.press(KEY.altBackspace);
    expect(a.screen()).not.toContain("bravo");
    await a.type("X");
    expect(a.screen()).toContain("> alpha X");
  });

  it("home and end, read from the raw terminal input, move to the ends of the line", async () => {
    const a = await start();
    await a.type("abc");
    await a.press(KEY.home);
    await a.type("X");
    expect(a.screen()).toContain("> Xabc");
    await a.press(KEY.end);
    await a.type("Y");
    expect(a.screen()).toContain("> XabcY");
  });

  it("ctrl+a and ctrl+e do the same, and alt+left moves back a word", async () => {
    const a = await start();
    await a.type("one two");
    await a.press(KEY.ctrlA);
    await a.type("X");
    expect(a.screen()).toContain("> Xone two");
    await a.press(KEY.ctrlE);
    await a.press(KEY.altLeft);
    await a.type("Y");
    expect(a.screen()).toContain("> Xone Ytwo");
  });

  it("ctrl+u deletes to the start of the line and ctrl+k to its end", async () => {
    const a = await start();
    await a.type("keep this|drop this");
    for (let i = 0; i < "drop this".length; i += 1) await a.press(KEY.left);
    await a.press(KEY.ctrlK);
    expect(a.screen()).toContain("> keep this|");
    expect(a.screen()).not.toContain("drop");
    await a.press(KEY.ctrlU);
    expect(a.screen()).not.toContain("keep this");
  });

  it("does not type the letter of a ctrl combination nothing is bound to", async () => {
    const a = await start();
    await a.type("ab");
    await a.press("\u0018"); // ctrl+x
    await a.press(KEY.enter);
    expect(a.sent).toEqual(["ab"]);
  });
});

describe("App: several lines", () => {
  it("backslash then enter starts a new line instead of sending", async () => {
    const a = await start();
    await a.type(`first${BACKSLASH}`);
    await a.press(KEY.enter);
    expect(a.sent).toEqual([]);
    await a.type("second");
    await a.press(KEY.enter);
    expect(a.sent).toEqual(["first\nsecond"]);
  });

  it("keeps the line breaks of a paste, which a terminal sends as one chunk with carriage returns", async () => {
    const a = await start();
    await a.press("line one\rline two");
    expect(a.sent).toEqual([]); // a paste is not a send
    await a.press(KEY.enter);
    expect(a.sent).toEqual(["line one\nline two"]);
  });

  it("moves between the lines with up and down before it recalls history", async () => {
    const a = await start({ initialHistory: ["an older message"] });
    await a.press("one\rtwo");
    await a.press(KEY.up); // to the first line, not to the older message
    await a.type("X");
    await a.press(KEY.enter);
    expect(a.sent).toEqual(["oneX\ntwo"]);
  });

  it("recalls earlier messages with up once there is no line above", async () => {
    const a = await start({ initialHistory: ["an older message"] });
    await a.press(KEY.up);
    expect(a.screen()).toContain("> an older message");
    await a.press(KEY.down);
    expect(a.screen()).not.toContain("an older message");
  });
});

describe("App: reverse search (ctrl+r)", () => {
  const initialHistory = ["fix the parser", "add tests", "explain src/a.ts"];

  it("shows the newest message first, narrows as you type, and takes the match into the box without sending it", async () => {
    const a = await start({ initialHistory });
    await a.press(KEY.ctrlR);
    expect(a.screen()).toContain("reverse search:");
    expect(a.screen()).toContain("> explain src/a.ts");

    await a.type("pars");
    expect(a.screen()).toContain("> fix the parser");
    expect(a.screen()).toContain("(1/1");

    await a.press(KEY.enter);
    expect(a.screen()).not.toContain("reverse search:");
    expect(a.screen()).toContain("> fix the parser");
    expect(a.sent).toEqual([]); // taking a match does not send it

    await a.press(KEY.enter);
    expect(a.sent).toEqual(["fix the parser"]);
    expect(a.remembered).toEqual(["fix the parser"]);
  });

  it("goes to an older match when ctrl+r is pressed again", async () => {
    const a = await start({ initialHistory });
    await a.press(KEY.ctrlR);
    await a.press(KEY.ctrlR);
    expect(a.screen()).toContain("> add tests");
    expect(a.screen()).toContain("(2/3");
  });

  it("gives up with escape, leaving what was typed as it was", async () => {
    const a = await start({ initialHistory });
    await a.type("my draft");
    await a.press(KEY.ctrlR);
    expect(a.screen()).toContain("> explain src/a.ts");
    await a.press(KEY.escape);
    expect(a.screen()).not.toContain("reverse search:");
    expect(a.screen()).toContain("> my draft");
  });

  it("says so when nothing matches, and leaves the box alone", async () => {
    const a = await start({ initialHistory });
    await a.type("draft");
    await a.press(KEY.ctrlR);
    await a.type("zzz");
    expect(a.screen()).toContain("no matches");
    await a.press(KEY.enter);
    expect(a.screen()).toContain("> draft");
  });

  it("does nothing when there is no history yet", async () => {
    const a = await start();
    await a.press(KEY.ctrlR);
    expect(a.screen()).not.toContain("reverse search:");
  });
});

describe("App: the @ file menu", () => {
  it("lists matching files as you type, and tab fills in the plain path (no @) and closes the menu", async () => {
    const a = await start();
    await a.type("@in");
    expect(a.screen()).toContain("❯ src/index.ts");
    expect(a.screen()).toContain("src/ui/components/InputBox.tsx");

    await a.press(KEY.tab);
    expect(a.screen()).toContain("> src/index.ts");
    expect(a.screen()).not.toContain("@in");
    expect(a.screen()).not.toContain("src/ui/components/InputBox.tsx");

    await a.press(KEY.enter);
    expect(a.sent).toEqual(["src/index.ts"]);
  });

  it("enter fills in the path too once something is typed after the @, instead of sending", async () => {
    const a = await start();
    await a.type("look at @in");
    await a.press(KEY.enter);
    expect(a.sent).toEqual([]);
    expect(a.screen()).toContain("> look at src/index.ts");
  });

  it("down chooses the next file", async () => {
    const a = await start();
    await a.type("@in");
    await a.press(KEY.down);
    await a.press(KEY.tab);
    expect(a.screen()).toContain("> src/ui/components/InputBox.tsx");
  });

  it("escape closes the menu and keeps the text, and typing on brings it back", async () => {
    const a = await start();
    await a.type("@in");
    await a.press(KEY.escape);
    expect(a.screen()).toContain("> @in");
    expect(a.screen()).not.toContain("❯ src/index.ts");
    await a.type("d");
    expect(a.screen()).toContain("❯ src/index.ts");
  });

  it("sends a message that has only a lone @ in it, rather than filling in a file", async () => {
    const a = await start();
    await a.type("meet @");
    await a.press(KEY.enter);
    expect(a.sent).toEqual(["meet @"]);
  });

  it("does not open for an @ inside a word, like an email address", async () => {
    const a = await start();
    await a.type("write to me@in");
    expect(a.screen()).not.toContain("src/index.ts");
  });
});

describe("App: an API key never reaches the history, the screen or the agent", () => {
  const KEY_TEXT = "sk-super-secret-9999";

  /** Opens /provider, picks Google (the second entry), and returns once it is asking for the key. */
  async function startAskingForGoogleKey(a: DrivenApp) {
    await a.press("/provider"); // in one piece, like a paste: how it was typed is not the point here
    await a.press(KEY.enter); // the slash menu is open: enter runs the highlighted command
    await a.press(KEY.down);
    await a.press(KEY.enter);
    expect(a.screen()).toContain("Google API key");
  }

  it("keeps a typed key out of the history, the transcript and the model, and masks it on screen", async () => {
    const a = await start();
    await startAskingForGoogleKey(a);

    for (const character of KEY_TEXT) await a.press(character); // the one test that types the key a character at a time
    expect(a.screen()).not.toContain(KEY_TEXT);
    await a.press(KEY.enter);
    await a.press("gemini-x");
    await a.press(KEY.enter);

    // the key was handled: it reached the provider manager, which is what saves it
    expect(a.configured).toEqual([{ provider: "google", values: { apiKey: KEY_TEXT, model: "gemini-x" } }]);
    // and nowhere else
    expect(a.remembered).toEqual(["/provider"]);
    expect(a.sent).toEqual([]);
    expect(a.screen()).not.toContain(KEY_TEXT);
  });

  it("does not offer the key, or anything else, to ctrl+r afterwards", async () => {
    const a = await start();
    await startAskingForGoogleKey(a);
    await a.press(KEY_TEXT);
    await a.press(KEY.enter);
    await a.press("gemini-x");
    await a.press(KEY.enter);

    await a.press(KEY.ctrlR);
    await a.type("secret");
    expect(a.screen()).toContain("no matches");
    expect(a.screen()).not.toContain(KEY_TEXT);
  });

  it("does not open ctrl+r while the key is being asked for", async () => {
    const a = await start({ initialHistory: ["an older message"] });
    await startAskingForGoogleKey(a);
    await a.press("sk-partial");
    await a.press(KEY.ctrlR);
    expect(a.screen()).not.toContain("reverse search:");
    expect(a.screen()).not.toContain("an older message");
  });

  it("takes a pasted key whole, without the newline a terminal puts after a paste", async () => {
    const a = await start();
    await startAskingForGoogleKey(a);

    await a.press(`${KEY_TEXT}\r`);
    expect(a.screen()).not.toContain(KEY_TEXT);
    await a.press(KEY.enter);
    await a.press("gemini-x");
    await a.press(KEY.enter);

    expect(a.configured[0]?.values.apiKey).toBe(KEY_TEXT);
    expect(a.remembered).toEqual(["/provider"]);
  });

  it("does not open the @ menu while the key is being typed", async () => {
    const a = await start();
    await startAskingForGoogleKey(a);
    await a.type("@in");
    expect(a.screen()).not.toContain("src/index.ts");
  });
});

describe("App: picking a model in /provider", () => {
  const KEY_TEXT = "sk-model-secret-1234";
  const models = [{ id: "gemini-pro", displayName: "Gemini Pro" }, { id: "gemini-flash" }, { id: "gemini-lite", displayName: "Gemini Lite" }];
  const listing: ProviderManager["listModels"] = async () => ok(models);

  /** Opens /provider, picks the provider at `position` in the picker (ollama, google, anthropic), and returns at its first question. */
  async function openProvider(a: DrivenApp, position: number) {
    await a.press("/provider");
    await a.press(KEY.enter);
    for (let step = 0; step < position; step++) await a.press(KEY.down);
    await a.press(KEY.enter);
  }

  /** Gets to the model step for Google: the key has been entered. */
  async function enterGoogleKey(a: DrivenApp) {
    await openProvider(a, 1);
    expect(a.screen()).toContain("Google API key");
    await a.press(KEY_TEXT);
    await a.press(KEY.enter);
  }

  it("shows the models the provider offers as soon as the key is entered", async () => {
    const a = await start({ listModels: listing });
    await enterGoogleKey(a);

    const screen = a.screen();
    expect(screen).toContain("Found 3 models for Google Gemini");
    for (const text of ["gemini-pro", "Gemini Pro", "gemini-flash", "gemini-lite", "Other…"]) expect(screen).toContain(text);
    expect(screen).toContain("❯ gemini-pro");
    expect(a.listed).toEqual([{ provider: "google", values: { apiKey: KEY_TEXT } }]);
    expect(screen).not.toContain(KEY_TEXT);
  });

  it("saves the model picked with the arrow keys, and nothing else reaches the history or the agent", async () => {
    const a = await start({ listModels: listing });
    await enterGoogleKey(a);

    await a.press(KEY.down);
    expect(a.screen()).toContain("❯ gemini-flash");
    await a.press(KEY.enter);

    expect(a.configured).toEqual([{ provider: "google", values: { apiKey: KEY_TEXT, model: "gemini-flash" } }]);
    expect(a.screen()).toContain("Now using Google Gemini (gemini-flash)");
    expect(a.screen()).not.toContain(KEY_TEXT);
    expect(a.remembered).toEqual(["/provider"]);
    expect(a.sent).toEqual([]);
  });

  it("does not let the up arrow run off the top or the down arrow off the bottom", async () => {
    const a = await start({ listModels: listing });
    await enterGoogleKey(a);

    await a.press(KEY.up);
    expect(a.screen()).toContain("❯ gemini-pro");
    for (let step = 0; step < 10; step++) await a.press(KEY.down);
    expect(a.screen()).toContain("❯ Other…");
  });

  it("lets a model that is not listed be typed, through Other…", async () => {
    const a = await start({ listModels: listing });
    await enterGoogleKey(a);

    for (let step = 0; step < models.length; step++) await a.press(KEY.down);
    await a.press(KEY.enter);
    expect(a.screen()).toContain("Model (for example");
    await a.press("my-private-model");
    await a.press(KEY.enter);

    expect(a.configured).toEqual([{ provider: "google", values: { apiKey: KEY_TEXT, model: "my-private-model" } }]);
  });

  it("says why when the models cannot be listed, without the key, and asks for the name instead", async () => {
    const a = await start({ listModels: async () => err(new CortexError("Google returned 400: API key not valid", "LLM_GOOGLE_REQUEST_FAILED")) });
    await enterGoogleKey(a);

    const screen = a.screen();
    expect(screen).toContain("Could not list the models Google Gemini offers: Google returned 400: API key not valid");
    expect(screen).toContain("Model (for example");
    expect(screen).not.toContain(KEY_TEXT);

    await a.press("gemini-x");
    await a.press(KEY.enter);
    expect(a.configured).toEqual([{ provider: "google", values: { apiKey: KEY_TEXT, model: "gemini-x" } }]);
  });

  it("asks for the name instead when the provider has no usable model to offer", async () => {
    const a = await start({ listModels: async () => ok([]) });
    await enterGoogleKey(a);

    expect(a.screen()).toContain("did not list any models that can be used");
    expect(a.screen()).toContain("Model (for example");
  });

  it("asks for the name instead if looking the models up throws", async () => {
    const a = await start({
      listModels: async () => {
        throw new Error("boom");
      },
    });
    await enterGoogleKey(a);

    expect(a.screen()).toContain("Could not list the models Google Gemini offers: boom");
    expect(a.screen()).toContain("Model (for example");
  });

  it("waits while the models are looked up, ignores typing, and drops a late answer after esc", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const a = await start({
      listModels: async () => {
        await gate;
        return ok(models);
      },
    });
    await enterGoogleKey(a);

    expect(a.screen()).toContain("looking up the models available");
    expect(a.screen()).toContain("esc to cancel");
    expect(a.screen()).not.toContain("enter to confirm");
    await a.press("abc");
    await a.press(KEY.enter);
    expect(a.screen()).not.toContain("> abc");
    expect(a.configured).toEqual([]);

    await a.press(KEY.escape);
    expect(a.screen()).toContain("Setup cancelled");
    release();
    await settle();
    expect(a.screen()).not.toContain("gemini-pro");
    expect(a.screen()).not.toContain("Found 3 models");
    expect(a.configured).toEqual([]);
  });

  it("escape closes the model menu and saves nothing", async () => {
    const a = await start({ listModels: listing });
    await enterGoogleKey(a);

    await a.press(KEY.escape);

    expect(a.screen()).toContain("Setup cancelled");
    expect(a.screen()).not.toContain("❯ gemini-pro");
    expect(a.configured).toEqual([]);
  });

  it("draws a long list a screenful at a time and still reaches every model", async () => {
    const many = Array.from({ length: 30 }, (_, index) => ({ id: `model-${String(index).padStart(2, "0")}` }));
    const a = await start({ listModels: async () => ok(many) });
    await enterGoogleKey(a);

    expect(a.screen()).toContain("Found 30 models");
    expect(a.screen()).toContain("❯ model-00");
    expect(a.screen()).not.toContain("model-29");

    for (let step = 0; step < 29; step++) await a.press(KEY.down);
    expect(a.screen()).toContain("❯ model-29");
    expect(a.screen()).not.toContain("model-00");
    await a.press(KEY.enter);

    expect(a.configured).toEqual([{ provider: "google", values: { apiKey: KEY_TEXT, model: "model-29" } }]);
  });

  it("asks Ollama for its server first, since that is what the models are listed from", async () => {
    const a = await start({ listModels: async () => ok([{ id: "llama3.1" }, { id: "qwen3:4b" }]) });
    await openProvider(a, 0);
    expect(a.screen()).toContain("Server URL");

    await a.press("http://gpu-box:11434");
    await a.press(KEY.enter);

    expect(a.listed).toEqual([{ provider: "ollama", values: { baseUrl: "http://gpu-box:11434" } }]);
    expect(a.screen()).toContain("❯ llama3.1");
    await a.press(KEY.down);
    await a.press(KEY.enter);
    expect(a.configured).toEqual([{ provider: "ollama", values: { baseUrl: "http://gpu-box:11434", model: "qwen3:4b" } }]);
  });

  it("lists Ollama's models with the default server when the URL is left blank", async () => {
    const a = await start({ listModels: async () => ok([{ id: "llama3.1" }]) });
    await openProvider(a, 0);
    await a.press(KEY.enter);

    expect(a.listed).toEqual([{ provider: "ollama", values: {} }]);
    expect(a.screen()).toContain("Found 1 model for Ollama (local)");
  });
});
