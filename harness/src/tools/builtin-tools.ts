import { bashTool } from "./bash";
import { editTool } from "./edit";
import { globTool } from "./glob";
import { grepTool } from "./grep";
import { readTool } from "./read";
import type { ToolDef } from "./types";
import { writeTool } from "./write";

export const builtinTools: ToolDef[] = [readTool, writeTool, editTool, globTool, grepTool, bashTool];
