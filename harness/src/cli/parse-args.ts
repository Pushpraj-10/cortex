export interface CliArgs {
  /** `--mode <name>`; validated by the caller. */
  mode?: string;
  /** `-p <prompt>`: run once and exit instead of starting the REPL. */
  prompt?: string;
}

export function parseArgs(argv: string[]): CliArgs {
  const valueOf = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return { mode: valueOf("--mode"), prompt: valueOf("-p") };
}
