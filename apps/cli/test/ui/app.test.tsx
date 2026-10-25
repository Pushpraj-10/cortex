import { afterEach, describe, expect, it } from "vitest";
import type { AgentSession } from "@cortex/agent";
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
    expect(a.screen()).toContain("› src/index.ts");
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
    expect(a.screen()).not.toContain("› src/index.ts");
    await a.type("d");
    expect(a.screen()).toContain("› src/index.ts");
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
    await a.press(KEY.enter); // the slash menu is open: the first enter completes the command's name
    await a.press(KEY.enter); // the second runs it
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
