#!/usr/bin/env -S npx tsx
import React from "react";
import { render } from "ink";
import { appendHistory, loadHistory, loadPreferences, savePreferences } from "@cortex/config";
import { App } from "./ui/App.js";
import { USAGE, parseArgs } from "./cli/args.js";
import { bootstrap } from "./runtime/bootstrap.js";
import { listWorkspaceFiles } from "./runtime/workspace-files.js";
import { loadDotEnv } from "./cli/env.js";
import { runOnce } from "./cli/run-once.js";
import { askToTrust } from "./cli/trust-prompt.js";
import { readGitBranch } from "./cli/git-branch.js";
import { readVersion } from "./cli/version.js";
import { farewell } from "./cli/farewell.js";
import { enterAltScreen, leaveAltScreen } from "./ui/hooks/terminal.js";

const args = parseArgs(process.argv.slice(2));
if (!args.ok) {
  console.error(`${args.error.message}\n\n${USAGE}`);
  process.exit(2);
}
if (args.value.help) {
  console.log(USAGE);
  process.exit(0);
}

const refusedFromDotEnv = loadDotEnv();
if (refusedFromDotEnv.length > 0) {
  console.error(
    `Ignored ${refusedFromDotEnv.join(", ")} from .env: a project's .env can set Cortex's provider, models and API keys, but not server URLs. ` +
      `Set those in your shell, or use /provider.`,
  );
}

const cwd = process.cwd();
const interactive = args.value.prompt === undefined;
const boot = await bootstrap({
  cwd,
  mode: args.value.mode,
  agent: args.value.agent,
  interactive,
  trustProject: args.value.trustProject,
  // Only with a terminal to ask on; without one, a project's own hooks, MCP servers and allow rules are left out.
  confirmTrust: interactive && process.stdin.isTTY ? (request) => askToTrust(request, { input: process.stdin, output: process.stdout }) : undefined,
});
if (!boot.ok) {
  console.error(`Cortex failed to start: ${boot.error.message}`);
  process.exit(1);
}
const { initialSession, newSession, policy, permissions, providers, close } = boot.value;

if (args.value.prompt !== undefined) {
  const exitCode = await runOnce(initialSession, args.value.prompt);
  close();
  process.exit(exitCode);
}

const [preferences, initialHistory] = await Promise.all([loadPreferences(), loadHistory(cwd)]);
enterAltScreen();
const app = render(
  React.createElement(App, {
    initialSession,
    newSession,
    policy,
    permissions,
    cwd,
    providers,
    version: readVersion(),
    readBranch: () => readGitBranch(cwd),
    listFiles: () => listWorkspaceFiles(cwd),
    initialHistory,
    // A message that can't be remembered is not worth interrupting the session for.
    onHistoryAdd: (text) => void appendHistory(cwd, text).catch(() => undefined),
    initialTheme: preferences.theme,
    // A theme that can't be remembered is not worth interrupting the session for.
    onThemeChange: (theme) => void savePreferences({ theme }).catch(() => undefined),
  }),
);
await app.waitUntilExit();
await leaveAltScreen();
close();
console.log(`\n${farewell()}\n`);
