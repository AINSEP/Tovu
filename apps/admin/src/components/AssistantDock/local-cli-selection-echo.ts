import { resolveChatPaneSelection, type ChatPaneAgent, type ChatPaneAgentSelection } from "@jini-ai/chat/react";

/**
 * Whether a `ChatPane` `onSelectionChange` call is only `ChatPane` echoing back its own
 * normalization of the selection we passed in, not an operator pick.
 *
 * `ChatPane` resolves a controlled `selection` against its agent inventory and, when the resolved
 * value differs, reports it through `onSelectionChange` from an effect (`useChatPane.hooks.ts`):
 * a model-less `{ agentId: "claude" }` (the dock's starting value, and any hydrated agent with no
 * saved model) gains the agent's default model, an unavailable agent falls back to the first
 * available one. Every mount produced one such call, and persisting it wrote
 * `localCli.agentId`/`.model` on every admin page load (2026-09-23).
 *
 * With the inventory known, the echo is exactly `resolveChatPaneSelection(agents, current)`. An
 * operator pick equal to it is also skipped, correctly: that value is what the picker already
 * shows. Without an inventory there is no echo to skip: `ChatPane` cannot normalize against an
 * empty list, and the dock records each live inventory (`recordAgents`) before `ChatPane` gets it.
 *
 * @param current - The selection the dock currently passes to `ChatPane`.
 * @param incoming - The value `ChatPane` reported.
 * @param agents - The inventory `ChatPane` resolves against, when known.
 * @returns `true` when `incoming` should be shown but not saved.
 */
export function isSelectionNormalizationEcho(
  current: ChatPaneAgentSelection,
  incoming: ChatPaneAgentSelection,
  agents: readonly ChatPaneAgent[] | undefined,
): boolean {
  if (!agents?.length) return false;
  const resolved = resolveChatPaneSelection(agents, current);
  return resolved.agentId === incoming.agentId
    && resolved.model === incoming.model
    && resolved.reasoning === incoming.reasoning;
}
