/**
 * Mounts the whole `App` in a fake terminal with a fake keyboard, so a test can type, press keys and read the screen the way
 * a person would. The agent session and the provider manager are stand-ins that record what they are given: what was sent
 * to the model, which messages the app asked to remember, and what `/provider` saved.
 */
import React from "react";
import { PassThrough } from "node:stream";
import { render } from "ink";
import { vi } from "vitest";
import { ok } from "@cortex/core";
import type { AgentPolicy, AgentSession } from "@cortex/agent";
import { createPermissionBridge } from "../../../src/runtime/permission-bridge.js";
import { PROVIDER_IDS } from "../../../src/provider/config.js";
import type { ProviderManager } from "../../../src/provider/manager.js";
import { App, type AppProps } from "../../../src/ui/App.js";
import { settle } from "./render-frame.js";

const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g;

/** What a terminal sends for the keys the tests press. */
export const KEY = {
  enter: "\r",
  tab: "\t",
  escape: "\u001b",
  backspace: "\u007f",
  up: "\u001b[A",
  down: "\u001b[B",
  right: "\u001b[C",
  left: "\u001b[D",
  home: "\u001b[H",
  end: "\u001b[F",
  ctrlA: "\u0001",
  ctrlE: "\u0005",
  ctrlK: "\u000b",
  ctrlR: "\u0012",
  ctrlU: "\u0015",
  ctrlW: "\u0017",
  altLeft: "\u001b[1;3D",
  altBackspace: "\u001b\u007f",
} as const;

export interface DrivenApp {
  /** Types text one character at a time, as a person does. */
  type(text: string): Promise<void>;
  /** Sends one key (or a whole chunk, like a paste) and lets the screen update. */
  press(sequence: string): Promise<void>;
  /** The screen as plain text, as of the last update. */
  screen(): string;
  /** What reached the agent, in order. */
  sent: string[];
  /** Every message the app asked to have remembered. */
  remembered: string[];
  /** Every `/provider` save: which provider, with which values. */
  configured: { provider: string; values: Record<string, string | undefined> }[];
  /** How many `resize` listeners the app has on the terminal; Node warns past ten. */
  resizeListeners(): number;
  unmount(): Promise<void>;
}

export interface DriveOptions extends Partial<AppProps> {
  columns?: number;
  rows?: number;
}

export async function driveApp(options: DriveOptions = {}): Promise<DrivenApp> {
  const { columns = 100, rows = 40, ...props } = options;

  // The app switches to the alternate screen by writing to the real stdout; keep that out of the test output.
  const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

  const stdout = new PassThrough() as PassThrough & { columns: number; rows: number; isTTY: boolean };
  stdout.columns = columns;
  stdout.rows = rows;
  stdout.isTTY = false;
  const frames: string[] = [];
  stdout.on("data", (chunk) => frames.push(chunk.toString()));

  const stdin = new PassThrough() as PassThrough & { isTTY: boolean; setRawMode(mode: boolean): unknown; ref(): unknown; unref(): unknown };
  stdin.isTTY = true;
  stdin.setRawMode = () => stdin;
  stdin.ref = () => stdin;
  stdin.unref = () => stdin;

  const sent: string[] = [];
  const remembered: string[] = [];
  const configured: DrivenApp["configured"] = [];

  const session: AgentSession = {
    // eslint-disable-next-line require-yield
    async *chat(text) {
      sent.push(text);
    },
  };

  let active: ReturnType<ProviderManager["active"]> = { provider: "ollama", model: "llama3" };
  const providers: ProviderManager = {
    llm: { chat: async () => Promise.reject(new Error("the model is not used in these tests")) } as unknown as ProviderManager["llm"],
    active: () => active,
    status: async () => PROVIDER_IDS.map((id) => ({ id, active: id === active?.provider, configured: true, needsKey: id !== "ollama", hasKey: false })),
    saved: async () => ({}),
    configure: async (provider, values) => {
      configured.push({ provider, values: { ...values } });
      active = { provider, model: values.model ?? "model" };
      return ok({ ...active, savedTo: "the credentials file", overriddenBy: [] });
    },
    remove: async () => ok({ removed: false }),
  };

  const policy: AgentPolicy = { mode: "default", rules: { allow: [], deny: [] }, hooks: [], askPermission: async () => false };

  const app = render(
    <App
      initialSession={session}
      newSession={() => session}
      policy={policy}
      permissions={createPermissionBridge()}
      cwd="D:\\proj\\demo"
      providers={providers}
      version="0.0.0-test"
      listFiles={async () => ["README.md", "package.json", "src/index.ts", "src/ui/App.tsx", "src/ui/components/InputBox.tsx"]}
      onHistoryAdd={(text) => remembered.push(text)}
      {...props}
    />,
    {
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
      debug: true,
      patchConsole: false,
      exitOnCtrlC: false,
    },
  );
  await settle();

  const press = async (sequence: string) => {
    stdin.write(sequence);
    await settle();
  };

  return {
    press,
    async type(text) {
      for (const character of text) await press(character);
    },
    screen: () => (frames[frames.length - 1] ?? "").replace(ANSI, "").replace(/\n+$/, ""),
    sent,
    remembered,
    configured,
    resizeListeners: () => stdout.listenerCount("resize"),
    unmount: async () => {
      app.unmount();
      await settle(); // React runs the screen-restoring cleanup a moment later; it must still hit the spy
      stdoutWrite.mockRestore();
    },
  };
}
