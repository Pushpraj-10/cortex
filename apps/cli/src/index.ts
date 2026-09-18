#!/usr/bin/env -S npx tsx
import React from "react";
import { render } from "ink";
import { App } from "./App.js";
import { loadDotEnv, registerFileSystemTools, registerLlmProviders, createCliAgentSession } from "./wiring/index.js";

loadDotEnv();
registerFileSystemTools();
registerLlmProviders();

const cwd = process.cwd();
const result = createCliAgentSession(cwd);

if (!result.ok) {
  console.error(`Cortex failed to start: ${result.error.message}`);
  process.exit(1);
}

render(React.createElement(App, { session: result.value.session, cwd, model: result.value.model }));
