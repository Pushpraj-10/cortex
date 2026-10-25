/**
 * Google (Gemini) provider, via the Gemini API's `generateContent`: config, wire-format mapping,
 * client and descriptor in one place.
 *
 * Gemini differs from the OpenAI-style providers in ways the mapping absorbs: the system prompt is a
 * top-level `systemInstruction`; the assistant's role is "model"; tool calls are `functionCall` parts
 * and their results are `functionResponse` parts (matched by tool *name*, so no call ids are needed)
 * inside a user turn; and `functionResponse.response` must be an object.
 */
import { err, ok, type Result } from "@cortex/core";
import type { ChatMessage, ChatRequest, LLMProvider, LLMProviderDescriptor, ToolCall, ToolSpec } from "./types.js";
import { ProviderRequestError, postJson } from "./wire.js";

export interface GoogleConfig {
  apiKey: string;
  /** Defaults to https://generativelanguage.googleapis.com. */
  baseUrl?: string;
  /** e.g. "gemini-2.0-flash"; a leading "models/" is accepted and stripped. */
  model: string;
}

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com";

// ---- wire format -----------------------------------------------------------------

export type GooglePart =
  | { text: string; thought?: boolean }
  | { functionCall: { name: string; args: unknown } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

export interface GoogleContent {
  role: "user" | "model";
  parts: GooglePart[];
}

interface GoogleFunctionDeclaration {
  name: string;
  description: string;
  /** Omitted for a tool that takes no arguments: Gemini rejects an object schema with no properties. */
  parameters?: Record<string, unknown>;
}

export interface GoogleRequestBody {
  systemInstruction?: { parts: { text: string }[] };
  contents: GoogleContent[];
  tools?: { functionDeclarations: GoogleFunctionDeclaration[] }[];
  generationConfig?: { temperature: number };
}

interface GoogleResponse {
  candidates?: { content?: { parts?: GooglePart[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

/** The JSON-Schema keywords Gemini's function schema does not accept. */
const UNSUPPORTED_SCHEMA_KEYS = new Set(["$schema", "additionalProperties"]);

/** Copies a JSON schema without the keywords Gemini rejects, at every depth (MCP tools often carry them). */
function sanitizeSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(sanitizeSchema);
  if (typeof schema !== "object" || schema === null) return schema;
  return Object.fromEntries(
    Object.entries(schema)
      .filter(([key]) => !UNSUPPORTED_SCHEMA_KEYS.has(key))
      .map(([key, value]) => [key, sanitizeSchema(value)]),
  );
}

function toFunctionDeclaration(tool: ToolSpec): GoogleFunctionDeclaration {
  const properties = (tool.parametersSchema as { properties?: Record<string, unknown> }).properties;
  const takesArguments = properties !== undefined && Object.keys(properties).length > 0;
  return {
    name: tool.name,
    description: tool.description,
    ...(takesArguments ? { parameters: sanitizeSchema(tool.parametersSchema) as Record<string, unknown> } : {}),
  };
}

/** Our tool messages carry JSON text; Gemini wants an object, so a non-object result is wrapped as `{ result }`. */
function toResponseObject(content: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(content);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    return { result: parsed };
  } catch {
    return { result: content };
  }
}

/**
 * Maps provider-agnostic messages to Gemini's shape: system messages are joined into
 * `systemInstruction`, assistant turns become "model" turns (text plus `functionCall` parts), tool
 * results become `functionResponse` parts in a user turn, and consecutive same-role turns are merged
 * (function responses first) so roles alternate.
 */
export function toGoogleContents(messages: ChatMessage[]): { systemInstruction?: string; contents: GoogleContent[] } {
  const systemParts: string[] = [];
  const contents: GoogleContent[] = [];

  const push = (role: GoogleContent["role"], parts: GooglePart[]) => {
    if (parts.length === 0) return;
    const last = contents[contents.length - 1];
    if (last && last.role === role) {
      last.parts.push(...parts);
      last.parts.sort((a, b) => Number("functionResponse" in b) - Number("functionResponse" in a));
    } else {
      contents.push({ role, parts });
    }
  };

  for (const message of messages) {
    if (message.role === "system") {
      systemParts.push(message.content);
    } else if (message.role === "user") {
      push("user", message.content ? [{ text: message.content }] : []);
    } else if (message.role === "assistant") {
      const parts: GooglePart[] = message.content ? [{ text: message.content }] : [];
      for (const call of message.toolCalls ?? []) parts.push({ functionCall: { name: call.toolName, args: call.args } });
      push("model", parts);
    } else {
      push("user", [{ functionResponse: { name: message.name ?? "tool", response: toResponseObject(message.content) } }]);
    }
  }

  return { systemInstruction: systemParts.length > 0 ? systemParts.join("\n\n") : undefined, contents };
}

/** Shapes a non-streaming request body for `generateContent`. */
export function buildGoogleRequest(request: ChatRequest): GoogleRequestBody {
  const { systemInstruction, contents } = toGoogleContents(request.messages);
  return {
    ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
    contents,
    ...(request.tools && request.tools.length > 0
      ? { tools: [{ functionDeclarations: request.tools.map(toFunctionDeclaration) }] }
      : {}),
    ...(request.temperature !== undefined ? { generationConfig: { temperature: request.temperature } } : {}),
  };
}

/**
 * Joins the reply's visible text (skipping "thought" parts) and returns only the first `functionCall`
 * as a ToolCall: the agent runs one action per turn, and history must match what was actually run.
 */
export function fromGoogleParts(parts: GooglePart[]): { content: string; toolCalls?: ToolCall[] } {
  const content = parts.flatMap((part) => ("text" in part && !part.thought ? [part.text] : [])).join("\n");
  const call = parts.find((part): part is Extract<GooglePart, { functionCall: unknown }> => "functionCall" in part);
  return call ? { content, toolCalls: [{ toolName: call.functionCall.name, args: call.functionCall.args }] } : { content };
}

// ---- client ----------------------------------------------------------------------

export function createGoogleClient(config: GoogleConfig): LLMProvider {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const model = config.model.replace(/^models\//, "");

  return {
    async chat(request: ChatRequest): Promise<Result<ChatMessage>> {
      const reply = await postJson<GoogleResponse>({
        provider: "Google",
        baseUrl,
        url: `${baseUrl}/v1beta/models/${model}:generateContent`,
        headers: { "x-goog-api-key": config.apiKey },
        body: buildGoogleRequest(request),
        signal: request.signal,
      });
      if (!reply.ok) return reply;

      const candidate = reply.value.candidates?.[0];
      if (!candidate?.content?.parts) {
        const reason = reply.value.promptFeedback?.blockReason
          ? `blocked: ${reply.value.promptFeedback.blockReason}`
          : candidate?.finishReason
            ? `finish reason: ${candidate.finishReason}`
            : undefined;
        return err(new ProviderRequestError("Google", `Google response had no content${reason ? ` (${reason})` : ""}`));
      }

      return ok({ role: "assistant", ...fromGoogleParts(candidate.content.parts) });
    },
  };
}

/** Not auto-registered; the composition root calls registerLlmProvider() explicitly. */
export const googleProviderDescriptor: LLMProviderDescriptor<GoogleConfig> = {
  id: "google",
  displayName: "Google (cloud)",
  createClient: createGoogleClient,
};
