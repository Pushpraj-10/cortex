import React, { useEffect, useMemo, useState } from "react";
import { homedir } from "node:os";
import { Box, useApp, useInput } from "ink";
import type { AgentPolicy, AgentSession } from "@cortex/agent";
import { PERMISSION_MODES, type PermissionMode } from "@cortex/policy";

import { HELP_TEXT, runSlashCommand, slashCommands, type CommandHost } from "./commands.js";
import { InputBox } from "./components/InputBox.js";
import { MessageList } from "./components/Messages.js";
import { PermissionPrompt, SETUP_PROMPT_ROWS, SetupPrompt, permissionPromptRows } from "./components/Prompts.js";
import { SlashCommandMenu } from "./components/SlashCommandMenu.js";
import { StatusLine } from "./components/StatusLine.js";
import { ThinkingIndicator } from "./components/ThinkingIndicator.js";
import { summarizeToolCall } from "../format/tool-calls.js";
import { useChat } from "./hooks/useChat.js";
import { useInputHistory } from "./hooks/useInputHistory.js";
import { useProviderSetup } from "./hooks/useProviderSetup.js";
import { activeMention, completeMention, rankFiles } from "../format/file-mentions.js";
import { editFor, mentionMenuAction, useHomeEnd, type EdgeKey } from "./hooks/keys.js";
import { useWorkspaceFiles } from "./hooks/useWorkspaceFiles.js";
import { continueLine, moveToLineEnd, moveToLineStart, moveVertical, normalizePaste, useTextInput } from "./hooks/useTextInput.js";
import { useAltScreen, useTerminalSize } from "./hooks/terminal.js";
import { slashMenuRows, transcriptRows } from "./layout.js";
import type { PermissionBridge } from "../runtime/permission-bridge.js";
import type { ProviderManager } from "../provider/manager.js";
import { tildify } from "../format/path.js";
import { useGitBranch } from "./hooks/useGitBranch.js";
import { pickPlaceholder } from "./theme/copy.js";
import { ThemeContext } from "./theme/ThemeContext.js";
import { getTheme, resolveThemeName, type ThemeName } from "./theme/themes.js";
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
  /** Shown in the header. */
  version: string;
  /** The saved theme name, if any; `NO_COLOR` overrides it. */
  initialTheme?: string;
  /** Called when /theme picks a theme, so the choice can be remembered. */
  onThemeChange?(theme: ThemeName): void;
  /** Finds the current git branch for the footer; called at startup and after each turn. Omit to show none. */
  readBranch?(): string | undefined;
  /** Lists the workspace's files (`/`-separated, relative) for the `@` menu; read when `@` is first typed. Omit to have no `@` menu. */
  listFiles?(): Promise<string[]>;
}

const noBranch = () => undefined;

export function App({ initialSession, newSession, policy, permissions, cwd, providers, version, initialTheme, onThemeChange, readBranch = noBranch, listFiles }: AppProps) {
  useAltScreen();
  const [themeName, setThemeName] = useState<ThemeName>(() => resolveThemeName(initialTheme, {}));
  const theme = getTheme(resolveThemeName(themeName));
  const { exit } = useApp();
  const { rows, columns } = useTerminalSize();

  const [session, setSession] = useState(initialSession);
  const chat = useChat(session, permissions, cwd);
  const placeholder = useMemo(() => pickPlaceholder(), []);
  const branch = useGitBranch(readBranch, chat.isThinking);
  const shownCwd = useMemo(() => tildify(cwd, homedir()), [cwd]);
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

  // `@` + letters at the cursor opens a menu of files; accepting one types its plain path, which the agent's context
  // provider attaches to the turn. Esc closes it until the text changes.
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionDismissedAt, setMentionDismissedAt] = useState<string | null>(null);
  const mention = setup.stage === "idle" && !slashMenuOpen && !chat.isThinking ? activeMention(input.value, input.cursorOffset) : undefined;
  const workspaceFiles = useWorkspaceFiles(listFiles, mention !== undefined, chat.isThinking);
  const mentionQuery = mention?.query;
  const mentionHidden = mentionDismissedAt === input.value;
  const mentionMatches = useMemo(
    () => (mentionQuery === undefined || mentionHidden ? [] : rankFiles(workspaceFiles, mentionQuery)),
    [workspaceFiles, mentionQuery, mentionHidden],
  );
  const mentionItems = useMemo(() => mentionMatches.map((file) => ({ name: file, description: "" })), [mentionMatches]);
  const mentionMenuOpen = mentionMatches.length > 0;
  const clampedMentionIndex = Math.min(mentionIndex, Math.max(0, mentionMatches.length - 1));

  useEffect(() => {
    setMentionIndex(0);
  }, [mentionQuery]);

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
    theme: themeName,
    setMode,
    setTheme: (next) => {
      setThemeName(next);
      onThemeChange?.(next);
    },
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

  function acceptMention(file: string) {
    if (!mention) return;
    const completed = completeMention(input.value, input.cursorOffset, mention, file);
    input.set(completed.value, completed.cursor);
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

      const menuAction = mentionMenuOpen ? mentionMenuAction(key, mentionQuery ?? "") : undefined;
      if (menuAction) {
        if (menuAction === "previous") setMentionIndex((i) => Math.max(0, i - 1));
        else if (menuAction === "next") setMentionIndex((i) => Math.min(mentionMatches.length - 1, i + 1));
        else if (menuAction === "accept") acceptMention(mentionMatches[clampedMentionIndex]!);
        else setMentionDismissedAt(input.value);
        return;
      }

      if (key.return) {
        if (key.shift || key.meta) {
          input.insert("\n");
          return;
        }
        // A backslash before the cursor makes enter a newline instead of a send (for terminals that cannot tell shift+enter apart).
        const continued = setup.stage === "field" ? undefined : continueLine({ value: input.value, cursor: input.cursorOffset });
        if (continued) input.set(continued.value, continued.cursor);
        else submit();
        return;
      }

      if (key.escape) return;

      // Backspace, word and line movement and deletion: the keymap is in hooks/keys.ts.
      const edit = editFor(typed, key);
      if (edit === "ignore") return;
      if (edit) {
        input.apply(edit);
        return;
      }

      // Up and down move between the lines of a multi-line entry first, and only past its first or last line recall history.
      if (key.upArrow || key.downArrow) {
        const moved = moveVertical({ value: input.value, cursor: input.cursorOffset }, key.upArrow ? -1 : 1);
        if (moved) input.set(moved.value, moved.cursor);
        else if (key.upArrow) input.set(history.up(input.value));
        else input.set(history.down());
        return;
      }

      // `?` in an empty box asks for the shortcuts (the footer says so) instead of typing a question mark.
      if (typed === "?" && input.value === "" && setup.stage === "idle") {
        chat.notify(HELP_TEXT);
        return;
      }

      // Text that arrives in one piece is a paste: line breaks come as \r, and an API key must not keep its trailing one.
      if (typed) input.insert(typed.length > 1 ? normalizePaste(typed, { singleLine: setup.stage === "field" }) : typed);
    },
    { isActive: process.stdin.isTTY === true },
  );

  // Home and End: Ink's useInput does not report them. Same moments as typing: not during an approval, a turn or the provider picker.
  const typingAllowed = process.stdin.isTTY === true && !chat.pendingPermission && !chat.isThinking && setup.stage !== "select";
  useHomeEnd((edge: EdgeKey) => input.apply(edge === "home" ? moveToLineStart : moveToLineEnd), typingAllowed);

  const request = chat.pendingPermission;
  // How much of a diff the approval prompt may show: up to 12 lines, fewer on a short terminal so the transcript keeps its rows.
  const maxPreviewLines = Math.max(3, Math.min(12, rows - 18));
  const showThinking = chat.isThinking && !request;
  const pickerOpen = setup.stage === "select";
  const listHeight = transcriptRows({
    rows,
    inputValue: input.value,
    thinking: showThinking,
    slashMenuRows: mentionMenuOpen
      ? slashMenuRows(true, mentionMatches.length)
      : slashMenuRows(slashMenuOpen || pickerOpen, pickerOpen ? setup.menu.length : filteredCommands.length),
    promptRows: request ? permissionPromptRows(chat.pendingPreview, maxPreviewLines) : setup.prompt ? SETUP_PROMPT_ROWS : 0,
  });

  return (
    <ThemeContext.Provider value={theme}>
      <Box flexDirection="column" height={rows}>
        <MessageList cwd={cwd} version={version} height={listHeight} timeline={chat.timeline} expandedToolCallIds={chat.expandedToolCallIds} />
        {showThinking && <ThinkingIndicator active outputChars={chat.outputChars} />}
        {request && (
          <PermissionPrompt
            summary={summarizeToolCall(request.toolName, request.args)}
            preview={chat.pendingPreview}
            width={columns}
            maxPreviewLines={maxPreviewLines}
          />
        )}
        {pickerOpen && <SlashCommandMenu commands={setup.menu} selectedIndex={setup.selectedIndex} prefix="" />}
        {setup.prompt && <SetupPrompt title={setup.prompt.title} label={setup.prompt.label} hint={setup.prompt.hint} error={setup.prompt.error} />}
        {slashMenuOpen && <SlashCommandMenu commands={filteredCommands} selectedIndex={clampedSlashIndex} />}
        {mentionMenuOpen && <SlashCommandMenu commands={mentionItems} selectedIndex={clampedMentionIndex} prefix="" truncate="start" />}
        <InputBox value={input.value} cursorOffset={input.cursorOffset} mask={setup.prompt?.secret === true} placeholder={placeholder} />
        <StatusLine model={active ? `${active.model} (${active.provider})` : "no provider"} mode={mode} cwd={shownCwd} branch={branch} context={chat.context} />
      </Box>
    </ThemeContext.Provider>
  );
}
