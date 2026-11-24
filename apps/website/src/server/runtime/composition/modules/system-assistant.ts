import type { Express } from "express";
import { AGENT_DEFS } from "@jini-ai/agent-runtime";
import { createOwnerGrantRoutes, type OwnerGrantPolicy } from "@jini-ai/cms/admin-http/routes/system/assistant-owner-grant";
import { ASSISTANT_PERMANENT_DELETES_PATH, assistantPermanentDeletesGrant } from "@jini-ai/cms/admin-http/routes/system/assistant-permanent-deletes";
import { ASSISTANT_SUBAGENTS_PATH, assistantSubagentsGrant, type AssistantSubagentsRouteDeps } from "@jini-ai/cms/admin-http/routes/system/assistant-subagents";
import { readCliPermissionLayer, patchCliPermissionLayer } from "#src/assistant/cli-permission-layer";
import { readAssistantCliPermissions, readAssistantPermanentDeletesPolicy } from "#src/assistant/runtime-settings";
import { resolveAgentPermissionMode } from "#src/contracts/core/agent-permission-mode";
import { ASSISTANT_PERMANENT_DELETES_NAMESPACE, ASSISTANT_PERMANENT_DELETES_KEY, ASSISTANT_PERMANENT_DELETES_WRITE_REASON, PERMANENT_DELETE_TOOLS } from "#src/contracts/headless/index";
import { assistantCliPermissions, fullCliEnvLock, isHostedAssistantRuntime, resolveAssistantCliPermissions } from "@tovu/contracts/assistant-native-fallbacks";
import { ASSISTANT_SUBAGENTS_NAMESPACE, ASSISTANT_CLI_PERMISSIONS_KEY, ASSISTANT_SUBAGENTS_WRITE_REASON, ASSISTANT_CLI_CAPABILITIES, type AssistantCliCapability, type AssistantCliPermissions } from "@tovu/contracts/assistant-subagents-policy";
import { set } from "#src/features/settings/index";
import { SETTINGS_WRITE_FENCE, toWriteServiceDeps } from "#src/server/inbound/admin-http/routes/settings/shared";
import { mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { lowerAssistantToolAccess } from "#src/server/runtime/composition/modules/assistant-tool-access-lowering";
import { resolveHostSignals } from "#src/server/runtime/composition/host-signals";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file The site owner's assistant grants (permanent deletes; full-CLI subagents) — K1: the
 * acknowledged/audited owner-grant ceremony and each grant's parsing are Jini specs
 * (`@jini-ai/cms/admin-http/routes/system/assistant-{owner-grant,permanent-deletes,subagents}`),
 * mounted behind the admin ports in `"direct"` mode with the fixed `routes/settings` 500 copy they
 * inherited from the settings JSON mount. `RouteDeps` is read only here: each mount gets the
 * settings-UI readiness, the ledger, Tovu's protected-namespace fence, the owner id, the clock and
 * Tovu's audited settings write; each grant gets its namespaces, copy and host services.
 */

export type AssistantOwnerGrantDeps = Pick<RouteDeps, "workspaceId" | "authorize" | "settingsReady" | "settingsUiTabsReady" | "settingsRepo" | "clock" | "idGen" | "principalRepo" | "ownerPrincipalId" | "getEffective">;

/** The unexpected-failure options these routes had (the settings JSON mount's `sendAdminFailure` copy). */
const OWNER_GRANT_MOUNT = {
  authorization: "direct" as const,
  failure: { operation: "routes/settings", message: "The settings request could not finish." },
};
const HOSTED_UNAVAILABLE = "Not available on hosted sites";

/** Port fields, settings-UI readiness, the ledger + fence, the owner id, clock and audited write. */
function ownerGrantRouteDeps({ deps }: { deps: AssistantOwnerGrantDeps }, _optional: Record<string, never> = {}) {
  const writeDeps = toWriteServiceDeps({ ...deps, settingsReady: deps.settingsUiTabsReady });
  const authorize: AdminJsonRoutePortDeps["authorize"] = (params) => deps.authorize(params);
  return {
    workspaceId: deps.workspaceId, authorize, settingsReady: deps.settingsUiTabsReady, settingsRepo: deps.settingsRepo,
    writeFence: SETTINGS_WRITE_FENCE, ownerPrincipalId: deps.ownerPrincipalId, clock: deps.clock,
    writeSetting: ({ input }: { input: Parameters<typeof set>[0]["input"] }, optional: { expectedRevisionSeq?: number } = {}) => set({ deps: writeDeps, input }, optional),
  };
}

/** Mount one owner grant's GET/PUT pair (GET first) on `path`. Hosted sites refuse `canEdit` with
 * Tovu's hosting copy unless the policy names its own.
 * @complexity O(1) setup; per request as the Jini owner-grant specs. */
export function registerAssistantOwnerGrantRoutes<T extends { enabled: boolean }>(
  required: { app: Express; deps: AssistantOwnerGrantDeps; path: string } & OwnerGrantPolicy<T>,
  optional: { requireAcknowledgment?: boolean; scope?: "user" | "workspace" } = {},
): void {
  const { app, deps, path, ...policy } = required;
  const routes = createOwnerGrantRoutes<T>({ path, policy: { uneditableError: HOSTED_UNAVAILABLE, ...policy, ...optional } });
  const routeDeps = ownerGrantRouteDeps({ deps });
  mountAdminJsonRoute({ app, spec: routes.get, deps: routeDeps }, OWNER_GRANT_MOUNT);
  mountAdminJsonRoute({ app, spec: routes.put, deps: routeDeps }, OWNER_GRANT_MOUNT);
}

/** Mount this site's owner policy on the shared acknowledged/audited grant ceremony.
 * @example registerAdminAssistantPermanentDeletesRoutes({ app, deps }); */
export function registerAdminAssistantPermanentDeletesRoutes(required: { app: Express; deps: AssistantOwnerGrantDeps }, _optional = {}): void {
  const { deps } = required;
  registerAssistantOwnerGrantRoutes({ ...required, path: ASSISTANT_PERMANENT_DELETES_PATH, ...assistantPermanentDeletesGrant({
    grant: { namespace: ASSISTANT_PERMANENT_DELETES_NAMESPACE, key: ASSISTANT_PERMANENT_DELETES_KEY, writeReason: ASSISTANT_PERMANENT_DELETES_WRITE_REASON },
    permanentDeleteToolIds: PERMANENT_DELETE_TOOLS.map((tool) => tool.id),
    readPolicy: () => readAssistantPermanentDeletesPolicy({ ...deps, settingsReady: deps.settingsUiTabsReady }),
  }) });
}

function projectAssistantSubagentsRead({ settings, isOwner }: { settings: AssistantCliPermissions; isOwner: boolean }) {
  // An env lock keeps canEdit (the owner's stored choice still saves) but must say why every
  // switch reads OFF; without a reason the dock showed clickable switches that snapped back.
  const envLock = fullCliEnvLock({ env: process.env });
  const hostSignals = resolveHostSignals({ env: process.env });
  const permissions = resolveAssistantCliPermissions({ isOwner, env: process.env, settings }, { hostSignals });
  let availability: { unavailableReason?: string };
  if (isHostedAssistantRuntime({ env: process.env }, { hostSignals })) availability = { unavailableReason: HOSTED_UNAVAILABLE };
  else if (!isOwner) availability = { unavailableReason: "Only the owner can change agent permissions." };
  else if (envLock) availability = { unavailableReason: `Turned off on this computer by ${envLock}.` };
  else availability = {};
  return { ...permissions, agents: AGENT_DEFS.map(({ id, name, externalMcpInjection }) => ({ id, name, inheritedRunKey: (externalMcpInjection === "opencode-env-content" || externalMcpInjection === "mimo-env-content") || externalMcpInjection === "env-passthrough", writesPersonalConfig: externalMcpInjection === "env-passthrough" })), ...availability, permissionMode: resolveAgentPermissionMode({ env: process.env }, { hostSignals }) };
}

/** Tovu's full-CLI catalogue, agent list, layer store, env/hosting policy and tool-access lowering. */
function subagentsGrantDeps({ deps }: { deps: AssistantOwnerGrantDeps }, _optional: Record<string, never> = {}): AssistantSubagentsRouteDeps {
  return {
    grant: { namespace: ASSISTANT_SUBAGENTS_NAMESPACE, key: ASSISTANT_CLI_PERMISSIONS_KEY, writeReason: ASSISTANT_SUBAGENTS_WRITE_REASON, uneditableError: HOSTED_UNAVAILABLE },
    capabilityKeys: ASSISTANT_CLI_CAPABILITIES.map((item) => item.key),
    agentIds: AGENT_DEFS.map(({ id }) => id),
    readPermissions: async () => readAssistantCliPermissions({ ...deps, principalId: await deps.ownerPrincipalId, settingsReady: deps.settingsUiTabsReady }, { readFailure: "throw" }),
    normalize: (input: { enabled: boolean; capabilities?: Partial<Record<AssistantCliCapability, boolean>> }) => assistantCliPermissions(input),
    projectRead: ({ settings, isOwner }: { settings: AssistantCliPermissions; isOwner: boolean }) => projectAssistantSubagentsRead({ settings, isOwner }),
    canEdit: ({ isOwner }) => isOwner && !isHostedAssistantRuntime({ env: process.env }, { hostSignals: resolveHostSignals({ env: process.env }) }),
    readLayer: async () => readCliPermissionLayer({ ...deps, principalId: await deps.ownerPrincipalId }),
    patchLayer: (input: Parameters<typeof patchCliPermissionLayer>[0]) => patchCliPermissionLayer(input),
    resolveAgentPermissions: ({ settings, agentId }: { settings: AssistantCliPermissions; agentId: string }) => resolveAssistantCliPermissions({ isOwner: true, env: {}, settings, agentId }),
    lowerToolAccess: (input) => lowerAssistantToolAccess(input),
  };
}

/** Owner/site-scoped CLI permissions through the existing authenticated, audited grant owner.
 * The master writes all defaults; explicit item choices survive until the master is changed.
 * @complexity O(1), fixed capability payload and one atomic ledger revision per write. */
export function registerAdminAssistantSubagentsRoutes(required: { app: Express; deps: AssistantOwnerGrantDeps }, _optional = {}): void {
  registerAssistantOwnerGrantRoutes({ ...required, path: ASSISTANT_SUBAGENTS_PATH, ...assistantSubagentsGrant(subagentsGrantDeps({ deps: required.deps })) });
}
