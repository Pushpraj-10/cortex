/**
 * The vocabulary every package shares for things that can fail: a typed error that carries a stable
 * `code`, and a `Result` that returns it instead of throwing. Expected failures (a missing file, a
 * model that is down) are returned; throwing is for programmer errors.
 */

export type Result<T, E = CortexError> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E extends CortexError = CortexError>(error: E): Result<never, E> {
  return { ok: false, error };
}

/** Base class for every error this codebase raises. Subclasses get their own class name as `name`. */
export class CortexError extends Error {
  constructor(
    message: string,
    /** Stable, machine-readable identifier (e.g. "TOOL_FAILED"); never shown as prose. */
    readonly code: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
