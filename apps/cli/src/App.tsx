import React, { useEffect, useMemo, useState } from "react";
import { Box, useApp, useInput } from "ink";
import type { AgentPolicy, AgentSession } from "@cortex/agent";
import { PERMISSION_MODES, type PermissionMode } from "@cortex/policy";

import { runSlashCommand, slashCommands, type CommandHost } from "./commands.js";
import { InputBox } from "./components/InputBox.js";
import { MessageList } from "./components/Messages.js";
import { PERMISSION_PROMPT_ROWS, PermissionPrompt } from "./components/PermissionPrompt.js";
import { SlashCommandMenu } from "./components/SlashCommandMenu.js";
import { StatusLine } from "./components/StatusLine.js";
import { ThinkingIndicator } from "./components/ThinkingIndicator.js";
import { summarizeToolCall } from "./format/tool-calls.js";
import { useChat } from "./hooks/useChat.js";
import { useInputHistory } from "./hooks/useInputHistory.js";
import { useTextInput } from "./hooks/useTextInput.js";
import { useAltScreen, useTerminalSize } from "./hooks/terminal.js";
import { slashMenuRows, transcriptRows } from "./layout.js";
import type { PermissionBridge } from "./permission-bridge.js";
import type { SlashCommand } from "./types.js";

export interface AppProps {
  initialSession: AgentSession;
  /** A fresh conversation, for /clear. */
  newSession(): AgentSession;
  /** Shared with the agent: setting `policy.mode` changes what it may do on its next call. */
  policy: AgentPolicy;
  permissions: PermissionBridge;
  cwd: string;
  model: string;
  provider: string;
}

export function App({ initialSession, newSession, policy, permissions, cwd, model, provider }: AppProps) {
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

  const slashMenuOpen = input.value.startsWith("/") && !input.value.includes("\n") && !input.value.slice(1).includes(" ");
  const filteredCommands = useMemo(() => {
    if (!slashMenuOpen) return [];
    const query = input.value.slice(1).toLowerCase();
    return slashCommands.filter((command) => command.name.toLowerCase().startsWith(query));
  }, [slashMenuOpen, input.value]);
  const clampedSlashIndex = Math.min(slashIndex, Math.max(0, filteredCommands.length - 1));

  useEffect(() => {
    setSlashIndex(0);
  }, [input.value]);

  function setMode(next: PermissionMode) {
    policy.mode = next;
    setModeState(next);
  }

  function cycleMode() {
    setMode(PERMISSION_MODES[(PERMISSION_MODES.indexOf(mode) + 1) % PERMISSION_MODES.length]!);
  }

  const commandHost: CommandHost = {
    mode,
    model,
    provider,
    setMode,
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
  const listHeight = transcriptRows({
    rows,
    inputValue: input.value,
    thinking: showThinking,
    slashMenuRows: slashMenuRows(slashMenuOpen, filteredCommands.length),
    promptRows: request ? PERMISSION_PROMPT_ROWS : 0,
  });

  return (
    <Box flexDirection="column" height={rows}>
      <MessageList cwd={cwd} height={listHeight} timeline={chat.timeline} expandedToolCallIds={chat.expandedToolCallIds} />
      {showThinking && <ThinkingIndicator active />}
      {request && <PermissionPrompt summary={summarizeToolCall(request.toolName, request.args)} />}
      {slashMenuOpen && <SlashCommandMenu commands={filteredCommands} selectedIndex={clampedSlashIndex} />}
      <InputBox value={input.value} cursorOffset={input.cursorOffset} />
      <StatusLine model={`${model} (${provider})`} mode={mode} cwd={cwd} />
    </Box>
  );
}
