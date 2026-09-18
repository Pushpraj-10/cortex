import type { Result } from "@cortex/shared";
import type { ContextFragment, ContextRequest } from "../types.js";

/** Base interface for context providers. Concrete providers (workspace overview, semantic search, ...) implement this. */
export interface ContextProvider {
  id: string;
  displayName: string;
  gather(request: ContextRequest): Promise<Result<ContextFragment[]>>;
}
