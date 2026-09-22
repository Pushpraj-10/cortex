import { ok, type Result } from "@cortex/shared";
import { getProvider } from "@cortex/llm";
import { createAgentSession, createToolsExecutor, type AgentSession } from "@cortex/agent";
import { resolveOllamaConfig } from "./resolve-ollama-config.js";
import { resolveGroqConfig } from "./resolve-groq-config.js";

export interface CliAgentSession {
  session: AgentSession;
  model: string;
  provider: string;
}

/**
 * Builds the AgentSession this CLI drives: an LLMProvider (via the registry, not a
 * concrete client constructor, so this stays provider-agnostic) plus a tools executor
 * scoped to `cwd`. Assumes registerLlmProviders()/registerFileSystemTools() have
 * already run.
 *
 * Provider choice: Groq when GROQ_API_KEY is set (cloud, for fast iteration), Ollama
 * otherwise (local, no key needed) — the CLI's one deliberate piece of provider
 * selection logic, kept here rather than in @cortex/llm so the library stays
 * mechanism-only.
 */
export function createCliAgentSession(cwd: string): Result<CliAgentSession> {
  if (process.env.GROQ_API_KEY) {
    const configResult = resolveGroqConfig();
    if (!configResult.ok) return configResult;

    const llm = getProvider("groq").createClient(configResult.value);
    const executor = createToolsExecutor(cwd);
    const session = createAgentSession({ llm, executor, workspaceRoot: cwd });

    return ok({ session, model: configResult.value.model, provider: "groq" });
  }

  const configResult = resolveOllamaConfig();
  if (!configResult.ok) return configResult;

  const llm = getProvider("ollama").createClient(configResult.value);
  const executor = createToolsExecutor(cwd);
  const session = createAgentSession({ llm, executor, workspaceRoot: cwd });

  return ok({ session, model: configResult.value.model, provider: "ollama" });
}
