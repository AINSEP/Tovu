import assert from "node:assert/strict";

import type { ToolRegistration } from "@jini-ai/core";

import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import type { AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
import { InMemoryExternalMcpServerRepo } from "#src/assistant/external-mcp-store.memory";
import { InMemoryPluginActivationRepo } from "@jini-ai/plugins/host";
import { buildPluginsRegistrations, type PluginsToolDeps } from "#src/features/plugin-runtime/tool-registrations";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import type { AgentPluginUninstallToolDeps } from "../../uninstall-tool.js";

/**
 * @file The `plugins_uninstall` registration these integration tests call with `family: "agent-plugin"`.
 *
 * plugins_uninstall delegates this family to runAgentPluginUninstall. The branch reads only
 * authorize/workspaceId and settingsRepo for copy; every other PluginsToolDeps field here belongs to
 * the site-runtime branch and must never be called on this path.
 */
export function buildPluginsUninstallRegistration(deps: AgentPluginUninstallToolDeps, surfaces: AssistantSurfaceDeps): ToolRegistration {
  const keyring = new InMemoryKeyring();
  const unused = (name: string) => () => {
    throw new Error(`${name} must not be called by the agent-plugin family's uninstall branch`);
  };
  const pluginsDeps: PluginsToolDeps = {
    authorize: deps.authorize,
    workspaceId: deps.workspaceId,
    ...(deps.uninstallAgentPlugin ? { uninstallAgentPlugin: deps.uninstallAgentPlugin } : {}),
    // The operator's admin language for the dialog copy (`operator-locale.ts`), when the test supplies a ledger.
    ...(deps.settingsRepo ? { settingsRepo: deps.settingsRepo } : {}),
    clock: createFakeClock({ startIso: new Date().toISOString() }),
    idGen: { newId: () => "id-1" },
    changeSets: new InMemoryChangeSetRepo(),
    outbox: { enqueue: async () => undefined, claimPending: async () => [], markDelivered: async () => {}, markFailed: async () => {} },
    pluginActivationRepo: new InMemoryPluginActivationRepo(),
    discoverPlugins: unused("discoverPlugins"),
    onPluginEnabled: unused("onPluginEnabled"),
    onPluginDisabled: unused("onPluginDisabled"),
    removePlugin: unused("removePlugin"),
    externalMcpServerRepo: new InMemoryExternalMcpServerRepo(),
    siteAssistantSecretSealer: new AesGcmSecretSealer(keyring),
    siteAssistantSecretKeyring: keyring,
  };
  const registration = buildPluginsRegistrations(pluginsDeps, surfaces).find((candidate) => candidate.descriptor.id === "plugins_uninstall");
  assert.ok(registration, "plugins_uninstall must be registered");
  return registration;
}
