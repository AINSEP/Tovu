
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

import { createTovuAgentPluginLifecycle } from "./lifecycle.js";
import { AgentPluginLinkedError, bindProviderFacePorts, linkedProviderOf, type ProviderFacePorts } from "./provider-plugin-link.js";
export { AgentPluginLinkedError } from "./provider-plugin-link.js";
import type { SetAgentPluginEnabledResult } from "@jini-ai/agent-plugins/lifecycle";
export { AgentPluginNotInstalledError } from "@jini-ai/agent-plugins/lifecycle";
export type { SetAgentPluginEnabledResult } from "@jini-ai/agent-plugins/lifecycle";
import type { SetAgentPluginEnabledInput } from '../../contracts/headless/plugin-host.js';
export type { SetAgentPluginEnabledInput } from '../../contracts/headless/plugin-host.js';

/**
 * Records an operator's enable/disable decision for one installed Agent Plugin.
 *
 * @throws {AgentPluginLinkedError} The id is a provider plugin's face; that plugin's switch decides.
 * @throws {AgentPluginNotInstalledError} The id is not installed in this workspace. Nothing is
 * written, so no activation record can exist for a package that does not.
 * @throws {Error} If `pluginId` does not match the Agent Plugins name grammar (re-asserted
 * independently by `setAgentPluginActivation`, so a caller cannot skip it).
 * @complexity O(d) in installed-digest count for the precondition, plus one whole-file rewrite of
 * the (small) activations record.
 */
// A stable owner context per booted layout preserves its queues without selecting a site again.
const lifecycles = new WeakMap<import("./layout.js").AgentPluginLayout, ReturnType<typeof createTovuAgentPluginLifecycle>>();

export async function setAgentPluginEnabled(input: SetAgentPluginEnabledInput, options: { readonly links?: Pick<ProviderFacePorts, "links"> } = {}): Promise<SetAgentPluginEnabledResult> {
  // A provider plugin's assistant face has no switch of its own (`provider-plugin-link.ts`).
  const links = options.links ?? bindProviderFacePorts({ workspaceRoot: () => input.agentPluginLayout.forWorkspace(input.workspaceId).root });
  const providerPluginId = await linkedProviderOf({ ports: links, pluginId: input.pluginId });
  if (providerPluginId !== undefined) throw new AgentPluginLinkedError({ pluginId: input.pluginId, providerPluginId });
  let lifecycle = lifecycles.get(input.agentPluginLayout);
  if (!lifecycle) {
    lifecycle = createTovuAgentPluginLifecycle({ layout: input.agentPluginLayout });
    lifecycles.set(input.agentPluginLayout, lifecycle);
  }
  return lifecycle.setAgentPluginEnabled(input);
}
