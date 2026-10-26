/** Command-line arguments: `cortex [--mode <mode>] [--agent <agent>] [-p <prompt>] [--help]`. */
import { AGENT_MODE_IDS, isAgentModeId, type AgentModeId } from "@cortex/agent";
import { CortexError, err, ok, type Result } from "@cortex/core";
import { PERMISSION_MODES, isPermissionMode, type PermissionMode } from "@cortex/policy";

export interface CliArgs {
  /** `--mode`: how much the agent may do without asking. Falls back to settings, then "default". */
  mode?: PermissionMode;
  /** `--agent`: start as one of the agents (scan, suggest, fix) instead of the general agent. */
  agent?: AgentModeId;
  /** `-p`: run this one prompt non-interactively, print the answer, and exit. */
  prompt?: string;
  help: boolean;
}

export const USAGE = `Usage: cortex [options]

Options:
  --mode <mode>   Permission mode: ${PERMISSION_MODES.join(" | ")}
  --agent <name>  Start as an agent: ${AGENT_MODE_IDS.join(" | ")} (scan and suggest save a report, so add --mode acceptEdits with -p)
  -p <prompt>     Run one prompt non-interactively and print the answer
  -h, --help      Show this help

Provider: set CORTEX_PROVIDER (ollama | google | anthropic). The default is ollama, which needs OLLAMA_MODEL.`;

export class UsageError extends CortexError {
  constructor(message: string) {
    super(message, "CLI_USAGE");
  }
}

/** Parses argv (without the node and script entries). Unknown flags and missing values are usage errors. */
export function parseArgs(argv: string[]): Result<CliArgs> {
  const args: CliArgs = { help: false };

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]!;

    if (flag === "-h" || flag === "--help") {
      args.help = true;
    } else if (flag === "--mode" || flag === "--agent" || flag === "-p") {
      const value = argv[i + 1];
      if (value === undefined) return err(new UsageError(`Missing value for ${flag}`));
      i += 1;

      if (flag === "-p") {
        args.prompt = value;
      } else if (flag === "--agent") {
        if (!isAgentModeId(value)) return err(new UsageError(`Unknown --agent "${value}". Use one of: ${AGENT_MODE_IDS.join(", ")}`));
        args.agent = value;
      } else if (isPermissionMode(value)) {
        args.mode = value;
      } else {
        return err(new UsageError(`Unknown --mode "${value}". Use one of: ${PERMISSION_MODES.join(", ")}`));
      }
    } else {
      return err(new UsageError(`Unknown option: ${flag}`));
    }
  }

  return ok(args);
}
