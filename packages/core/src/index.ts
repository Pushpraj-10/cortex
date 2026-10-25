/**
 * @cortex/core — the small vocabulary every other package shares: Result and CortexError for
 * failures, the workspace sandbox check, and the Logger interface. It depends on no other
 * `@cortex/*` package and must stay that way.
 */

export { CortexError, err, ok, type Result } from "./result.js";
export { WorkspaceBoundaryError, resolveWorkspacePath } from "./workspace-path.js";
export type { Logger } from "./logger.js";
