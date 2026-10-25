// What a tool is. Tools know nothing about the model, permissions or the loop.

export interface ToolContext {
  cwd: string;
}

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Read-only tools never need approval and are allowed in plan mode. */
  readOnly: boolean;
  /** Throw to report failure; the loop turns the message into an error result for the model. */
  run(input: Record<string, unknown>, ctx: ToolContext): Promise<string>;
}
