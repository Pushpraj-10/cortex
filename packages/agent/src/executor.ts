/**
 * The executor runs one tool call by name, behind the policy pipeline:
 *   PreToolUse hooks -> permission decision (-> ask the user) -> the tool -> PostToolUse hooks.
 * Every failure comes back as an error Result whose message says what happened and what to do instead,
 * so the model adapts rather than retrying blindly. Nothing here throws.
 */
import { CortexError, err, ok, type Result } from "@cortex/core";
import { decidePermission, runHooks } from "@cortex/policy";
import { getTool, listTools, UnknownToolError, type ToolDefinition } from "@cortex/tools";
import type { AgentPolicy, Executor } from "./types.js";

// ---- Recovery hints --------------------------------------------------------------

const RECOVERY_HINTS: [pattern: RegExp, hint: string][] = [
  [/ENOENT/, "The path does not exist. Use find_files or list_directory to find the right path; paths are relative to the workspace root."],
  [/EISDIR/, "That path is a directory. Use list_directory to see what is inside it."],
  [/EACCES|EPERM/, "The OS denied access. Do not retry; tell the user."],
  [/oldString was not found/, "Read the file again; its contents differ from what you expected."],
];

/** Appends a "Hint:" line when the message matches a known failure, so the model knows what to try next. */
export function addRecoveryHint(message: string): string {
  const hint = RECOVERY_HINTS.find(([pattern]) => pattern.test(message))?.[1];
  return hint ? `${message}\nHint: ${hint}` : message;
}

// ---- Executor --------------------------------------------------------------------

function refusal(message: string, code: string): Result<never> {
  return err(new CortexError(message, code));
}

function findTool(toolName: string): ToolDefinition | undefined {
  try {
    return getTool(toolName);
  } catch (error) {
    if (error instanceof UnknownToolError) return undefined;
    throw error;
  }
}

/** Executor backed by @cortex/tools' registry. Without a policy every call simply runs. */
export function createToolsExecutor(cwd: string, policy?: AgentPolicy): Executor {
  return {
    async execute(toolName: string, args: unknown, signal?: AbortSignal): Promise<Result<unknown>> {
      const tool = findTool(toolName);
      if (!tool) {
        const available = listTools().map((t) => t.name).join(", ");
        return refusal(`Unknown tool: ${toolName}. Available tools: ${available}.`, "TOOL_UNKNOWN");
      }
      const input = typeof args === "object" && args !== null ? (args as Record<string, unknown>) : {};

      if (policy) {
        const pre = await runHooks(policy.hooks, "PreToolUse", { tool_name: toolName, tool_input: input }, cwd);
        if (pre.blocked) {
          return refusal(`Blocked by hook: ${pre.message}\nAdjust the call to satisfy the hook, or ask the user.`, "TOOL_BLOCKED");
        }

        const decision = decidePermission(tool, input, policy.mode, policy.rules);
        if (decision === "deny") {
          return refusal(
            `Permission denied for ${toolName} (mode: ${policy.mode}). Do not retry; choose a different approach or ask the user.`,
            "TOOL_DENIED",
          );
        }
        if (decision === "ask" && !(await policy.askPermission(toolName, args))) {
          return refusal("The user declined this tool call. Do not retry it unchanged; ask what they would prefer.", "TOOL_DECLINED");
        }
      }

      let result: Result<unknown>;
      try {
        result = await tool.handler(args, { cwd, signal });
      } catch (error) {
        result = err(new CortexError(error instanceof Error ? error.message : String(error), "TOOL_THREW", error));
      }
      if (!result.ok) return err(new CortexError(addRecoveryHint(result.error.message), result.error.code, result.error));

      if (policy) {
        const post = await runHooks(
          policy.hooks,
          "PostToolUse",
          { tool_name: toolName, tool_input: input, tool_response: result.value },
          cwd,
        );
        // The tool has already run, so a blocking PostToolUse hook can only add a note for the model.
        if (post.blocked) return ok({ result: result.value, hookNote: post.message });
      }
      return result;
    },
  };
}
