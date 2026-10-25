import { useEffect, useRef, useState } from "react";
import type { AgentSession } from "@cortex/agent";
import type { ToolPreview } from "@cortex/tools";
import {
  errorSummary,
  firstSentence,
  formatToolResultDetail,
  isLlmFailureMessage,
  previewToolCall,
  statusOfResult,
  summarizeToolCall,
  toolKindOf,
} from "../../format/tool-calls.js";
import type { PermissionBridge, PermissionRequest } from "../../runtime/permission-bridge.js";
import type { TimelineEntry, ToolCallEntry } from "../types.js";

/** How often text that has streamed in is added to the screen. The first piece shows at once; the rest are batched so a fast model cannot flood the renderer. */
const STREAM_FLUSH_MS = 50;

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface Chat {
  timeline: TimelineEntry[];
  isThinking: boolean;
  /** An approval the agent is waiting on, or null. */
  pendingPermission: PermissionRequest | null;
  /** What the call awaiting approval will change, if its tool can say, for showing in the approval prompt. */
  pendingPreview: ToolPreview | undefined;
  expandedToolCallIds: ReadonlySet<string>;
  /** How full the conversation is: estimated tokens about to be sent, and the size at which it gets compacted. Undefined before the first request. */
  context: { used: number; budget: number } | undefined;
  /** Characters of reply text streamed in during the current request, for a live token estimate. */
  outputChars: number;
  /** Sends a message to the agent and appends everything it does to the timeline. */
  submit(text: string): Promise<void>;
  /** Aborts the in-flight request (and refuses any pending approval so the agent can unwind). */
  cancel(): void;
  answerPermission(allowed: boolean): void;
  /** Appends a one-off line from the app itself. */
  notify(text: string): void;
  /** Empties the transcript. */
  reset(): void;
  toggleLastToolCall(): void;
}

/**
 * Everything about talking to the agent: the transcript, whether it is working, an approval it is
 * waiting on, and which tool calls are expanded. Each tool call is followed through its life (running,
 * awaiting approval, then success, error, declined or interrupted), and its preview is taken before it
 * runs, while the file still has its old contents. The session may be replaced (after /clear), so it is
 * read through a ref at call time.
 */
export function useChat(session: AgentSession, permissions: PermissionBridge, cwd: string): Chat {
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [pendingPermission, setPendingPermission] = useState<PermissionRequest | null>(null);
  const [expandedToolCallIds, setExpandedToolCallIds] = useState<Set<string>>(new Set());
  const [context, setContext] = useState<{ used: number; budget: number } | undefined>(undefined);
  const [outputChars, setOutputChars] = useState(0);

  const sessionRef = useRef(session);
  sessionRef.current = session;
  const abortControllerRef = useRef<AbortController | null>(null);
  const userCancelledRef = useRef(false);
  const pendingPermissionRef = useRef<PermissionRequest | null>(null);
  /** The call the agent is running now. The loop does one at a time, so a result or an approval belongs to this one. */
  const currentToolIdRef = useRef<string | null>(null);
  /** The assistant message being written right now, while text streams in, and the text waiting for the next batch. */
  const streamingIdRef = useRef<string | null>(null);
  const pendingDeltaRef = useRef("");
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Characters streamed in during this request; shown through `outputChars`, updated with each batch. */
  const charsRef = useRef(0);

  /** Adds the batched text to the live message. */
  function flushDelta() {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    setOutputChars(charsRef.current);
    const id = streamingIdRef.current;
    const text = pendingDeltaRef.current;
    pendingDeltaRef.current = "";
    if (!id || text === "") return;
    setTimeline((previous) => previous.map((entry) => (entry.kind === "message" && entry.id === id ? { ...entry, content: entry.content + text } : entry)));
  }

  /** Closes the live message. With `final`, its text becomes exactly that; a message left empty is removed. */
  function endStreaming(final?: string) {
    flushDelta();
    const id = streamingIdRef.current;
    streamingIdRef.current = null;
    if (!id) return;
    setTimeline((previous) =>
      previous.flatMap((entry) => {
        if (entry.kind !== "message" || entry.id !== id) return [entry];
        const content = final ?? entry.content;
        return content.trim() === "" ? [] : [{ ...entry, content, streaming: false }];
      }),
    );
  }

  function updateToolCall(id: string | null, patch: Partial<ToolCallEntry>) {
    if (!id) return;
    setTimeline((previous) => previous.map((entry) => (entry.kind === "toolCall" && entry.id === id ? { ...entry, ...patch } : entry)));
  }

  useEffect(
    () =>
      permissions.onRequest((request) => {
        pendingPermissionRef.current = request;
        setPendingPermission(request);
        updateToolCall(currentToolIdRef.current, { status: "awaiting" });
      }),
    [permissions],
  );

  useEffect(
    () => () => {
      abortControllerRef.current?.abort();
      pendingPermissionRef.current?.resolve(false);
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    },
    [],
  );

  const append = (entry: TimelineEntry) => setTimeline((prev) => [...prev, entry]);

  function answerPermission(allowed: boolean) {
    const request = pendingPermissionRef.current;
    if (!request) return;
    pendingPermissionRef.current = null;
    setPendingPermission(null);
    updateToolCall(currentToolIdRef.current, { status: "running" });
    request.resolve(allowed);
  }

  function cancel() {
    userCancelledRef.current = true;
    answerPermission(false);
    abortControllerRef.current?.abort();
  }

  async function submit(text: string) {
    append({ kind: "message", id: nextId("user"), role: "user", content: text });
    setIsThinking(true);
    charsRef.current = 0;
    setOutputChars(0);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    userCancelledRef.current = false;

    try {
      for await (const event of sessionRef.current.chat(text, controller.signal)) {
        if (event.type === "messageDelta") {
          if (userCancelledRef.current) continue;
          charsRef.current += event.delta.length;
          if (!streamingIdRef.current) {
            const id = nextId("assistant");
            streamingIdRef.current = id;
            setOutputChars(charsRef.current);
            append({ kind: "message", id, role: "assistant", content: event.delta, streaming: true });
          } else {
            pendingDeltaRef.current += event.delta;
            if (!flushTimerRef.current) flushTimerRef.current = setTimeout(flushDelta, STREAM_FLUSH_MS);
          }
        } else if (event.type === "context") {
          setContext({ used: event.used, budget: event.budget });
        } else if (event.type === "toolCall") {
          endStreaming(); // the model's text always ends before a tool call; this only guards against a message event that never came
          // The loop waits at this event until the next one is asked for, so the file is still as it was when the preview is taken.
          const preview = await previewToolCall(event.toolName, event.args, cwd);
          const id = nextId("tool");
          currentToolIdRef.current = id;
          append({
            kind: "toolCall",
            id,
            summary: summarizeToolCall(event.toolName, event.args),
            toolKind: toolKindOf(event.toolName),
            status: "running",
            ...(preview ? { preview } : {}),
            startedAt: Date.now(),
            detail: "",
          });
        } else if (event.type === "toolResult") {
          const id = currentToolIdRef.current;
          currentToolIdRef.current = null;
          const status = statusOfResult(event);
          setTimeline((previous) =>
            previous.map((entry) => {
              if (entry.kind !== "toolCall" || entry.id !== id) return entry;
              const message = errorSummary(event.output);
              return {
                ...entry,
                status,
                durationMs: Date.now() - entry.startedAt,
                detail: formatToolResultDetail(event.output),
                ...(status === "success" ? {} : { error: status === "declined" ? firstSentence(message) : message }),
              };
            }),
          );
        } else if (event.type === "compacted") {
          append({ kind: "notice", id: nextId("notice"), text: `Context compacted (~${event.before} → ~${event.after} tokens)` });
        } else {
          // A finished message. If its text has been streaming in, it replaces that text with the exact complete version; a
          // failure keeps whatever was written before it and goes in a message of its own.
          const failed = isLlmFailureMessage(event.content);
          const wasStreaming = streamingIdRef.current !== null;
          if (wasStreaming) endStreaming(failed || userCancelledRef.current ? undefined : event.content);
          // A streamed message that completed is already on screen (its text was replaced just above); anything else is new.
          const alreadyOnScreen = wasStreaming && !failed;
          if (!userCancelledRef.current && !alreadyOnScreen) {
            append({ kind: "message", id: nextId("assistant"), role: "assistant", content: event.content, isError: failed });
          }
        }
      }
    } finally {
      endStreaming();
      setIsThinking(false);
      abortControllerRef.current = null;
      currentToolIdRef.current = null;
      // A call that never reported back (the request was interrupted) must not stay "running" forever.
      setTimeline((previous) =>
        previous.map((entry) =>
          entry.kind === "toolCall" && (entry.status === "running" || entry.status === "awaiting")
            ? { ...entry, status: "cancelled", error: "Interrupted" }
            : entry,
        ),
      );
    }
  }

  function toggleLastToolCall() {
    const last = [...timeline].reverse().find((entry) => entry.kind === "toolCall");
    if (!last) return;
    setExpandedToolCallIds((prev) => {
      const next = new Set(prev);
      if (next.has(last.id)) next.delete(last.id);
      else next.add(last.id);
      return next;
    });
  }

  const awaiting = timeline.find((entry): entry is ToolCallEntry => entry.kind === "toolCall" && entry.status === "awaiting");

  return {
    timeline,
    isThinking,
    pendingPermission,
    pendingPreview: awaiting?.preview,
    expandedToolCallIds,
    context,
    outputChars,
    submit,
    cancel,
    answerPermission,
    notify: (text) => append({ kind: "notice", id: nextId("notice"), text }),
    reset: () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
      streamingIdRef.current = null;
      pendingDeltaRef.current = "";
      charsRef.current = 0;
      setOutputChars(0);
      setContext(undefined);
      setTimeline([]);
      setExpandedToolCallIds(new Set());
    },
    toggleLastToolCall,
  };
}
