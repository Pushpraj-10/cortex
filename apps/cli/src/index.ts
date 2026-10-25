#!/usr/bin/env -S npx tsx
import React from "react";
import { render } from "ink";
import { App } from "./App.js";
import { USAGE, parseArgs } from "./args.js";
import { bootstrap } from "./bootstrap.js";
import { loadDotEnv } from "./env.js";
import { runOnce } from "./run-once.js";

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
const { initialSession, newSession, policy, permissions, model, provider, close } = boot.value;

if (args.value.prompt !== undefined) {
  const exitCode = await runOnce(initialSession, args.value.prompt);
  close();
  process.exit(exitCode);
}

const app = render(React.createElement(App, { initialSession, newSession, policy, permissions, cwd, model, provider }));
await app.waitUntilExit();
close();
