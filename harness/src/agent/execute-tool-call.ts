import { runHooks } from "../hooks/run-hooks";
import type { ToolResultBlock, ToolUseBlock } from "../llm/types";
import { decidePermission } from "../permissions/decide-permission";
import { formatToolError } from "./format-tool-error";
import { truncateOutput } from "./truncate-output";
import type { AgentOptions } from "./types";

export type ToolCallDeps = Pick<AgentOptions, "tools" | "mode" | "rules" | "hooks" | "cwd" | "askPermission"> &
  Required<Pick<AgentOptions, "onEvent">>;

/**
 * Runs one tool_use block through: PreToolUse hooks -> permission -> tool -> PostToolUse hooks. Never throws.
 * Every failure tells the model what happened and what to do instead, so it does not retry blindly.
 */
export async function executeToolCall(use: ToolUseBlock, deps: ToolCallDeps): Promise<ToolResultBlock> {
  const fail = (content: string): ToolResultBlock => {
    deps.onEvent({ type: "tool_result", name: use.name, content, isError: true });
    return { type: "tool_result", tool_use_id: use.id, content, is_error: true };
  };

  deps.onEvent({ type: "tool_call", name: use.name, input: use.input });

  const tool = deps.tools.find((t) => t.name === use.name);
  if (!tool) return fail(`Unknown tool: ${use.name}. Available tools: ${deps.tools.map((t) => t.name).join(", ")}.`);

  const pre = await runHooks(deps.hooks, "PreToolUse", { tool_name: use.name, tool_input: use.input }, deps.cwd);
  if (pre.blocked) return fail(`Blocked by hook: ${pre.message}\nAdjust the call to satisfy the hook, or ask the user.`);

  const decision = decidePermission(tool, use.input, deps.mode, deps.rules);
  if (decision === "deny") {
    return fail(`Permission denied for ${use.name} (mode: ${deps.mode}). Do not retry; choose a different approach or ask the user.`);
  }
  if (decision === "ask" && !(await deps.askPermission(use.name, use.input))) {
    return fail("The user declined this tool call. Do not retry it unchanged; ask what they would prefer.");
  }

  let output: string;
  try {
    output = truncateOutput(await tool.run(use.input, { cwd: deps.cwd }));
  } catch (e) {
    return fail(formatToolError(e));
  }

  const post = await runHooks(
    deps.hooks,
    "PostToolUse",
    { tool_name: use.name, tool_input: use.input, tool_response: output },
    deps.cwd,
  );
  if (post.blocked) output += `\n[PostToolUse hook: ${post.message}]`;

  deps.onEvent({ type: "tool_result", name: use.name, content: output, isError: false });
  return { type: "tool_result", tool_use_id: use.id, content: output };
}
