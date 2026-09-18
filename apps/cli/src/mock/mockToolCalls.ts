import type { ToolCallData } from "../types.js";

export const mockToolCalls: ToolCallData[] = [
  {
    id: "tool-1",
    summary: "Read package.json",
    detail: '{\n  "name": "@cortex/cli",\n  "version": "0.1.0"\n  ...\n}',
  },
  {
    id: "tool-2",
    summary: "Edit src/parser.ts",
    detail: "- if (arr.length) {\n+ if (arr.length > 0) {",
  },
];
