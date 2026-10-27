import React from "react";
import { describe, expect, it } from "vitest";
import { displayWidth } from "../../../src/format/table.js";
import { SlashCommandMenu } from "../../../src/ui/components/SlashCommandMenu.js";
import { slashMenuRows } from "../../../src/ui/layout.js";
import { renderFrame } from "../support/render-frame.js";

const commands = [
  { name: "help", description: "Show the commands and keys" },
  { name: "clear", description: "Start a new conversation" },
];

describe("SlashCommandMenu", () => {
  it("lists each command with its slash and description in one aligned column, and marks the selected one", async () => {
    const frame = await renderFrame(<SlashCommandMenu commands={commands} selectedIndex={1} />, 60);
    expect(frame).toContain("  /help   Show the commands and keys");
    expect(frame).toContain("❯ /clear  Start a new conversation");
    const rows = frame.split("\n").slice(1);
    expect(rows[0]!.indexOf("Show")).toBe(rows[1]!.indexOf("Start"));
  });

  it("has no border: a blank row, then the items", async () => {
    const frame = await renderFrame(<SlashCommandMenu commands={commands} selectedIndex={0} />, 60);
    expect(frame).not.toMatch(/[╭╮╰╯│─]/);
    const rows = frame.split("\n");
    expect(rows).toHaveLength(3);
    expect(rows[0]!.trim()).toBe("");
  });

  it("says so when nothing matches", async () => {
    expect(await renderFrame(<SlashCommandMenu commands={[]} selectedIndex={0} />, 60)).toContain("No matching commands");
  });

  it("shows just the name for an item with no description, with no dangling dash", async () => {
    const files = [{ name: "src/index.ts", description: "" }];
    const frame = await renderFrame(<SlashCommandMenu commands={files} selectedIndex={0} prefix="" />, 60);
    expect(frame).toContain("❯ src/index.ts");
    expect(frame).not.toContain("—");
  });

  it("keeps every item to one row, so the menu is as tall as the layout reserved", async () => {
    const long = { name: `packages/${"deeply/".repeat(12)}nested/file.ts`, description: "" };
    const frame = await renderFrame(<SlashCommandMenu commands={[long, ...commands]} selectedIndex={0} prefix="" />, 40);
    const rows = frame.split("\n");
    expect(rows).toHaveLength(slashMenuRows(true, 3));
    for (const row of rows) expect(displayWidth(row)).toBeLessThanOrEqual(40);
  });

  it("cuts a path from its start so the file name survives, and a command from its end", async () => {
    const path = { name: `packages/${"deeply/".repeat(12)}nested/file.ts`, description: "" };
    const pathFrame = await renderFrame(<SlashCommandMenu commands={[path]} selectedIndex={0} prefix="" truncate="start" />, 40);
    expect(pathFrame).toContain("nested/file.ts");
    expect(pathFrame).not.toContain("packages/");

    const command = { name: "provider", description: "Configure the model provider and its API key, or a local model" };
    const commandFrame = await renderFrame(<SlashCommandMenu commands={[command]} selectedIndex={0} />, 40);
    expect(commandFrame).toContain("/provider");
    expect(commandFrame).not.toContain("local model");
  });
});
