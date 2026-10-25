import React, { useEffect, useMemo, useState } from "react";
import { Box, useApp, useInput } from "ink";
import type { AgentPolicy, AgentSession } from "@cortex/agent";
import { PERMISSION_MODES, type PermissionMode } from "@cortex/policy";

import { runSlashCommand, slashCommands, type CommandHost } from "./commands.js";
import { InputBox } from "./components/InputBox.js";
import { MessageList } from "./components/Messages.js";
import { PERMISSION_PROMPT_ROWS, PermissionPrompt, SETUP_PROMPT_ROWS, SetupPrompt } from "./components/Prompts.js";
import { SlashCommandMenu } from "./components/SlashCommandMenu.js";
import { StatusLine } from "./components/StatusLine.js";
import { ThinkingIndicator } from "./components/ThinkingIndicator.js";
import { summarizeToolCall } from "../format/tool-calls.js";
import { useChat } from "./hooks/useChat.js";
import { useInputHistory } from "./hooks/useInputHistory.js";
import { useProviderSetup } from "./hooks/useProviderSetup.js";
import { useTextInput } from "./hooks/useTextInput.js";
import { useAltScreen, useTerminalSize } from "./hooks/terminal.js";
import { slashMenuRows, transcriptRows } from "./layout.js";
import type { PermissionBridge } from "../runtime/permission-bridge.js";
import type { ProviderManager } from "../provider/manager.js";
import type { SlashCommand } from "./types.js";

export interface AppProps {
  initialSession: AgentSession;
  /** A fresh conversation, for /clear. */
  newSession(): AgentSession;
  /** Shared with the agent: setting `policy.mode` changes what it may do on its next call. */
  policy: AgentPolicy;
  permissions: PermissionBridge;
  cwd: string;
  /** The active provider, its saved settings, and how to change them (the /provider command). */
  providers: ProviderManager;
}

export function App({ initialSession, newSession, policy, permissions, cwd, providers }: AppProps) {
  useAltScreen();
  const { exit } = useApp();
  const { rows } = useTerminalSize();

  const [session, setSession] = useState(initialSession);
  const chat = useChat(session, permissions);
  const input = useTextInput();
  const [mode, setModeState] = useState<PermissionMode>(policy.mode);
  const [submitted, setSubmitted] = useState<string[]>([]);
  const history = useInputHistory(submitted);
  const [slashIndex, setSlashIndex] = useState(0);
  const [active, setActive] = useState(providers.active());
  const setup = useProviderSetup(providers, chat.notify, setActive);

  // While /provider is asking for an answer, what is typed is that answer, not a message or a command.
  const slashMenuOpen =
    setup.stage === "idle" && input.value.startsWith("/") && !input.value.includes("\n") && !input.value.slice(1).includes(" ");
  const filteredCommands = useMemo(() => {
    if (!slashMenuOpen) return [];
    const query = input.value.slice(1).toLowerCase();
    return slashCommands.filter((command) => command.name.toLowerCase().startsWith(query));
  }, [slashMenuOpen, input.value]);
  const clampedSlashIndex = Math.min(slashIndex, Math.max(0, filteredCommands.length - 1));

  useEffect(() => {
    setSlashIndex(0);
  }, [input.value]);

  useEffect(() => {
    if (!providers.active()) chat.notify("No model provider is configured yet. Type /provider to set one up (an API key, or a local Ollama model).");
    // once, at startup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setMode(next: PermissionMode) {
    policy.mode = next;
    setModeState(next);
  }

  function cycleMode() {
    setMode(PERMISSION_MODES[(PERMISSION_MODES.indexOf(mode) + 1) % PERMISSION_MODES.length]!);
  }

  const commandHost: CommandHost = {
    mode,
    model: active?.model ?? "none",
    provider: active?.provider ?? "not configured — type /provider",
    setMode,
    openProviderSetup: setup.begin,
    removeProvider: setup.remove,
    clear: () => {
      chat.reset();
      setSession(newSession());
    },
    quit: exit,
    notify: chat.notify,
  };

  function submit() {
    const text = input.value.trim();
    if (!text || chat.isThinking) return;

    input.set("", 0);
    history.reset();
    setSubmitted((previous) => [...previous, text]);

    if (runSlashCommand(text, commandHost)) return;
    void chat.submit(text);
  }

  function acceptSlashCommand(command: SlashCommand) {
    input.set(`/${command.name} `);
  }

  useInput(
    (typed, key) => {
      if (key.ctrl && typed === "c") {
        chat.cancel();
        exit();
        return;
      }
      if (key.ctrl && typed === "t") {
        chat.toggleLastToolCall();
        return;
      }

      // While the agent waits for approval, only the answer keys do anything.
      if (chat.pendingPermission) {
        const answer = typed.toLowerCase();
        if (key.return || answer === "y") chat.answerPermission(true);
        else if (key.escape || answer === "n") chat.answerPermission(false);
        return;
      }

      // /provider: the picker, then the questions. Answers bypass submit(), so they never reach the
      // transcript or the input history.
      if (setup.stage === "select") {
        if (key.upArrow) setup.move(-1);
        else if (key.downArrow) setup.move(1);
        else if (key.return || key.tab) setup.choose();
        else if (key.escape) setup.cancel();
        return;
      }
      if (setup.stage === "field") {
        if (key.return) {
          const answer = input.value;
          input.set("", 0);
          setup.submit(answer);
          return;
        }
        if (key.escape) {
          input.set("", 0);
          setup.cancel();
          return;
        }
        if (key.upArrow || key.downArrow || key.tab) return;
      }

      if (key.tab && key.shift) {
        cycleMode();
        return;
      }

      if (chat.isThinking) {
        if (key.escape) chat.cancel();
        return;
      }

      if (slashMenuOpen && filteredCommands.length > 0) {
        if (key.upArrow) {
          setSlashIndex((i) => Math.max(0, i - 1));
          return;
        }
        if (key.downArrow) {
          setSlashIndex((i) => Math.min(filteredCommands.length - 1, i + 1));
          return;
        }
        if (key.tab || key.return) {
          acceptSlashCommand(filteredCommands[clampedSlashIndex]!);
          return;
        }
        if (key.escape) {
          input.set("", 0);
          return;
        }
      }

      if (key.return) {
        if (key.shift || key.meta) input.insert("\n");
        else submit();
        return;
      }

      if (key.escape) return;

      if (key.backspace || key.delete) {
        input.deleteBackward();
        return;
      }
      if (key.upArrow) {
        input.set(history.up(input.value));
        return;
      }
      if (key.downArrow) {
        input.set(history.down());
        return;
      }
      if (key.leftArrow) {
        input.moveLeft();
        return;
      }
      if (key.rightArrow) {
        input.moveRight();
        return;
      }

      if (typed) input.insert(typed);
    },
    { isActive: process.stdin.isTTY === true },
  );

  const request = chat.pendingPermission;
  const showThinking = chat.isThinking && !request;
  const pickerOpen = setup.stage === "select";
  const listHeight = transcriptRows({
    rows,
    inputValue: input.value,
    thinking: showThinking,
    slashMenuRows: slashMenuRows(slashMenuOpen || pickerOpen, pickerOpen ? setup.menu.length : filteredCommands.length),
    promptRows: request ? PERMISSION_PROMPT_ROWS : setup.prompt ? SETUP_PROMPT_ROWS : 0,
  });

  return (
    <Box flexDirection="column" height={rows}>
      <MessageList cwd={cwd} height={listHeight} timeline={chat.timeline} expandedToolCallIds={chat.expandedToolCallIds} />
      {showThinking && <ThinkingIndicator active />}
      {request && <PermissionPrompt summary={summarizeToolCall(request.toolName, request.args)} />}
      {pickerOpen && <SlashCommandMenu commands={setup.menu} selectedIndex={setup.selectedIndex} prefix="" />}
      {setup.prompt && <SetupPrompt title={setup.prompt.title} label={setup.prompt.label} hint={setup.prompt.hint} error={setup.prompt.error} />}
      {slashMenuOpen && <SlashCommandMenu commands={filteredCommands} selectedIndex={clampedSlashIndex} />}
      <InputBox value={input.value} cursorOffset={input.cursorOffset} mask={setup.prompt?.secret === true} />
      <StatusLine model={active ? `${active.model} (${active.provider})` : "no provider"} mode={mode} cwd={cwd} />
    </Box>
  );
}
