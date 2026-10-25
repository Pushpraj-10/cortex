#!/usr/bin/env -S npx tsx
import React from "react";
import { render } from "ink";
import { loadPreferences, savePreferences } from "@cortex/config";
import { App } from "./ui/App.js";
import { USAGE, parseArgs } from "./cli/args.js";
import { bootstrap } from "./runtime/bootstrap.js";
import { listWorkspaceFiles } from "./runtime/workspace-files.js";
import { loadDotEnv } from "./cli/env.js";
import { runOnce } from "./cli/run-once.js";
import { readGitBranch } from "./cli/git-branch.js";
import { readVersion } from "./cli/version.js";

const args = parseArgs(process.argv.slice(2));
if (!args.ok) {
  console.error(`${args.error.message}\n\n${USAGE}`);
  process.exit(2);
}
if (args.value.help) {
  console.log(USAGE);
  process.exit(0);
}

loadDotEnv();

const cwd = process.cwd();
const boot = await bootstrap({ cwd, mode: args.value.mode, interactive: args.value.prompt === undefined });
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

const preferences = await loadPreferences();
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
    initialTheme: preferences.theme,
    // A theme that can't be remembered is not worth interrupting the session for.
    onThemeChange: (theme) => void savePreferences({ theme }).catch(() => undefined),
  }),
);
await app.waitUntilExit();
close();
