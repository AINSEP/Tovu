import { composeAgentPluginMcp } from "#src/server/runtime/composition/agent-plugin-service-ports";
import assert from "node:assert/strict";

import type { ToolRegistration } from "@jini-ai/core";

import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import type { AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
import { InMemoryExternalMcpServerRepo } from "../../../external-mcp/external-mcp-store.memory.js";
import { InMemoryPluginActivationRepo } from "@jini-ai/plugins/host";
import { buildPluginsRegistrations, type PluginsToolDeps } from "#src/__tests__/support/plugin-tool-host";
import { providerFacesFor } from "../../../plugin-runtime/__tests__/fixtures/plugins-tool-harness.js";
import type { TovuPluginHostDeps } from "#src/server/runtime/composition/plugin-host";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import type { AgentPluginUninstallToolDeps } from "../../uninstall-tool.js";

/**
 * @file The `plugins_uninstall` registration these integration tests call with `family: "agent-plugin"`.
 *
 * plugins_uninstall delegates this family to runAgentPluginUninstall. The branch reads only
 * authorize/workspaceId and preferences for copy; every other PluginsToolDeps field here belongs to
 * the site-runtime branch and must never be called on this path.
 */
export function buildPluginsUninstallRegistration(deps: AgentPluginUninstallToolDeps, surfaces: AssistantSurfaceDeps): ToolRegistration {
  const keyring = new InMemoryKeyring();
  const clock = createFakeClock({ startIso: new Date().toISOString() });
  const unused = (name: string) => () => {
    throw new Error(`${name} must not be called by the agent-plugin family's uninstall branch`);
  };
  const pluginsDeps: PluginsToolDeps & TovuPluginHostDeps = {
    authorize: deps.authorize,
    workspaceId: deps.workspaceId,
    agentPluginLayout: deps.agentPluginLayout,
    providerFaces: providerFacesFor({ workspaceRoot: () => deps.agentPluginLayout.forWorkspace(deps.workspaceId).root }),
    ...(deps.uninstallAgentPlugin ? { uninstallAgentPlugin: deps.uninstallAgentPlugin } : {}),
    // The operator's admin language for dialog copy is resolved by the supplied preferences owner.
    preferences: deps.preferences,
    clock,
    idGen: { newId: () => "id-1" },
    changeSets: new InMemoryChangeSetRepo(),
    outbox: { enqueue: async () => undefined, claimPending: async () => [], markDelivered: async () => {}, markFailed: async () => {} },
    pluginActivationRepo: new InMemoryPluginActivationRepo(),
    discoverPlugins: unused("discoverPlugins"),
    onPluginEnabled: unused("onPluginEnabled"),
    onPluginDisabled: unused("onPluginDisabled"),
    removePlugin: unused("removePlugin"),
    mcp: composeAgentPluginMcp({ repo: new InMemoryExternalMcpServerRepo(), sealer: new AesGcmSecretSealer(keyring), keyring, clock }),
  };
  const registration = buildPluginsRegistrations(pluginsDeps, surfaces).find((candidate) => candidate.descriptor.id === "plugins_uninstall");
  assert.ok(registration, "plugins_uninstall must be registered");
  return registration;
}
