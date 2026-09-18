# @cortex/prompts

Templates and rendering for system and task prompts, kept provider-agnostic (no
provider-specific formatting lives here — that belongs in the `@cortex/llm`
provider descriptor). Templates are registered by id and rendered against a plain
variable map.

## API

- `PromptTemplate` — `{ id, render(vars) }`.
- `registerTemplate(template)` / `renderPrompt(id, vars)`.
- `createStringTemplate(id, template)` — builds a `PromptTemplate` that does
  `{{key}}` substitution against a fixed template string, throwing
  `MissingTemplateVariableError` if a placeholder has no matching var. All three
  built-in templates are defined this way; nothing forces new templates to use it —
  a template with more complex rendering logic can just implement `render()` itself.

## Built-in templates (`src/templates`)

Not auto-registered on import — the composition root (or whichever package needs
one) registers what it wants via `registerTemplate`, or all of `defaultTemplates` at
once.

- `chat-system` — the normal coding-agent loop's system prompt. Vars: `workspaceRoot`.
- `review-analysis` — confirms or rejects a raw scanner finding before it becomes a
  `Vulnerability` (`packages/security`'s `VulnerabilityAnalyzer`). Vars: `ruleId`,
  `file`, `rawMessage`, `snippet`. Asks for a JSON response shaped like
  `SecurityAnalysis { confirmed, confidence, rootCause, explanation, recommendation }`.
- `remediation-plan` — proposes a fix for a confirmed vulnerability
  (`packages/security`'s `RemediationPlanner`). Vars: `title`, `file`, `description`,
  `recommendation`, `snippet`. Asks for a JSON response shaped like
  `{ summary, changes: [{ file, operation, reason }], expectedOutcome }`, and
  explicitly instructs the minimum-necessary-change constraint from the
  architecture plan.
