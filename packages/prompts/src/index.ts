/**
 * @cortex/prompts — templates for agent prompts, kept provider-agnostic. Templates
 * are registered by id and rendered against a plain variable map; nothing here is
 * auto-registered on import, so the composition root decides what's active.
 */

// Shared types
export type { PromptTemplate } from "./types.js";

// Core rendering & registry
export { renderTemplateString, MissingTemplateVariableError } from "./core/render-template-string.js";
export { createStringTemplate } from "./core/string-template.js";
export { registerTemplate, getTemplate, renderPrompt, listTemplates, UnknownTemplateError } from "./core/template-registry.js";

// Templates
export { chatSystemTemplate } from "./templates/chat-system.js";
