import { ok, type Result } from "@cortex/shared";
import { getProvider } from "@cortex/llm";
import { createAgentSession, createToolsExecutor, type AgentSession } from "@cortex/agent";
import { resolveOllamaConfig } from "./resolve-ollama-config.js";

export interface CliAgentSession {
  session: AgentSession;
  model: string;
}

/**
 * Builds the AgentSession this CLI drives: an Ollama-backed LLMProvider (via the
 * registry, not createOllamaClient directly, so this stays provider-agnostic) plus a
 * tools executor scoped to `cwd`. Assumes registerLlmProviders()/registerFileSystemTools()
 * have already run.
 */
export function createCliAgentSession(cwd: string): Result<CliAgentSession> {
  const configResult = resolveOllamaConfig();
  if (!configResult.ok) return configResult;

  const llm = getProvider("ollama").createClient(configResult.value);
  const executor = createToolsExecutor(cwd);
  const session = createAgentSession({ llm, executor, workspaceRoot: cwd });

  return ok({ session, model: configResult.value.model });
}
