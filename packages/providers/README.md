# @cortex/providers

Provider-agnostic access to a chat model. Consumers depend on the `LLMProvider` contract and a registry; no provider name appears in a branch outside the composition root.

```ts
const provider = getLlmProvider("ollama").createClient({ model: "llama3.1" });
const reply = await provider.chat({ messages, tools, signal });   // Result<ChatMessage>
```

## Contract (`src/types.ts`)

- `ChatMessage` — `role`, `content`, optional `name` (tool results) and `toolCalls` (assistant requests)
- `ToolSpec` — a tool offered to the model: `name`, `description`, JSON-schema `parametersSchema`
- `LLMProvider` — `chat(request): Promise<Result<ChatMessage>>`; non-streaming; never throws for an expected failure
- `LLMProviderDescriptor<TConfig>` — `id`, `displayName`, `createClient(config)`

`registerLlmProvider(descriptor)` and `getLlmProvider(id)` (`src/registry.ts`) are filled once by the composition root. Providers do not register themselves.

## Providers

| File | Provider | Wire format notes |
| --- | --- | --- |
| `src/ollama.ts` | Ollama (local) | native `/api/chat`; tool-call arguments are objects |
| `src/groq.ts` | Groq (cloud) | OpenAI-compatible; arguments are JSON strings; calls and results need an id |
| `src/anthropic.ts` | Anthropic (cloud) | Messages API; system prompt is a top-level field; tool calls are content blocks; adjacent user turns are merged |

`ChatMessage` carries no tool-call id, so Groq and Anthropic derive `call_<toolName>`. That is safe because the agent runs one tool call per turn; the Anthropic client also sends `disable_parallel_tool_use` and returns only the first `tool_use`. `src/wire.ts` holds what the HTTP providers share: `ProviderRequestError` (code `LLM_<PROVIDER>_REQUEST_FAILED`), `postJson`, and the function-tool schema.

## Adding a provider

Create `src/<name>.ts` with the config interface, the request/response mapping, `create<Name>Client`, and a descriptor; export them from `src/index.ts`; register the descriptor in `apps/cli/src/bootstrap.ts` and add its env resolution to `apps/cli/src/provider-config.ts`. Test it like the others, by stubbing `fetch`.

Tests: `npm test -w @cortex/providers`.
