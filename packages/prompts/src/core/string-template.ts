import type { PromptTemplate } from "../types.js";
import { renderTemplateString } from "./render-template-string.js";

/** Builds a PromptTemplate whose render() does {{key}} substitution against a fixed template string. */
export function createStringTemplate(id: string, template: string): PromptTemplate {
  return {
    id,
    render: (vars) => renderTemplateString(template, vars),
  };
}
