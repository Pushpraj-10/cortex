/**
 * The composition root: the one place that knows about every package and wires them together.
 * It picks the LLM provider, registers providers, tools and context providers, loads settings,
 * memory, skills, saved provider settings and MCP servers, builds the approval policy, and hands back sessions.
 * Everything else in the CLI talks to the agent through what this returns.
 */
import {
  createAgentSession,
  createTaskTool,
  createToolsExecutor,
  type AgentPolicy,
  type AgentSession,
} from "@cortex/agent";
import { loadCredentials, loadMemory, loadSettings } from "@cortex/config";
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
  googleProviderDescriptor,
  ollamaProviderDescriptor,
  registerLlmProvider,
} from "@cortex/providers";
import { builtinTools, registerTool } from "@cortex/tools";
import { createPermissionBridge, type PermissionBridge } from "./permission-bridge.js";
import { credentialsToEnv, layerEnv, selectProvider } from "../provider/config.js";
import { createProviderManager, type ProviderManager } from "../provider/manager.js";

export interface BootOptions {
  cwd: string;
  /** From `--mode`; overrides the `defaultMode` in settings. */
  mode?: PermissionMode;
  /** False for `-p` runs, where no one can answer an approval prompt or set up a provider. */
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
  /** The active provider and its saved settings; the UI's /provider command changes them. */
  providers: ProviderManager;
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

  let settings: Awaited<ReturnType<typeof loadSettings>>;
  let memory: string;
  let skills: Awaited<ReturnType<typeof loadSkills>>;
  let credentials: Awaited<ReturnType<typeof loadCredentials>>;
  try {
    settings = await loadSettings(cwd, options.home);
    memory = await loadMemory(cwd, options.home);
    skills = await loadSkills(cwd, options.home);
    credentials = await loadCredentials(options.home);
  } catch (error) {
    return err(new CortexError(error instanceof Error ? error.message : String(error), "CLI_BOOTSTRAP_FAILED", error));
  }

  // Saved provider settings sit under the real environment, which wins when both are set.
  const realEnv = options.env ?? process.env;
  const choice = selectProvider(layerEnv(credentialsToEnv(credentials), realEnv));
  // Nothing configured yet is not fatal in the UI — the user fixes it with /provider. A non-interactive run,
  // or a CORTEX_PROVIDER that names no provider, cannot be fixed from here and still fails.
  if (!choice.ok && !(options.interactive && choice.error.code.startsWith("CLI_MISSING_"))) return choice;

  for (const descriptor of [ollamaProviderDescriptor, googleProviderDescriptor, anthropicProviderDescriptor]) {
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

  // Everything below talks to the manager's client, which delegates to whichever provider is active,
  // so /provider can switch providers without rebuilding sessions or the task tool.
  const providers = createProviderManager({ env: realEnv, home: options.home, initial: choice.ok ? choice.value : undefined });
  const llm = providers.llm;
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
    providers,
    close: () => connections.forEach((connection) => connection.close()),
  });
}
