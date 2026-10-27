import { describe, expect, it, vi } from "vitest";
import { HELP_TEXT, runSlashCommand, slashCommands, type CommandHost } from "../../src/ui/commands.js";

function host(overrides: Partial<CommandHost> = {}): CommandHost {
  return {
    mode: "default",
    model: "llama3.1",
    provider: "ollama",
    theme: "dark",
    setMode: vi.fn(),
    agent: undefined,
    setAgent: vi.fn(),
    setTheme: vi.fn(),
    openProviderSetup: vi.fn(),
    removeProvider: vi.fn(),
    clear: vi.fn(),
    exit: vi.fn(),
    notify: vi.fn(),
    ...overrides,
  };
}

describe("runSlashCommand", () => {
  it("ignores ordinary messages, including ones that start with a path", () => {
    const h = host();
    expect(runSlashCommand("fix the bug", h)).toBe(false);
    expect(runSlashCommand("/etc/hosts has a typo", h)).toBe(false);
    expect(runSlashCommand("/ lonely slash", h)).toBe(false);
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("/help lists every command", () => {
    const h = host();
    expect(runSlashCommand("/help", h)).toBe(true);
    expect(h.notify).toHaveBeenCalledWith(HELP_TEXT);
    for (const command of slashCommands) expect(HELP_TEXT).toContain(`/${command.name}`);
  });

  it("/clear and /exit call the host", () => {
    const h = host();
    runSlashCommand("/clear", h);
    runSlashCommand("/exit", h);
    expect(h.clear).toHaveBeenCalledTimes(1);
    expect(h.exit).toHaveBeenCalledTimes(1);
  });

  it("/model shows the model and provider", () => {
    const h = host();
    runSlashCommand("/model", h);
    expect(h.notify).toHaveBeenCalledWith("Model: llama3.1 (ollama)");
  });

  it("/mode with no argument shows the current mode", () => {
    const h = host({ mode: "plan" });
    runSlashCommand("/mode", h);
    expect(h.setMode).not.toHaveBeenCalled();
    expect(vi.mocked(h.notify).mock.calls[0]![0]).toContain("Mode: plan");
  });

  it("/mode <name> sets a valid mode and confirms it", () => {
    const h = host();
    runSlashCommand("/mode acceptEdits", h);
    expect(h.setMode).toHaveBeenCalledWith("acceptEdits");
    expect(h.notify).toHaveBeenCalledWith("Mode: acceptEdits");
  });

  it("/mode <bad> reports the valid modes and changes nothing", () => {
    const h = host();
    runSlashCommand("/mode yolo", h);
    expect(h.setMode).not.toHaveBeenCalled();
    expect(vi.mocked(h.notify).mock.calls[0]![0]).toContain('Unknown mode "yolo"');
  });

  it("/agent with no argument shows the current agent and what each one does", () => {
    const h = host({ agent: "suggest" });
    runSlashCommand("/agent", h);
    expect(h.setAgent).not.toHaveBeenCalled();
    const shown = vi.mocked(h.notify).mock.calls[0]![0];
    expect(shown).toContain("Agent: suggest");
    for (const id of ["scan", "suggest", "fix"]) expect(shown).toContain(id);
    expect(shown).toContain("off");
  });

  it("/agent with no argument says the general agent is active when none is set", () => {
    const h = host();
    runSlashCommand("/agent", h);
    expect(vi.mocked(h.notify).mock.calls[0]![0]).toContain("Agent: none (general agent)");
  });

  it("/agent <name> switches to a valid agent and confirms it", () => {
    const h = host();
    runSlashCommand("/agent scan", h);
    expect(h.setAgent).toHaveBeenCalledWith("scan");
    expect(h.notify).toHaveBeenCalledWith("Agent: scan — find security vulnerabilities (read-only).");
  });

  it("/agent <name> warns that plan mode still blocks edits and saving the report", () => {
    const h = host({ mode: "plan" });
    runSlashCommand("/agent fix", h);
    expect(h.setAgent).toHaveBeenCalledWith("fix");
    expect(vi.mocked(h.notify).mock.calls[0]![0]).toContain("Plan mode is on");
    const h2 = host({ mode: "default" });
    runSlashCommand("/agent fix", h2);
    expect(vi.mocked(h2.notify).mock.calls[0]![0]).not.toContain("Plan mode");
  });

  it("/agent off returns to the general agent", () => {
    const h = host({ agent: "fix" });
    runSlashCommand("/agent off", h);
    expect(h.setAgent).toHaveBeenCalledWith(undefined);
    expect(h.notify).toHaveBeenCalledWith("Agent: off (general agent)");
  });

  it("/agent <bad> reports the valid agents and changes nothing", () => {
    const h = host();
    runSlashCommand("/agent hack", h);
    expect(h.setAgent).not.toHaveBeenCalled();
    const shown = vi.mocked(h.notify).mock.calls[0]![0];
    expect(shown).toContain('Unknown agent "hack"');
    expect(shown).toContain("scan, suggest, fix");
  });

  it("/theme with no argument shows the current theme and the choices", () => {
    const h = host({ theme: "light" });
    runSlashCommand("/theme", h);
    expect(h.setTheme).not.toHaveBeenCalled();
    const shown = vi.mocked(h.notify).mock.calls[0]![0];
    expect(shown).toContain("Theme: light");
    expect(shown).toContain("dark|light|mono");
  });

  it("/theme <name> switches to a valid theme and confirms it", () => {
    const h = host();
    runSlashCommand("/theme mono", h);
    expect(h.setTheme).toHaveBeenCalledWith("mono");
    expect(h.notify).toHaveBeenCalledWith("Theme: mono");
  });

  it("/theme <bad> reports the valid themes and changes nothing", () => {
    const h = host();
    runSlashCommand("/theme neon", h);
    expect(h.setTheme).not.toHaveBeenCalled();
    expect(vi.mocked(h.notify).mock.calls[0]![0]).toContain('Unknown theme "neon"');
  });

  it("reports an unknown /command instead of sending it to the model", () => {
    const h = host();
    expect(runSlashCommand("/frobnicate now", h)).toBe(true);
    expect(vi.mocked(h.notify).mock.calls[0]![0]).toContain("Unknown command /frobnicate");
  });

  it("/provider with no argument opens the picker", () => {
    const h = host();
    expect(runSlashCommand("/provider", h)).toBe(true);
    expect(h.openProviderSetup).toHaveBeenCalledWith();
  });

  it("/provider <name> goes straight to that provider's setup", () => {
    const h = host();
    runSlashCommand("/provider google", h);
    expect(h.openProviderSetup).toHaveBeenCalledWith("google");
  });

  it("/provider <unknown> reports the valid providers and starts nothing", () => {
    const h = host();
    runSlashCommand("/provider groq", h);
    expect(h.openProviderSetup).not.toHaveBeenCalled();
    expect(vi.mocked(h.notify).mock.calls[0]![0]).toContain('Unknown provider "groq"');
    expect(vi.mocked(h.notify).mock.calls[0]![0]).toContain("google");
  });

  it("/provider remove <name> forgets that provider's saved settings", () => {
    const h = host();
    runSlashCommand("/provider remove anthropic", h);
    expect(h.removeProvider).toHaveBeenCalledWith("anthropic");
    expect(h.openProviderSetup).not.toHaveBeenCalled();
  });

  it("/provider remove without a valid name shows the usage", () => {
    const h = host();
    runSlashCommand("/provider remove", h);
    runSlashCommand("/provider remove nonsense", h);
    expect(h.removeProvider).not.toHaveBeenCalled();
    expect(vi.mocked(h.notify).mock.calls[0]![0]).toContain("Usage: /provider remove");
    expect(vi.mocked(h.notify).mock.calls).toHaveLength(2);
  });

  it("is case-insensitive and tolerant of surrounding whitespace", () => {
    const h = host();
    runSlashCommand("  /CLEAR  ", h);
    expect(h.clear).toHaveBeenCalled();
  });
});
