// Mirrors the exact literal runToolLoop yields on a failed LLM request
// (packages/agent/src/core/tool-loop.ts: `LLM request failed: ${result.error.message}`).
// AgentEvent's shape can't change to carry a proper error variant without touching an
// already-tested package's public contract, so this string match is the deliberate,
// documented alternative — kept as a named constant so the coupling is explicit and
// grep-able rather than an inline magic string.
export const LLM_FAILURE_PREFIX = "LLM request failed: ";

/** True for the one message runToolLoop yields when the underlying LLM request fails. */
export function isLlmFailureMessage(content: string): boolean {
  return content.startsWith(LLM_FAILURE_PREFIX);
}
