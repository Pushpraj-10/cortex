import { createInterface } from "node:readline/promises";
import { runAgent } from "../agent/run-agent";
import { isPermissionMode } from "../permissions/is-permission-mode";
import { PERMISSION_MODES } from "../permissions/types";
import { bootstrap } from "./bootstrap";
import { parseArgs } from "./parse-args";
import { runRepl } from "./repl";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode !== undefined && !isPermissionMode(args.mode)) {
    throw new Error(`Unknown --mode ${args.mode}. Use one of: ${PERMISSION_MODES.join(", ")}`);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const harness = await bootstrap(process.cwd(), async (name, input) => {
    const answer = await rl.question(`\nAllow ${name} ${JSON.stringify(input).slice(0, 200)}? [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  });
  const mode = args.mode && isPermissionMode(args.mode) ? args.mode : harness.defaultMode;

  try {
    if (args.prompt) {
      const result = await runAgent([], args.prompt, harness.configure(mode));
      if (result.stopReason === "max_turns") console.error("Stopped: max turns reached");
    } else {
      await runRepl(harness, rl, mode);
    }
  } finally {
    rl.close();
    harness.close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
