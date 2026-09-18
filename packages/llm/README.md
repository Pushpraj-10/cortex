# @cortex/llm

Provider-agnostic access to chat-completion models. Providers (Ollama, Claude,
OpenAI, Grok, ...) never appear as hardcoded branches in this package — each one
self-registers a `LLMProviderDescriptor` against the registry, and callers only ever
ask the registry for a provider by id. Adding a provider means writing a new
descriptor and registering it; it never means editing this package.

## API

- `ChatMessage`, `ChatRole`, `LLMRequest`, `LLMResponseChunk` — the wire-level shapes.
- `ToolSpec` — `{ name, description, parametersSchema }`, one tool a caller may offer
  the model. `ToolCall` — `{ toolName, args }`, one invocation the model asked for.
- `LLMRequest.tools?: ToolSpec[]` — tools offered to the model, when the caller wants
  native tool-calling. `ChatMessage.toolCalls?: ToolCall[]` — set on an assistant
  message that requested one or more calls; `content` may be `""` on such a message.
  Both are optional and provider-agnostic: a provider without native tool-calling
  support simply ignores `tools`, and never sets `toolCalls` on its responses — the
  caller (`@cortex/agent`'s loop) is the one place that decides what "no toolCalls"
  means (today: treat `content` as the final answer).
- `LLMClient` — `complete(request)` and `stream(request)`.
- `LLMProviderDescriptor` — `{ id, displayName, createClient(config) }`.
- `registerProvider(descriptor)` / `getProvider(id)` / `listProviders()`.

## Providers

- `src/providers/ollama` — `ollamaProviderDescriptor`, `createOllamaClient(config)`,
  config `{ model, baseUrl? }` (defaults to `http://localhost:11434`). Talks to
  Ollama's `/api/chat` over the global `fetch`; `stream()` parses its
  newline-delimited JSON response. Not registered automatically on import — the
  composition root calls `registerProvider(ollamaProviderDescriptor)` explicitly for
  whichever providers it wants active.
  - Maps `LLMRequest.tools` to Ollama's `{type:"function",function:{name,description,parameters}}`
    tool schema, and `ChatMessage.toolCalls` to/from Ollama's `tool_calls` shape, in
    `src/providers/ollama/internal/{toOllamaTools,toOllamaMessage,fromOllamaToolCalls}.ts`.
    A replayed conversation forwards an assistant message's `toolCalls` back to
    Ollama, not just the tool's result that follows it — Ollama expects the same
    OpenAI-style function-calling shape (assistant turn with `tool_calls`, then a
    `role:"tool"` result message). `complete()` only; `stream()`'s tool-call support
    is out of scope for now (nothing currently consumes a streamed tool call).
