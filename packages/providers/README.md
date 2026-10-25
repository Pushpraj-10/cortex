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
| `src/google.ts` | Google Gemini (cloud) | native `generateContent`; system prompt is `systemInstruction`; assistant role is `model`; calls and results are `functionCall` / `functionResponse` parts matched by tool name (no ids); results must be objects; schema keywords Gemini rejects are stripped |
| `src/anthropic.ts` | Anthropic (cloud) | Messages API; system prompt is a top-level field; tool calls are content blocks; adjacent user turns are merged |

`ChatMessage` carries no tool-call id. Anthropic derives `call_<toolName>` (safe because the agent runs one tool call per turn) and also sends `disable_parallel_tool_use`; Google needs no ids. Both return only the first tool call. `src/wire.ts` holds what the HTTP providers share: `ProviderRequestError` (code `LLM_<PROVIDER>_REQUEST_FAILED`) and `postJson`.

## Adding a provider

Create `src/<name>.ts` with the config interface, the request/response mapping, `create<Name>Client`, and a descriptor; export them from `src/index.ts`; register the descriptor in `apps/cli/src/runtime/bootstrap.ts` and add its env resolution to `apps/cli/src/provider/config.ts`. Test it like the others, by stubbing `fetch`.

Tests: `npm test -w @cortex/providers`.
