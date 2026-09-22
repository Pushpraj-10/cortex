import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, useApp, useInput } from "ink";
import type { AgentSession } from "@cortex/agent";

import { MessageList } from "./components/MessageList.js";
import { InputBox } from "./components/InputBox.js";
import { StatusLine } from "./components/StatusLine.js";
import { ThinkingIndicator } from "./components/ThinkingIndicator.js";
import { SlashCommandMenu } from "./components/SlashCommandMenu.js";
import { useTerminalSize } from "./hooks/useTerminalSize.js";
import { useInputHistory } from "./hooks/useInputHistory.js";
import { useAltScreen } from "./hooks/useAltScreen.js";
import { mockHistory } from "./mock/mockHistory.js";
import { mockSlashCommands } from "./mock/mockSlashCommands.js";
import { maxInputBoxLines } from "./theme.js";
import { summarizeToolCall } from "./format/summarize-tool-call.js";
import { formatToolResultDetail } from "./format/format-tool-result-detail.js";
import { isLlmFailureMessage } from "./format/classify-agent-message.js";
import type { SlashCommand, TimelineEntry } from "./types.js";

export interface AppProps {
  session: AgentSession;
  cwd: string;
  model: string;
  provider: string;
}

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function App({ session, cwd, model, provider }: AppProps) {
  useAltScreen();
  const { exit } = useApp();
  const { rows } = useTerminalSize();

  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [value, setValue] = useState("");
  const [cursorOffset, setCursorOffset] = useState(0);
  const [isThinking, setIsThinking] = useState(false);
  const [expandedToolCallIds, setExpandedToolCallIds] = useState<Set<string>>(new Set());
  const [slashIndex, setSlashIndex] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const userCancelledRef = useRef(false);
  const history = useInputHistory(mockHistory);

  const slashMenuOpen = value.startsWith("/") && !value.includes("\n") && !value.slice(1).includes(" ");
  const filteredCommands = useMemo(() => {
    if (!slashMenuOpen) return [];
    const query = value.slice(1).toLowerCase();
    return mockSlashCommands.filter((command) => command.name.toLowerCase().startsWith(query));
  }, [slashMenuOpen, value]);
  const clampedSlashIndex = Math.min(slashIndex, Math.max(0, filteredCommands.length - 1));

  useEffect(() => {
    setSlashIndex(0);
  }, [value]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  function setValueAndCursor(next: string, cursor?: number) {
    setValue(next);
    setCursorOffset(cursor ?? next.length);
  }

  function insertText(text: string) {
    const nextValue = value.slice(0, cursorOffset) + text + value.slice(cursorOffset);
    setValue(nextValue);
    setCursorOffset(cursorOffset + text.length);
  }

  function deleteBackward() {
    if (cursorOffset === 0) return;
    setValue(value.slice(0, cursorOffset - 1) + value.slice(cursorOffset));
    setCursorOffset(cursorOffset - 1);
  }

  async function submit() {
    const trimmed = value.trim();
    if (!trimmed || isThinking) return;

    setTimeline((prev) => [...prev, { kind: "message", id: nextId("user"), role: "user", content: trimmed }]);
    setValueAndCursor("", 0);
    history.reset();
    setIsThinking(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    userCancelledRef.current = false;

    let pendingToolEntryId: string | null = null;

    try {
      for await (const event of session.chat(trimmed, controller.signal)) {
        if (event.type === "toolCall") {
          const id = nextId("tool");
          pendingToolEntryId = id;
          setTimeline((prev) => [
            ...prev,
            { kind: "toolCall", id, summary: summarizeToolCall(event.toolName, event.args), detail: "Running…" },
          ]);
        } else if (event.type === "toolResult") {
          const id = pendingToolEntryId;
          pendingToolEntryId = null;
          const detail = formatToolResultDetail(event.output);
          setTimeline((prev) =>
            prev.map((entry) => (entry.kind === "toolCall" && entry.id === id ? { ...entry, detail } : entry)),
          );
        } else {
          if (userCancelledRef.current) continue;
          setTimeline((prev) => [
            ...prev,
            {
              kind: "message",
              id: nextId("assistant"),
              role: "assistant",
              content: event.content,
              isError: isLlmFailureMessage(event.content),
            },
          ]);
        }
      }
    } finally {
      setIsThinking(false);
      abortControllerRef.current = null;
    }
  }

  function cancelThinking() {
    userCancelledRef.current = true;
    abortControllerRef.current?.abort();
  }

  function acceptSlashCommand(command: SlashCommand) {
    const next = `/${command.name} `;
    setValueAndCursor(next, next.length);
  }

  function toggleLastToolCall() {
    const lastToolCall = [...timeline].reverse().find((entry) => entry.kind === "toolCall");
    if (!lastToolCall) return;
    setExpandedToolCallIds((prev) => {
      const next = new Set(prev);
      if (next.has(lastToolCall.id)) next.delete(lastToolCall.id);
      else next.add(lastToolCall.id);
      return next;
    });
  }

  useInput(
    (input, key) => {
      if (key.ctrl && input === "c") {
        exit();
        return;
      }
      if (key.ctrl && input === "t") {
        toggleLastToolCall();
        return;
      }

      if (isThinking) {
        if (key.escape) cancelThinking();
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
          setValueAndCursor("", 0);
          return;
        }
      }

      if (key.return) {
        if (key.shift || key.meta) insertText("\n");
        else void submit();
        return;
      }

      if (key.escape) return;

      if (key.backspace || key.delete) {
        deleteBackward();
        return;
      }
      if (key.upArrow) {
        setValueAndCursor(history.up(value));
        return;
      }
      if (key.downArrow) {
        setValueAndCursor(history.down());
        return;
      }
      if (key.leftArrow) {
        setCursorOffset((c) => Math.max(0, c - 1));
        return;
      }
      if (key.rightArrow) {
        setCursorOffset((c) => Math.min(value.length, c + 1));
        return;
      }

      if (input) insertText(input);
    },
    { isActive: process.stdin.isTTY === true },
  );

  const inputLines = Math.min(Math.max(1, value.split("\n").length), maxInputBoxLines);
  const inputBoxHeight = inputLines + 2;
  const thinkingHeight = isThinking ? 1 : 0;
  const slashMenuHeight = slashMenuOpen ? (filteredCommands.length > 0 ? filteredCommands.length : 1) + 2 : 0;
  const statusLineHeight = 1;
  const reserved = inputBoxHeight + thinkingHeight + slashMenuHeight + statusLineHeight;
  const messageListHeight = Math.max(3, rows - reserved);

  return (
    <Box flexDirection="column" height={rows}>
      <MessageList cwd={cwd} height={messageListHeight} timeline={timeline} expandedToolCallIds={expandedToolCallIds} />
      {isThinking && <ThinkingIndicator active={isThinking} />}
      {slashMenuOpen && <SlashCommandMenu commands={filteredCommands} selectedIndex={clampedSlashIndex} />}
      <InputBox value={value} cursorOffset={cursorOffset} />
      <StatusLine model={`${model} (${provider})`} cwd={cwd} />
    </Box>
  );
}
