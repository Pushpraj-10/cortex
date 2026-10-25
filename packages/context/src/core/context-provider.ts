import type { Result } from "@cortex/core";
import type { ContextFragment, ContextRequest } from "../types.js";

/** Base interface for context providers. Concrete providers (workspace overview, mentioned files, ...) implement this. */
export interface ContextProvider {
  id: string;
  displayName: string;
  /**
   * Whether this provider has anything to say for this request, decided from concrete
   * signals in it (e.g. the message names a file). Omit to always apply. A provider
   * that doesn't apply is skipped before any IO happens in `gather`.
   */
  applies?(request: ContextRequest): boolean | Promise<boolean>;
  gather(request: ContextRequest): Promise<Result<ContextFragment[]>>;
}
