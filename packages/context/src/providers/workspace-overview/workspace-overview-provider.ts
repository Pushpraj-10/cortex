import { ok } from "@cortex/core";
import type { ContextProvider } from "../../core/context-provider.js";
import { formatOverview } from "./format-overview.js";
import { readWorkspaceOverview } from "./read-workspace-overview.js";

/** Contributes a shallow directory listing + package.json name/description + README excerpt. */
export const workspaceOverviewProvider: ContextProvider = {
  id: "workspace-overview",
  displayName: "Workspace Overview",
  async gather(request) {
    const result = await readWorkspaceOverview(request.workspaceRoot);
    if (!result.ok) return result;

    // Low relevance: general background that always applies, so it ranks below anything the
    // request specifically asked for and is the first thing dropped when the block runs long.
    return ok([
      {
        providerId: "workspace-overview",
        title: "Workspace Overview",
        content: formatOverview(result.value),
        relevance: 0.1,
      },
    ]);
  },
};
