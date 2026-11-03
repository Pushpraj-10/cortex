/**
 * Whether to honour what a project's own `.cortex/settings.json` asks for: hooks and MCP servers that run commands, allow rules
 * that skip the approval prompt, a looser default mode. Opening a repository must not run its commands, so unless the user
 * has trusted this project with exactly these requests (or passes --trust-project for one run), they are left out.
 *
 * The decision is pure logic plus the trust store; asking the user is a callback, so the same code serves the terminal prompt,
 * a non-interactive run (which cannot ask) and the tests.
 */
import { fingerprintRequests, hasProjectRequests, isProjectTrusted, trustProject, type ProjectRequests } from "@cortex/config";

/** The user's answer: trust it (and remember), carry on without those parts, or do not open the project at all. */
export type TrustAnswer = "trust" | "skip" | "quit";

export interface TrustRequest {
  cwd: string;
  requests: ProjectRequests;
}

export type ConfirmTrust = (request: TrustRequest) => Promise<TrustAnswer>;

export interface TrustOutcome {
  /** Whether the project's requests take effect. True when there is nothing to trust. */
  trusted: boolean;
  /** The user chose not to open the project. */
  quit: boolean;
  /** Said when the requests were left out because nobody could be asked; the app prints it. */
  notice?: string;
}

/** "2 hooks, 1 MCP server, 3 allow rules": what is being left out, for a notice. */
export function summarizeRequests(requests: ProjectRequests): string {
  const parts: string[] = [];
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const servers = Object.keys(requests.mcpServers).length;
  if (servers > 0) parts.push(count(servers, "MCP server", "MCP servers"));
  if (requests.hooks.length > 0) parts.push(count(requests.hooks.length, "hook", "hooks"));
  if (requests.allow.length > 0) parts.push(count(requests.allow.length, "allow rule", "allow rules"));
  if (requests.defaultMode) parts.push(`default mode ${requests.defaultMode}`);
  return parts.join(", ");
}

export async function resolveProjectTrust(options: {
  cwd: string;
  home?: string;
  requests: ProjectRequests;
  /** --trust-project: trust it for this run without asking or remembering. */
  trustFlag?: boolean;
  /** Absent when nobody can be asked (a non-interactive run, or no terminal). */
  confirm?: ConfirmTrust;
}): Promise<TrustOutcome> {
  const { cwd, home, requests, trustFlag, confirm } = options;
  if (!hasProjectRequests(requests) || trustFlag) return { trusted: true, quit: false };

  const fingerprint = fingerprintRequests(requests);
  if (await isProjectTrusted(cwd, fingerprint, home)) return { trusted: true, quit: false };

  if (!confirm) {
    return {
      trusted: false,
      quit: false,
      notice:
        `Ignoring this project's ${summarizeRequests(requests)} from .cortex/settings.json: the project is not trusted. ` +
        `Run cortex in this folder interactively to review and trust them, or pass --trust-project.`,
    };
  }

  const answer = await confirm({ cwd, requests });
  if (answer === "quit") return { trusted: false, quit: true };
  if (answer === "skip") return { trusted: false, quit: false };

  try {
    await trustProject(cwd, fingerprint, home);
    return { trusted: true, quit: false };
  } catch (error) {
    // The user said yes, so it applies this run; it just could not be remembered, and they will be asked again next time.
    return {
      trusted: true,
      quit: false,
      notice: `Trusting this project for this run only: the answer could not be saved (${error instanceof Error ? error.message : String(error)}).`,
    };
  }
}
