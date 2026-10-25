/**
 * Contracts shared by every context provider: what a request carries, what a fragment is, and what a provider must implement.
 */
import type { Result } from "@cortex/core";

// ---- Request and fragment shapes ----

export interface ContextRequest {
  workspaceRoot: string;
  /** The user's current message — the seam a future semantic-search provider queries against. */
  userMessage: string;
  signal?: AbortSignal;
}

/** One discrete piece of context a provider contributes. */
export interface ContextFragment {
  /** id of the provider that produced this fragment. */
  providerId: string;
  /** Rendered as a heading in the assembled block. */
  title: string;
  content: string;
  /**
   * How relevant this fragment is to the current request, 0..1 (default 0). Fragments
   * render highest first, and the lowest are the first to be dropped when the block
   * exceeds its size budget.
   */
  relevance?: number;
}

// ---- The provider contract ----

/** Base interface for context providers. Concrete providers (workspace overview, mentioned files, ...) implement this. */
export interface ContextProvider {
  id: string;
  /**
   * Whether this provider has anything to say for this request, decided from concrete
   * signals in it (e.g. the message names a file). Omit to always apply. A provider
   * that doesn't apply is skipped before any IO happens in `gather`.
   */
  applies?(request: ContextRequest): boolean | Promise<boolean>;
  gather(request: ContextRequest): Promise<Result<ContextFragment[]>>;
}
