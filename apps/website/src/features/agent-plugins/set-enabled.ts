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
import { setAgentPluginActivation } from "./activation.js";
import { resolveAgentPluginLayout } from "./layout.js";
import { listInstalledPlugins } from "./resolve-agent-plugin-refs.js";

/**
 * The id named is not installed in this workspace. A distinct class rather than a bare `Error` so
 * each caller can map it to its own boundary's vocabulary — 404 `AGENT_PLUGIN_NOT_FOUND` at the
 * admin route, `ToolInputError` at the tool — without either one string-matching a message.
 */
export class AgentPluginNotInstalledError extends Error {
  constructor(pluginId: string) {
    super(`agent plugin '${pluginId}' is not installed in this workspace`);
    this.name = "AgentPluginNotInstalledError";
  }
}

export interface SetAgentPluginEnabledInput {
  readonly workspaceId: string;
  readonly pluginId: string;
  readonly enabled: boolean;
  /** Recorded as the activation record's `updatedBy`. The authenticated principal, never a constant. */
  readonly actor: string;
}

export interface SetAgentPluginEnabledResult {
  readonly pluginId: string;
  /** As actually written and read back, not as requested. */
  readonly enabled: boolean;
}

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
export async function setAgentPluginEnabled(input: SetAgentPluginEnabledInput): Promise<SetAgentPluginEnabledResult> {
  const workspaceLayout = resolveAgentPluginLayout().forWorkspace(input.workspaceId);
  const installed = await listInstalledPlugins(workspaceLayout.packages);
  if (!installed.some((plugin) => plugin.pluginId === input.pluginId)) {
    throw new AgentPluginNotInstalledError(input.pluginId);
  }

  const written = await setAgentPluginActivation({
    workspaceRoot: workspaceLayout.root,
    pluginId: input.pluginId,
    enabled: input.enabled,
    actor: input.actor,
  });

  return { pluginId: input.pluginId, enabled: written.plugins[input.pluginId]?.enabled ?? input.enabled };
}
