
/**
 * @file The ONE composition that turns "enable/disable this Agent Plugin" into a durable decision:
 * verify the id is actually installed in this workspace, then write the activation record.
 *
 * ---------------------------------------------------------------------------
 * Why this file exists rather than a second copy of the same three lines
 * ---------------------------------------------------------------------------
 * `setAgentPluginActivation` (`activation.ts`) is the WRITER. It is deliberately incurious: it
 * validates the name grammar and writes, and it will happily mint a record for a plugin id that is
 * not installed anywhere. Everything that makes a toggle *correct* — that the id names a real
 * installed package in THIS workspace, so no activation can be recorded for something that does not
 * exist — lives one layer above it, and until 2026-09-09 that layer existed exactly once, inline in
 * `server/inbound/admin-http/routes/agent-plugins/set-enabled.ts` (`AGENT_PLUGIN_SET_ENABLED`,
 * commit `34640b70`).
 *
 * `plugins_set_enabled`'s Agent Plugin branch (`features/plugin-runtime/tool-registrations.ts`) is
 * the second caller of that same layer. Re-typing the precondition there would have made two places
 * that each decide what "installed" means, and the failure mode of them drifting is a tool that
 * records activations for plugins the admin screen says are not there. So the route's own
 * composition moved here and both callers share it — the admin route keeps its response projection
 * and its HTTP status mapping, which are genuinely its own.
 *
 * ---------------------------------------------------------------------------
 * The installed-check reads `listInstalledPlugins`, NOT the search read model
 * ---------------------------------------------------------------------------
 * The route asks `loadAgentPluginSearchCandidates` (`agent-plugins/tool-registrations.ts`) because
 * it needs that read model's full row — description, keywords, skills, mcp server ids — to send
 * back. This module needs one bit ("is this id installed here?"), and takes it from the primitive
 * that read model is itself built on. That keeps a DOMAIN module off a TOOL-WIRING module: nothing
 * here imports `tool-registrations.ts` in either feature, so the tool branch that calls this file
 * introduces no `plugin-runtime -> agent-plugins/tool-registrations` edge.
 *
 * Architectural role:
 * `features/agent-plugins` business rule. Filesystem only, via `layout.ts`'s `forWorkspace()` root —
 * the same tenant-isolation guarantee every other path in this feature goes through.
 */

import { agentPluginLifecycle } from "./lifecycle.js";
import type { SetAgentPluginEnabledInput, SetAgentPluginEnabledResult } from "@jini-ai/agent-plugins/lifecycle";
export { AgentPluginNotInstalledError } from "@jini-ai/agent-plugins/lifecycle";
export type { SetAgentPluginEnabledInput, SetAgentPluginEnabledResult } from "@jini-ai/agent-plugins/lifecycle";

/**
 * Records an operator's enable/disable decision for one installed Agent Plugin.
 *
 * @throws {AgentPluginNotInstalledError} The id is not installed in this workspace. Nothing is
 * written, so no activation record can exist for a package that does not.
 * @throws {Error} If `pluginId` does not match the Agent Plugins name grammar (re-asserted
 * independently by `setAgentPluginActivation`, so a caller cannot skip it).
 * @complexity O(d) in installed-digest count for the precondition, plus one whole-file rewrite of
 * the (small) activations record.
 */
export function setAgentPluginEnabled(input: SetAgentPluginEnabledInput, _options: Record<string, never> = {}): Promise<SetAgentPluginEnabledResult> {
  return agentPluginLifecycle.setAgentPluginEnabled(input);
}
