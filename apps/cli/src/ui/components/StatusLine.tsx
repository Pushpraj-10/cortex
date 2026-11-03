import React from "react";
import { Box, Text } from "ink";
import type { AgentModeId } from "@cortex/agent";
import { contextPercent, layoutStatus, type StatusParts } from "../../format/status.js";
import { displayWidth } from "../../format/table.js";
import { useTerminalSize } from "../hooks/terminal.js";
import { shortcutsHint } from "../theme/copy.js";
import { useTheme } from "../theme/ThemeContext.js";

interface StatusLineProps extends StatusParts {
  mode: string;
  /** The active agent (scan, suggest, fix), if any; named first on the left, in that agent's colour. */
  agent?: AgentModeId;
}

/** How each non-default permission mode is announced; the default mode says nothing. */
const MODE_NOTES: Record<string, string> = {
  acceptEdits: "accept edits on",
  plan: "plan mode on",
  bypassPermissions: "bypass permissions on",
};

const MODE_CYCLE_HINT = " (shift+tab to cycle)";
const AGENT_CYCLE_HINT = " (ctrl+g to cycle)";

/**
 * The mark drawn before each agent's name, as `⏵⏵` marks the permission mode. They are told apart from the mode's, and from each
 * other, by shape as well as colour, so the agents still read apart in the mono theme and under `NO_COLOR`.
 */
export const AGENT_SYMBOLS: Record<AgentModeId, string> = { scan: "◎", suggest: "✎", fix: "✦" };
/** The context percentage turns amber here, and rose at the second threshold, so a full context is noticed before it is compacted. */
const CONTEXT_WARN_PERCENT = 75;
const CONTEXT_ALERT_PERCENT = 90;
/** Margin on each side, and the gap kept between the two halves. */
const PADDING = 2;
const GAP = 2;
/** The left drops its optional hint before the model name has to be cut; a very long model name does not get to push the hint out forever. */
const MAX_MODEL_WIDTH_WANTED = 28;

/**
 * The bottom line. On the left, `? for shortcuts`, or the permission mode when it is not the default so it is never a
 * surprise. On the right, as many of these as fit, most important first: the model, how full the context is, the folder
 * and the git branch; a narrow terminal loses the folder first and the model last (see `layoutStatus`).
 */
export function StatusLine({ mode, agent, ...parts }: StatusLineProps) {
  const theme = useTheme();
  const { columns } = useTerminalSize();
  const note = MODE_NOTES[mode];

  // The widest wording that fits is used, and the hints go in order of least importance: the agent's `(ctrl+g to cycle)`
  // first, then the mode's `(shift+tab to cycle)`. The room wanted is the left side, a little of the model, and the margins;
  // if even the shortest is wider than the terminal it is cut, so the line never wraps.
  const agentName = agent ? `${AGENT_SYMBOLS[agent]} ${agent} agent` : "";
  const agentLead = agent ? `${agentName} · ` : "";
  const modeTexts = note ? [`⏵⏵ ${note}${MODE_CYCLE_HINT}`, `⏵⏵ ${note}`] : [shortcutsHint];
  const wanted = Math.min(displayWidth(parts.model), MAX_MODEL_WIDTH_WANTED);
  // The agent's hint is a convenience, so it never costs the right side anything: it is shown only when the model, context,
  // branch and folder all still fit whole beside it. The mode hint, as before, may take a little of the folder.
  const rightSide = layoutStatus(parts, Number.MAX_SAFE_INTEGER).filter((segment) => segment.text !== "");
  const wholeRight = rightSide.reduce((width, segment, index) => width + displayWidth(segment.text) + (index > 0 ? 3 : 0), 0);
  const variants = [
    ...(agent ? [{ agentHint: true, room: wholeRight, text: `${agentName}${AGENT_CYCLE_HINT} · ${modeTexts[0]}` }] : []),
    ...modeTexts.map((text) => ({ agentHint: false, room: wanted, text: agentLead + text })),
  ];
  const chosen = variants.find((variant) => displayWidth(variant.text) + variant.room + PADDING + GAP <= columns) ?? variants[variants.length - 1]!;
  const leftText = chosen.text;
  // The agent's name in its own colour (bold), then the muted hint when there is room for it.
  const lead = agent ? (
    <>
      <Text color={theme.agent[agent]} bold>
        {agentName}
      </Text>
      {chosen.agentHint ? AGENT_CYCLE_HINT : ""}
      {" · "}
    </>
  ) : null;
  const leftWidth = Math.min(displayWidth(leftText), Math.max(0, columns - PADDING));
  const segments = layoutStatus(parts, columns - PADDING - leftWidth - GAP).filter((segment) => segment.text !== "");
  const percent = parts.context ? contextPercent(parts.context) : 0;

  const colorOf = (kind: (typeof segments)[number]["kind"]) => {
    if (kind === "model") return theme.secondary;
    if (kind === "branch") return theme.primary;
    if (kind === "context") return percent >= CONTEXT_ALERT_PERCENT ? theme.status.error : percent >= CONTEXT_WARN_PERCENT ? theme.status.warning : theme.muted;
    return theme.muted;
  };

  return (
    <Box justifyContent="space-between" width="100%" paddingX={1}>
      <Box flexShrink={0} width={leftWidth}>
        {note ? (
          <Text color={theme.muted} wrap="truncate-end">
            {lead}
            <Text color={theme.primary}>⏵⏵ {note}</Text>
            {leftText.endsWith(MODE_CYCLE_HINT) ? MODE_CYCLE_HINT : ""}
          </Text>
        ) : (
          <Text color={theme.muted} wrap="truncate-end">
            {lead}
            {shortcutsHint}
          </Text>
        )}
      </Box>
      {segments.length > 0 && (
        <Box flexShrink={0} marginLeft={GAP}>
          <Text>
            {segments.map((segment, index) => (
              <React.Fragment key={segment.kind}>
                {index > 0 && <Text color={theme.muted}> · </Text>}
                <Text color={colorOf(segment.kind)}>{segment.text}</Text>
              </React.Fragment>
            ))}
          </Text>
        </Box>
      )}
    </Box>
  );
}
