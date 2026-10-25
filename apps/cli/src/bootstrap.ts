/**
 * The composition root: the one place that knows about every package and wires them together.
 * It picks the LLM provider, registers providers, tools and context providers, loads settings,
 * memory, skills and MCP servers, builds the approval policy, and hands back sessions.
 * Everything else in the CLI talks to the agent through what this returns.
 */
import {
  createAgentSession,
  createTaskTool,
  createToolsExecutor,
  type AgentPolicy,
  type AgentSession,
} from "@cortex/agent";
import { loadMemory, loadSettings } from "@cortex/config";
import {
  dependentsProvider,
  mentionedFilesProvider,
  registerContextProvider,
  relatedFilesProvider,
  workspaceOverviewProvider,
} from "@cortex/context";
import { CortexError, err, ok, type Result } from "@cortex/core";
import { connectMcpServer, createSkillTool, loadSkills, renderSkillIndex, type McpConnection } from "@cortex/extensions";
import type { PermissionMode } from "@cortex/policy";
import {
  anthropicProviderDescriptor,
  getLlmProvider,
  groqProviderDescriptor,
  ollamaProviderDescriptor,
  registerLlmProvider,
} from "@cortex/providers";
import { builtinTools, registerTool } from "@cortex/tools";
import { createPermissionBridge, type PermissionBridge } from "./permission-bridge.js";
import { selectProvider, type ProviderId } from "./provider-config.js";

export interface BootOptions {
  cwd: string;
  /** From `--mode`; overrides the `defaultMode` in settings. */
  mode?: PermissionMode;
  /** False for `-p` runs, where no one can answer an approval prompt. */
  interactive: boolean;
  /** Defaults to process.env. */
  env?: NodeJS.ProcessEnv;
  /** Where the user-level `.cortex` folder lives. Defaults to the home directory. */
  home?: string;
}

export interface Boot {
  initialSession: AgentSession;
  /** A fresh conversation (used by /clear). */
  newSession(): AgentSession;
  /** Shared with the executor and sessions; the UI changes `policy.mode` to switch modes. */
  policy: AgentPolicy;
  /** How the agent asks the UI for approval. */
  permissions: PermissionBridge;
  model: string;
  provider: ProviderId;
  /** Stops MCP servers. */
  close(): void;
}

/** In a non-interactive run nobody can approve a call, so one that needs approval is refused, with a way to pre-approve it. */
async function refuseNonInteractively(toolName: string): Promise<boolean> {
  console.error(
    `Refused ${toolName}: this run is non-interactive. Pre-approve with --mode acceptEdits or bypassPermissions, or add an allow rule to .cortex/settings.json.`,
  );
  return false;
}

/** Registers everything, loads configuration, and builds the agent stack. Call once per process. */
export async function bootstrap(options: BootOptions): Promise<Result<Boot>> {
  const { cwd } = options;

  const choice = selectProvider(options.env);
  if (!choice.ok) return choice;

  let settings: Awaited<ReturnType<typeof loadSettings>>;
  let memory: string;
  let skills: Awaited<ReturnType<typeof loadSkills>>;
  try {
    settings = await loadSettings(cwd, options.home);
    memory = await loadMemory(cwd, options.home);
    skills = await loadSkills(cwd, options.home);
  } catch (error) {
    return err(new CortexError(error instanceof Error ? error.message : String(error), "CLI_BOOTSTRAP_FAILED", error));
  }

  for (const descriptor of [ollamaProviderDescriptor, groqProviderDescriptor, anthropicProviderDescriptor]) {
    registerLlmProvider(descriptor);
  }
  for (const tool of builtinTools) registerTool(tool);
  for (const provider of [workspaceOverviewProvider, mentionedFilesProvider, relatedFilesProvider, dependentsProvider]) {
    registerContextProvider(provider);
  }

  const connections: McpConnection[] = [];
  for (const [name, config] of Object.entries(settings.mcpServers)) {
    try {
      const connection = await connectMcpServer(name, config, cwd);
      connections.push(connection);
      for (const tool of connection.tools) registerTool(tool);
    } catch (error) {
      console.error(`MCP server "${name}" failed to start: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const permissions = createPermissionBridge();
  const policy: AgentPolicy = {
    mode: options.mode ?? settings.permissions.defaultMode ?? "default",
    rules: { allow: settings.permissions.allow, deny: settings.permissions.deny },
    hooks: settings.hooks,
    askPermission: options.interactive ? permissions.ask : refuseNonInteractively,
  };

  const llm = getLlmProvider(choice.value.id).createClient(choice.value.config);
  const executor = createToolsExecutor(cwd, policy);
  registerTool(createTaskTool({ llm, executor, workspaceRoot: cwd }));
  if (skills.length > 0) registerTool(createSkillTool(skills));

  const skillIndex = renderSkillIndex(skills);
  const newSession = () =>
    createAgentSession({
      llm,
      executor,
      workspaceRoot: cwd,
      policy,
      memory: memory || undefined,
      skillIndex: skillIndex || undefined,
    });

  return ok({
    initialSession: newSession(),
    newSession,
    policy,
    permissions,
    model: choice.value.model,
    provider: choice.value.id,
    close: () => connections.forEach((connection) => connection.close()),
  });
}
