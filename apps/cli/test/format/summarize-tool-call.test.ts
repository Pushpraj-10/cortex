import { describe, expect, it } from "vitest";
import { summarizeToolCall } from "../../src/format/summarize-tool-call.js";

describe("summarizeToolCall", () => {
  it("read_file", () => {
    expect(summarizeToolCall("read_file", { path: "a.ts" })).toBe("Read a.ts");
  });

  it("write_file", () => {
    expect(summarizeToolCall("write_file", { path: "a.ts", content: "x" })).toBe("Write a.ts");
  });

  it("edit_file", () => {
    expect(summarizeToolCall("edit_file", { path: "a.ts" })).toBe("Edit a.ts");
  });

  it("delete_file", () => {
    expect(summarizeToolCall("delete_file", { path: "a.ts" })).toBe("Delete a.ts");
  });

  it("list_directory", () => {
    expect(summarizeToolCall("list_directory", { path: "src" })).toBe("List src");
  });

  it("create_directory", () => {
    expect(summarizeToolCall("create_directory", { path: "src/new" })).toBe("Create directory src/new");
  });

  it("move_file", () => {
    expect(summarizeToolCall("move_file", { from: "a.ts", to: "b.ts" })).toBe("Move a.ts → b.ts");
  });

  it("copy_file", () => {
    expect(summarizeToolCall("copy_file", { from: "a.ts", to: "b.ts" })).toBe("Copy a.ts → b.ts");
  });

  it("file_exists", () => {
    expect(summarizeToolCall("file_exists", { path: "a.ts" })).toBe("Check a.ts exists");
  });

  it("get_file_info", () => {
    expect(summarizeToolCall("get_file_info", { path: "a.ts" })).toBe("Get info for a.ts");
  });

  it("falls back to a generic summary for an unrecognized tool name", () => {
    expect(summarizeToolCall("some_future_tool", { x: 1 })).toBe("Run some_future_tool");
  });

  it("falls back to '?' for a missing or malformed path arg", () => {
    expect(summarizeToolCall("read_file", {})).toBe("Read ?");
    expect(summarizeToolCall("read_file", { path: 123 })).toBe("Read ?");
    expect(summarizeToolCall("read_file", null)).toBe("Read ?");
  });
});
