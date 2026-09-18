import type { SlashCommand } from "../types.js";

export const mockSlashCommands: SlashCommand[] = [
  { name: "help", description: "Show available commands and keyboard shortcuts" },
  { name: "clear", description: "Clear the conversation" },
  { name: "theme", description: "Switch color theme" },
  { name: "model", description: "Switch the active LLM model" },
  { name: "history", description: "Show recent command history" },
  { name: "quit", description: "Exit Cortex" },
];
