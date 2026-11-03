/**
 * The question asked before the full-screen UI starts, when a project's `.cortex/settings.json` asks to run hooks or MCP
 * servers or to allow commands: what it wants, in plain words, and one line to answer. Plain readline rather than the UI, so
 * nothing the project asks for has started yet while the user decides.
 *
 * The settings come from the repository, so what is printed is made safe first: an escape sequence in a hook's command could
 * clear the screen or recolour the question, and a right-to-left override could reorder it.
 */
import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import type { TrustAnswer, TrustRequest } from "../runtime/trust.js";

/** Longest text shown for one command. Enough that a malicious tail is not hidden by a normal-looking start; a longer one is marked, not silently cut. */
const MAX_SHOWN_CHARS = 400;
/** Most items listed per kind; the rest are counted, since the question has to stay readable. */
const MAX_ITEMS = 12;

/** Terminal controls (C0, DEL, C1) and the characters that reorder text (bidi marks, embeddings, isolates). */
const UNSAFE = /[\u0000-\u001f\u007f-\u009f؜‎‏‪-‮⁦-⁩]/g;

/** `text` with every unsafe character written out as `\uXXXX`, and cut (with the amount cut said) if it is long. */
export function showable(text: string, max = MAX_SHOWN_CHARS): string {
  const escaped = text.replace(UNSAFE, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
  return escaped.length <= max ? escaped : `${escaped.slice(0, max)}… [${escaped.length - max} more characters not shown]`;
}

const wasCut = (text: string) => text.includes("more characters not shown]");

/** The lines of the question: where, then what the project wants in each kind, then how to answer. */
export function describeTrustRequest({ cwd, requests }: TrustRequest): string[] {
  const lines = ["", "This project's .cortex/settings.json asks Cortex to run or allow the following:", `  in ${showable(cwd)}`, ""];

  const section = (title: string, items: string[]) => {
    if (items.length === 0) return;
    lines.push(`  ${title}`);
    for (const item of items.slice(0, MAX_ITEMS)) lines.push(`    ${item}`);
    if (items.length > MAX_ITEMS) lines.push(`    … and ${items.length - MAX_ITEMS} more`);
    lines.push("");
  };

  section(
    "MCP servers (started now, with your environment):",
    Object.entries(requests.mcpServers).map(([name, server]) => {
      const env = Object.keys(server.env ?? {});
      return `${showable(name, 60)}: ${showable([server.command, ...(server.args ?? [])].join(" "))}${env.length > 0 ? `  (sets ${showable(env.join(", "), 80)})` : ""}`;
    }),
  );
  section(
    "Hooks (shell commands run on events):",
    requests.hooks.map((hook) => `${hook.event}${hook.matcher ? ` [${showable(hook.matcher, 60)}]` : ""}: ${showable(hook.command)}`),
  );
  section("Allow rules (run without asking you):", requests.allow.map((rule) => showable(rule, 200)));
  if (requests.defaultMode) {
    lines.push(`  Default permission mode: ${requests.defaultMode}`, "");
  }

  const everything = lines.join("\n");
  if (wasCut(everything)) lines.push("  Some commands above are shortened. Read .cortex/settings.json itself before trusting.", "");
  lines.push("  Only trust a project you know. The answer is remembered until these settings change.");
  return lines;
}

/** y / yes trusts; q / quit / exit leaves; anything else (including just enter) carries on without. */
export function parseTrustAnswer(text: string): TrustAnswer {
  const answer = text.trim().toLowerCase();
  if (answer === "y" || answer === "yes") return "trust";
  if (answer === "q" || answer === "quit" || answer === "exit") return "quit";
  return "skip";
}

export async function askToTrust(request: TrustRequest, io: { input: Readable; output: Writable }): Promise<TrustAnswer> {
  io.output.write(`${describeTrustRequest(request).join("\n")}\n`);

  const lineReader = createInterface({ input: io.input, output: io.output });
  try {
    const answer = await new Promise<string>((resolve) => {
      lineReader.once("close", () => resolve("")); // the input ended: no answer is the cautious one
      lineReader.question("  Trust and enable these? [y] yes · [N] continue without them · [q] quit: ", resolve);
    });
    return parseTrustAnswer(answer);
  } finally {
    lineReader.close();
    // Closing the reader pauses the input; the full-screen UI starts next and must find it flowing.
    io.input.resume();
  }
}
