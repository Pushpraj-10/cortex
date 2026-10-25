import { describe, expect, it, vi } from "vitest";
import { HELP_TEXT, runSlashCommand, slashCommands, type CommandHost } from "../src/commands.js";

function host(overrides: Partial<CommandHost> = {}): CommandHost {
  return {
    mode: "default",
    model: "llama3.1",
    provider: "ollama",
    setMode: vi.fn(),
    clear: vi.fn(),
    quit: vi.fn(),
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

  it("/clear and /quit call the host", () => {
    const h = host();
    runSlashCommand("/clear", h);
    runSlashCommand("/quit", h);
    expect(h.clear).toHaveBeenCalledTimes(1);
    expect(h.quit).toHaveBeenCalledTimes(1);
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

  it("reports an unknown /command instead of sending it to the model", () => {
    const h = host();
    expect(runSlashCommand("/frobnicate now", h)).toBe(true);
    expect(vi.mocked(h.notify).mock.calls[0]![0]).toContain("Unknown command /frobnicate");
  });

  it("is case-insensitive and tolerant of surrounding whitespace", () => {
    const h = host();
    runSlashCommand("  /CLEAR  ", h);
    expect(h.clear).toHaveBeenCalled();
  });
});
