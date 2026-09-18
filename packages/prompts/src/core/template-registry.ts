import { CortexError } from "@cortex/shared";
import type { PromptTemplate } from "../types.js";

export class UnknownTemplateError extends CortexError {
  constructor(id: string) {
    super(`No prompt template registered with id "${id}"`, "PROMPT_UNKNOWN_TEMPLATE");
  }
}

/** Maps template id → template. Call registerTemplate(template) to make one available. */
const registry = new Map<string, PromptTemplate>();

export function registerTemplate(template: PromptTemplate): void {
  registry.set(template.id, template);
}

/** Retrieve a registered template by id. Throws UnknownTemplateError if it isn't registered. */
export function getTemplate(id: string): PromptTemplate {
  const template = registry.get(id);
  if (!template) {
    throw new UnknownTemplateError(id);
  }
  return template;
}

/** Look up a template by id and render it against vars in one call. */
export function renderPrompt(id: string, vars: Record<string, string> = {}): string {
  return getTemplate(id).render(vars);
}

/** List all registered templates. */
export function listTemplates(): PromptTemplate[] {
  return Array.from(registry.values());
}
