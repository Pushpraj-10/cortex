/**
 * @cortex/shared — cross-cutting types and helpers used by every other package.
 * This package must not depend on any other `@cortex/*` package.
 */
import path from "node:path";

export type Result<T, E = CortexError> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E extends CortexError = CortexError>(error: E): Result<never, E> {
  return { ok: false, error };
}

export class CortexError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/** Minimal console-backed logger; adapters can swap this for something richer. */
export function createLogger(scope: string): Logger {
  const emit = (level: LogLevel, message: string, meta?: Record<string, unknown>) => {
    const line = `[${scope}] ${message}`;
    meta ? console[level](line, meta) : console[level](line);
  };
  return {
    debug: (message, meta) => emit("debug", message, meta),
    info: (message, meta) => emit("info", message, meta),
    warn: (message, meta) => emit("warn", message, meta),
    error: (message, meta) => emit("error", message, meta),
  };
}

export function generateId(): string {
  return crypto.randomUUID();
}

export class WorkspaceBoundaryError extends CortexError {
  constructor(requestedPath: string) {
    super(
      `Path "${requestedPath}" escapes the workspace root — paths must be relative ` +
        `to the workspace root (e.g. "folder/example.ext"), never absolute and never ` +
        `starting with "/"`,
      "WORKSPACE_PATH_ESCAPE",
    );
  }
}

/**
 * Resolves `relativePath` against `root` and rejects any result that escapes it,
 * so every filesystem-touching adapter (Repository, filesystem tools, ...) enforces
 * the same workspace boundary instead of each reimplementing the check.
 */
export function resolveWorkspacePath(root: string, relativePath: string): string {
  // Absolute paths are rejected even when they happen to point inside the root.
  // Allowing "inside" ones made the contract inconsistent: the same mistake
  // produced a boundary error, an ENOENT, or a silent success depending on the
  // exact spelling, which gave a model no repeatable signal to correct against.
  if (path.isAbsolute(relativePath) || relativePath.startsWith("/") || relativePath.startsWith("\\")) {
    throw new WorkspaceBoundaryError(relativePath);
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) {
    throw new WorkspaceBoundaryError(relativePath);
  }
  return resolved;
}
