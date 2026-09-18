import { CortexError } from "@cortex/shared";

export class MissingTemplateVariableError extends CortexError {
  constructor(key: string) {
    super(`Missing template variable "${key}"`, "PROMPT_MISSING_VARIABLE");
  }
}

const PLACEHOLDER_PATTERN = /\{\{(\w+)\}\}/g;

/** Replaces {{key}} placeholders with vars[key]; throws if a placeholder has no matching variable. */
export function renderTemplateString(template: string, vars: Record<string, string>): string {
  return template.replace(PLACEHOLDER_PATTERN, (_match, key: string) => {
    const value = vars[key];
    if (value === undefined) throw new MissingTemplateVariableError(key);
    return value;
  });
}
