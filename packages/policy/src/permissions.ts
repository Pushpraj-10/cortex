/**
 * Permission decisions: whether a tool call runs, is refused, or needs the user's approval.
 * Decisions depend on the tool's `kind` (read / edit / execute), never on its name, so adding
 * a tool never means touching policy.
 */
import path from "node:path";
import type { ToolKind } from "@cortex/tools";
import { PERMISSION_MODES, type Decision, type PermissionMode, type PermissionRules } from "./types.js";

export function isPermissionMode(value: unknown): value is PermissionMode {
  return (PERMISSION_MODES as readonly unknown[]).includes(value);
}

// ---- Rules -----------------------------------------------------------------------

/** What a matched rule does. The two are matched differently: an allow rule must be narrow, a deny rule must not be easy to slip past. */
export type RuleEffect = "allow" | "deny";

/** The argument a rule's pattern is matched against: the command, or else the path-like argument. */
export function primaryArgument(input: Record<string, unknown>): string {
  return String(input.command ?? input.path ?? input.from ?? input.pattern ?? "");
}

/**
 * `run_command`             -> any call of that tool
 * `run_command(npm test)`   -> exactly that command
 * `run_command(npm test:*)` -> that command, alone or followed by arguments (not `npm testing`)
 * `run_command(npm test*)`  -> a command starting with "npm test"
 * `read_file(src/*)`        -> a path starting with "src/"
 *
 * A pattern with a wildcard is a promise about a *kind* of call, so the two effects hold it differently:
 *  - **allow** only matches a plain command: one with a shell control character in it (`; & | < > ( ) $ ` ^ %` or a
 *    line break) could do something else as well, so it is not covered and the user is asked. Paths are compared
 *    after normalising (`src/../.git/config` is not under `src/`), and every path argument must match, not just the first.
 *  - **deny** looks past the ways of writing the same command differently (see `commandCandidates`), and matches if
 *    any path argument does. This is best effort, not a sandbox: a command can always be disguised further.
 * A pattern with no wildcard is plain equality for either, so a remembered "this exact command" rule means just that.
 */
export function matchRule(rule: string, toolName: string, input: Record<string, unknown>, effect: RuleEffect = "allow"): boolean {
  const match = /^([^()]+?)(?:\((.*)\))?$/.exec(rule.trim());
  if (!match || match[1] !== toolName) return false;
  const pattern = match[2];
  if (pattern === undefined) return true;

  if (typeof input.command === "string") return matchCommand(pattern, input.command, effect);

  const { values, isPath } = ruleArguments(input);
  const matches = (value: string) => matchText(pattern, value, effect, isPath);
  return effect === "allow" ? values.every(matches) : values.some(matches);
}

/** A pattern split into what it must start with, and whether it is a prefix pattern (`x*`) at a word boundary (`x:*`). */
function splitPattern(pattern: string): { prefix: string; wildcard: boolean; atWord: boolean } {
  if (pattern.endsWith(":*")) return { prefix: pattern.slice(0, -2), wildcard: true, atWord: true };
  if (pattern.endsWith("*")) return { prefix: pattern.slice(0, -1), wildcard: true, atWord: false };
  return { prefix: pattern, wildcard: false, atWord: false };
}

/** `text` is `prefix`, or `prefix` followed by whitespace and more: `npm test` and `npm test -- x`, not `npm testing`. */
const startsAtWord = (text: string, prefix: string): boolean => text === prefix || (text.startsWith(prefix) && /\s/.test(text.charAt(prefix.length)));

// ---- Matching a command ----------------------------------------------------------

/** Characters with which one shell line (sh, or cmd.exe on Windows) can do more than the command it starts with. */
const SHELL_CONTROL = /[;&|<>()`$^%\n\r\0]/;

/** Words that run the command after them, so a rule about that command has to see through them. */
const WRAPPERS = new Set([
  "sudo", "doas", "env", "command", "exec", "builtin", "nohup", "time", "nice", "ionice", "stdbuf", "xargs",
  "if", "then", "else", "elif", "do", "while", "until", "!", "{", "}",
]);
/** For the wrappers that have them, the single-letter options that take the following word as their value (`sudo -u root`, `env -u NAME`). */
const VALUE_OPTIONS: Record<string, string> = { sudo: "ughCprtUDR", doas: "uC", env: "uCS" };
/** Shells, whose `-c` / `/c` argument is itself a command line (and `eval`, whose arguments are). */
const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh", "fish", "cmd", "powershell", "pwsh", "eval"]);
const SHELL_COMMAND_FLAG = /^(?:-[a-z]*c|-command|\/[ck])$/i;
const MAX_SHELL_DEPTH = 3;

/** The program a word runs: no quotes, no directory, no `.exe`. `/bin/rm`, `"rm"`, `\rm`, `r''m` and `RM.EXE` are all `rm`. */
function commandWord(token: string): string {
  const bare = token.replace(/['"]/g, "");
  const name = bare.split(/[\\/]/).pop() ?? bare;
  return name.replace(/\.(?:exe|cmd|bat|com)$/i, "");
}

const unquote = (text: string) => text.replace(/^['"\s]+|['"\s]+$/g, "");

/**
 * Every way a deny rule should consider a command line to read: the line itself, and each command in it (it is cut at
 * `; & | ( ) `` and line breaks, so `ls && rm x`, `(rm x)`, `$(rm x)` and `` `rm x` `` all expose `rm x`) with leading
 * variable assignments and wrappers (`sudo`, `env -i`, `nohup`, ...) taken off and the program name normalised. A shell's
 * `-c` argument is read the same way, a few levels deep.
 */
function commandCandidates(command: string, depth = 0): string[] {
  const candidates = [command.trim()];
  for (const piece of command.split(/[;&|()`\n\r]/)) {
    const tokens = piece.trim().split(/\s+/).filter(Boolean);

    let at = 0;
    while (at < tokens.length) {
      const token = tokens[at]!;
      if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) {
        at += 1;
      } else if (WRAPPERS.has(commandWord(token).toLowerCase())) {
        const takesValue = VALUE_OPTIONS[commandWord(token).toLowerCase()] ?? "";
        at += 1;
        while (tokens[at]?.startsWith("-")) {
          // The wrapper's own options; `sudo -u root rm` has an option that takes the next word as its value.
          const option = tokens[at]!;
          at += option.length === 2 && takesValue.includes(option[1]!) ? 2 : 1;
        }
      } else {
        break;
      }
    }
    if (at >= tokens.length) continue;

    const word = commandWord(tokens[at]!);
    const rest = tokens.slice(at + 1);
    candidates.push([word, ...rest].join(" "));

    const shell = word.toLowerCase();
    if (depth < MAX_SHELL_DEPTH && SHELLS.has(shell)) {
      const flag = rest.findIndex((token) => SHELL_COMMAND_FLAG.test(token));
      const inner = shell === "eval" ? rest.join(" ") : flag === -1 ? "" : rest.slice(flag + 1).join(" ");
      if (inner) candidates.push(...commandCandidates(unquote(inner), depth + 1));
    }
  }
  return candidates;
}

function matchCommand(pattern: string, command: string, effect: RuleEffect): boolean {
  const { prefix, wildcard, atWord } = splitPattern(pattern);

  if (effect === "allow") {
    if (!wildcard) return command === pattern;
    if (SHELL_CONTROL.test(command)) return false;
    return atWord ? startsAtWord(command, prefix) : command.startsWith(prefix);
  }

  const wanted = prefix.toLowerCase();
  return commandCandidates(command).some((candidate) => {
    const text = candidate.toLowerCase();
    if (!wildcard) return text === wanted;
    return atWord ? startsAtWord(text, wanted) : text.startsWith(wanted);
  });
}

// ---- Matching a path or other argument -------------------------------------------

/** What the call's pattern is matched against: every path it names (`path`, `from`, `to`), or else its `pattern`. */
function ruleArguments(input: Record<string, unknown>): { values: string[]; isPath: boolean } {
  const paths = ["path", "from", "to"].flatMap((key) => (typeof input[key] === "string" ? [input[key] as string] : []));
  if (paths.length > 0) return { values: paths, isPath: true };
  return { values: [typeof input.pattern === "string" ? input.pattern : ""], isPath: false };
}

/** A path as one spelling: forward slashes, `.` and `..` folded away, no leading `./`. */
const portablePath = (value: string): string => path.posix.normalize(value.replace(/\\/g, "/")).replace(/^\.\//, "");

function matchText(pattern: string, value: string, effect: RuleEffect, isPath: boolean): boolean {
  const { prefix, wildcard } = splitPattern(pattern);
  // A path is compared as it will be used (`src/../.git/x` is in `.git`), and for deny also as written, in any letter case.
  const forms = isPath ? (effect === "allow" ? [portablePath(value)] : [value, portablePath(value)]) : [value];
  const fold = (text: string) => (effect === "deny" ? text.toLowerCase() : text);
  return forms.some((form) => (wildcard ? fold(form).startsWith(fold(prefix)) : fold(form) === fold(prefix)));
}

// ---- Decision --------------------------------------------------------------------

/**
 * Order of precedence: deny rules, bypass mode, plan mode, allow rules, reads, acceptEdits, then ask.
 * A deny rule wins over everything, including `bypassPermissions`.
 */
export function decidePermission(
  tool: { name: string; kind: ToolKind },
  input: Record<string, unknown>,
  mode: PermissionMode,
  rules: PermissionRules,
): Decision {
  if (rules.deny.some((rule) => matchRule(rule, tool.name, input, "deny"))) return "deny";
  if (mode === "bypassPermissions") return "allow";
  if (mode === "plan") return tool.kind === "read" ? "allow" : "deny";
  if (rules.allow.some((rule) => matchRule(rule, tool.name, input, "allow"))) return "allow";
  if (tool.kind === "read") return "allow";
  if (mode === "acceptEdits" && tool.kind === "edit") return "allow";
  return "ask";
}
