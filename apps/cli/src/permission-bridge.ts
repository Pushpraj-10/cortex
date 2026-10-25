/**
 * The seam between the agent and the UI for approvals. The agent's policy asks `ask(...)` and waits;
 * the UI registers a handler with `onRequest` that shows a prompt and later calls `resolve`. With no
 * UI registered (e.g. between screens, or after unmount) a request is refused rather than left hanging.
 */

export interface PermissionRequest {
  toolName: string;
  args: unknown;
  /** Settles the pending `ask` promise: true to run the call, false to refuse it. */
  resolve(allowed: boolean): void;
}

export interface PermissionBridge {
  ask(toolName: string, args: unknown): Promise<boolean>;
  /** Registers the UI's handler; returns a function that unregisters it. */
  onRequest(handler: (request: PermissionRequest) => void): () => void;
}

export function createPermissionBridge(): PermissionBridge {
  let handler: ((request: PermissionRequest) => void) | null = null;

  return {
    ask(toolName, args) {
      return new Promise<boolean>((resolve) => {
        if (!handler) {
          resolve(false);
          return;
        }
        handler({ toolName, args, resolve });
      });
    },
    onRequest(next) {
      handler = next;
      return () => {
        if (handler === next) handler = null;
      };
    },
  };
}
