import { useEffect, useRef, useState } from "react";
import type { AgentSession } from "@cortex/agent";
import { formatToolResultDetail, isLlmFailureMessage, summarizeToolCall } from "../format/tool-calls.js";
import type { PermissionBridge, PermissionRequest } from "../permission-bridge.js";
import type { TimelineEntry } from "../types.js";

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface Chat {
  timeline: TimelineEntry[];
  isThinking: boolean;
  /** An approval the agent is waiting on, or null. */
  pendingPermission: PermissionRequest | null;
  expandedToolCallIds: ReadonlySet<string>;
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
 * waiting on, and which tool calls are expanded. The session may be replaced (after /clear), so it is
 * read through a ref at call time.
 */
export function useChat(session: AgentSession, permissions: PermissionBridge): Chat {
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [pendingPermission, setPendingPermission] = useState<PermissionRequest | null>(null);
  const [expandedToolCallIds, setExpandedToolCallIds] = useState<Set<string>>(new Set());

  const sessionRef = useRef(session);
  sessionRef.current = session;
  const abortControllerRef = useRef<AbortController | null>(null);
  const userCancelledRef = useRef(false);
  const pendingPermissionRef = useRef<PermissionRequest | null>(null);

  useEffect(
    () =>
      permissions.onRequest((request) => {
        pendingPermissionRef.current = request;
        setPendingPermission(request);
      }),
    [permissions],
  );

  useEffect(
    () => () => {
      abortControllerRef.current?.abort();
      pendingPermissionRef.current?.resolve(false);
    },
    [],
  );

  const append = (entry: TimelineEntry) => setTimeline((prev) => [...prev, entry]);

  function answerPermission(allowed: boolean) {
    const request = pendingPermissionRef.current;
    if (!request) return;
    pendingPermissionRef.current = null;
    setPendingPermission(null);
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

    const controller = new AbortController();
    abortControllerRef.current = controller;
    userCancelledRef.current = false;

    let pendingToolEntryId: string | null = null;

    try {
      for await (const event of sessionRef.current.chat(text, controller.signal)) {
        if (event.type === "toolCall") {
          const id = nextId("tool");
          pendingToolEntryId = id;
          append({ kind: "toolCall", id, summary: summarizeToolCall(event.toolName, event.args), detail: "Running…" });
        } else if (event.type === "toolResult") {
          const id = pendingToolEntryId;
          pendingToolEntryId = null;
          const detail = formatToolResultDetail(event.output);
          setTimeline((prev) =>
            prev.map((entry) => (entry.kind === "toolCall" && entry.id === id ? { ...entry, detail } : entry)),
          );
        } else if (event.type === "compacted") {
          append({ kind: "notice", id: nextId("notice"), text: `Context compacted (~${event.before} → ~${event.after} tokens)` });
        } else if (!userCancelledRef.current) {
          append({
            kind: "message",
            id: nextId("assistant"),
            role: "assistant",
            content: event.content,
            isError: isLlmFailureMessage(event.content),
          });
        }
      }
    } finally {
      setIsThinking(false);
      abortControllerRef.current = null;
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

  return {
    timeline,
    isThinking,
    pendingPermission,
    expandedToolCallIds,
    submit,
    cancel,
    answerPermission,
    notify: (text) => append({ kind: "notice", id: nextId("notice"), text }),
    reset: () => {
      setTimeline([]);
      setExpandedToolCallIds(new Set());
    },
    toggleLastToolCall,
  };
}
