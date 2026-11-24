import { createMcpRosterChangeBus, type McpRosterChangeListener, type McpRosterChangeNotifyOptions } from "@jini-ai/mcp/federation";
import { ToolAccessLoweringError } from "@jini-ai/daemon";
/**
 * @file The website process's ONE external-MCP roster-change bus — the seam that lets every process
 * holding a live federated-tool registry (the agent daemon's own, and BYOK's per-request
 * `FederationRuntime`) hear about a roster write without the three call sites (`put.ts`,
 * `oauth-callback.ts`, `features/external-mcp/tool-registrations.ts`) each having to know how many
 * runtimes exist or what each one's reload method is called.
 *
 * The keyed last-wins fan-out, the `waitMs` cap and lowering's reject-on-failure live in
 * `@jini-ai/mcp/federation`'s `createMcpRosterChangeBus` (see its header for why). This host binding
 * owns the single instance and injects Tovu's `ToolAccessLoweringError`, so a failed or timed-out
 * lowering still rejects with the contract error every writer and model-facing mapper recognizes.
 *
 * Architectural role:
 * Composition binding. No I/O of its own; every listener performs its own.
 */

/** A registered reaction to a roster change (see `McpRosterChangeListener`). */
export type ExternalMcpRosterChangeListener = McpRosterChangeListener;

const rosterChangeBus = createMcpRosterChangeBus({ createLoweringError: () => new ToolAccessLoweringError() });

/**
 * Registers a reaction to a roster change, called once per runtime at composition-root boot
 * (`app.ts`'s `"agent-daemon"`/`"byok"` keys, `agent-daemon-server.ts`'s `"agent-daemon-local"`).
 * Re-registering the same `key` REPLACES the earlier listener rather than appending.
 */
export function onExternalMcpRosterChanged({ key, listener }: { key: string; listener: ExternalMcpRosterChangeListener }, _optional = {}): void {
  rosterChangeBus.on({ key, listener });
}

/** Fans a roster change out to every registered listener, capped at `waitMs` (default 5s); a
 *  lowering rejects with `ToolAccessLoweringError` on failure or deadline. */
export function notifyExternalMcpRosterChanged(options: McpRosterChangeNotifyOptions = {}): Promise<void> {
  return rosterChangeBus.notify(options);
}

/** Test-only reset of this process's bus (mirrors `presets.ts`'s `resetFederatedMcpPresetsForTests`). */
export function resetExternalMcpRosterChangeListenersForTests(): void {
  rosterChangeBus.reset();
}
