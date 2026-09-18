/** A named prompt, rendered against a plain variable map. */
export interface PromptTemplate {
  id: string;
  render(vars: Record<string, string>): string;
}
