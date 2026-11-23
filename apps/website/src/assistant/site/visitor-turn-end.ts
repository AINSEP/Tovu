/**
 * @file Classifies how a visitor chat turn ended, so a reply cut off by the output budget is never
 * reported as a normal finish (VISITOR-CHAT cut-off, 2026-11-23).
 *
 * Why this exists: Gemini counts hidden thinking tokens against `maxOutputTokens`, so a reply can stop
 * at `finishReason: MAX_TOKENS` mid-sentence ("Here is the complete list of the 11 posts" and no list).
 * `@jini-ai/agent-runtime`'s `googleLoopExitReason` maps every response without tool calls to
 * `end: "stop"` and the captured end reason overrides the raw finish reason in
 * `runProviderToolTurn`'s result, so the route gets no direct signal. The one thing it does get is the
 * normalised `usage` event: a request that stopped at the limit reports `output_tokens` (answer plus
 * thinking) at or above `maxTokens`, which a request that finished on its own does not.
 */

/** The `output_tokens` a provider adapter's normalised `usage` event reports, if it is a number. */
export function outputTokensOf({ usage }: { usage: Record<string, unknown> | null }, _options = {}): number | undefined {
  const value = usage?.output_tokens;
  return typeof value === "number" ? value : undefined;
}

/**
 * The end reason the visitor's browser should see. Only a plain `stop` can be a hidden truncation;
 * `error`, `navigation`, `max_tool_turns` and the rest already say why the turn ended.
 *
 * @param input.lastOutputTokens - `output_tokens` from the LAST request's usage event (a tool loop
 *   makes several requests; only the final one produced the visible tail).
 * @complexity O(1).
 */
export function visitorTurnEnd(
  { reason, lastOutputTokens, maxTokens }: { reason: string; lastOutputTokens: number | undefined; maxTokens: number }, _options = {},
): { reason: string } {
  const hitBudget = lastOutputTokens !== undefined && lastOutputTokens >= maxTokens;
  return { reason: reason === "stop" && hitBudget ? "truncated" : reason };
}
