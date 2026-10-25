export type HookEvent = "PreToolUse" | "PostToolUse" | "UserPromptSubmit" | "Stop";

export interface HookDef {
  event: HookEvent;
  /** Tool-name regex; only meaningful for Pre/PostToolUse. Omit to match all. */
  matcher?: string;
  command: string;
}

export interface HookOutcome {
  blocked: boolean;
  /** stderr of the blocking hook, fed back to the model. */
  message: string;
}
