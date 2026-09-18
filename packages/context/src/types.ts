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
}
