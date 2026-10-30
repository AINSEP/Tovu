import assert from "node:assert/strict";
import test from "node:test";

import * as askChoice from "../ask-choice-tool.js";
import * as approvalPolicy from "../tool-approval-policy.js";
import * as installedExtensions from "../installed-extension-tools.js";
import * as connectionSource from "../external-mcp-connection-source.js";
import * as rosterChange from "../external-mcp-roster-change.js";
import * as sessions from "../agent-session-preset.js";
import * as permanentDeletes from "../permanent-delete-settings.js";
import * as deleteGate from "../permanent-delete-tool-gate.js";
import * as subagentSettings from "../subagent-settings.js";
import * as lostFrontend from "../lost-frontend-binding.js";
import * as navigateErrors from "../rewrap-page-navigate-error.js";
import * as activeContexts from "../run-active-context.js";

import * as mcpFederation from "@jini-ai/mcp/federation";

import * as a2uiActionsRoute from "../a2ui-actions-route.js";
import * as port from "../agent-daemon-port.js";
import * as agents from "../agents.js";
import * as componentCatalogQuery from "../component-catalog-query.js";
import * as customInstructions from "../custom-instructions.js";
import * as daemonAccess from "../daemon-access.js";
import * as daemonExitCodes from "../daemon-exit-codes.js";
import * as externalMcpOAuth from "../../features/external-mcp/external-mcp-oauth.js";
import * as externalMcpStore from "../../features/external-mcp/external-mcp-store.js";
import * as frontendControl from "../frontend-control-capabilities.js";
import * as federationBootstrap from "../mcp-federation/bootstrap.js";
import * as federationReload from "../mcp-federation/reload-adapter.js";
import * as mcpInjection from "../mcp-injection.js";
import * as mcpUiToolCallsRoute from "../mcp-ui-tool-calls-route.js";
import * as readOnlyConstraint from "../read-only-tool-constraint.js";
import * as runPageContext from "../run-page-context.js";
import * as runStartContext from "../run-start-context.js";
import * as toolAuditPreset from "../tool-audit-preset.js";
import * as toolCatalogLiveQuery from "../tool-catalog-live-query.js";
import * as toolCatalogQuery from "../tool-catalog-query.js";
import * as toolRecoveryPreset from "../tool-recovery-preset.js";
import * as toolRegistrations from "../tool-registrations.js";

/**
 * @file `agent-daemon-port.ts` is the ONLY door the agent-daemon process uses into the assistant
 * subtree (see that file's header). It is a pure re-export barrel, so the contract worth pinning is
 * its surface: exactly these runtime names, each the identical binding its owning module exports —
 * never a wrapper, a copy, or a stale second implementation. A name added to or dropped from the
 * barrel without updating this table fails the exact-key assertion below.
 */

const EXPECTED_SOURCES: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
  listAssistantAgents: agents,
  rescanAssistantAgents: agents,
  createCustomInstructionsCache: customInstructions,
  DELEGATED_TOOL_CALLS_PATH: daemonAccess,
  requireAgentDaemonToken: daemonAccess,
  AGENT_DAEMON_EXIT_CODE: daemonExitCodes,
  FRONTEND_CONTROL_CAPABILITIES: frontendControl,
  withReadOnlyFrontendCapabilities: frontendControl,
  attachFederatedMcpTools: federationBootstrap,
  createFederationReloadCoordinator: federationReload,
  createLiveToolCatalogQuery: toolCatalogLiveQuery,
  buildFederatedRefusalPrefix: mcpFederation,
  withFederatedRefusalDiagnosis: toolRecoveryPreset,
  readEnabledExternalMcpConfigs: externalMcpStore,
  toResolvedFederatedConnections: externalMcpStore,
  createDeviceAuthorizationStore: externalMcpOAuth,
  createExternalMcpConnectionGate: externalMcpOAuth,
  createExternalMcpOAuthService: externalMcpOAuth,
  registerA2uiActionsRoute: a2uiActionsRoute,
  registerMcpUiToolCallsRoute: mcpUiToolCallsRoute,
  resolveMcpJsonInjection: mcpInjection,
  createOwnedRunListHandler: daemonAccess,
  createRunOwnerRegistry: daemonAccess,
  requireRunOwnership: daemonAccess,
  RUN_PRINCIPAL_HEADER: daemonAccess,
  parseRunStartContextRef: runStartContext,
  buildPageContextPromptBlock: runPageContext,
  buildComponentCatalogQuery: componentCatalogQuery,
  chartCatalogManifests: componentCatalogQuery,
  buildToolCatalogQuery: toolCatalogQuery,
  listToolCatalogEntries: toolCatalogQuery,
  withToolAttemptAudit: toolAuditPreset,
  withToolFailureRecovery: toolRecoveryPreset,
  constrainPrincipalToReadOnlyTools: readOnlyConstraint,
  withReadOnlyToolConstraint: readOnlyConstraint,
  createAssistantToolExecutor: toolRecoveryPreset,
  UNSCOPED_TOOL_CATALOG_ROUTE_PRINCIPAL_ID: toolAuditPreset,
  UNSCOPED_TOOL_CATALOG_ROUTE_RUN_ID: toolAuditPreset,
  withToolCatalogAudit: toolAuditPreset,
  buildAssistantToolRegistrations: toolRegistrations,
  askAgentPluginChoice: askChoice,
  applyToolApprovalPolicy: approvalPolicy,
  createAssistantAgentInventory: agents,
  attachAssistantToolExtensions: installedExtensions,
  createStoredExternalMcpConnectionSource: connectionSource,
  buildExternalMcpFederationDeps: connectionSource,
  onExternalMcpRosterChanged: rosterChange,
  notifyExternalMcpRosterChanged: rosterChange,
  agentCarriesOwnMemory: sessions,
  extractSessionRefFromEndEvent: sessions,
  resolveResumeSessionField: sessions,
  shouldClearSessionOnFailedResume: sessions,
  wouldForcedColdStartLoseConversationContext: sessions,
  CONCURRENT_RUN_REFUSAL_MESSAGE: sessions,
  createLiveRunTracker: sessions,
  failRunBeforeStart: sessions,
  STOPPING_RUN_WAIT_MS: sessions,
  waitForStoppingRuns: sessions,
  agentAcceptsHostMintedSessionId: sessions,
  resolveHostMintedSessionId: sessions,
  resolveNewSessionField: sessions,
  createConversationStartLock: sessions,
  readChatPermanentDeletesPolicy: permanentDeletes,
  createChatDeleteScope: deleteGate,
  ALL_CHAT_DELETE_TOOLS: deleteGate,
  readAssistantCliPermissions: subagentSettings,
  createLostFrontendBindings: lostFrontend,
  withPageNavigateErrorRewrap: navigateErrors,
  delegatedToolErrorDisclosure: toolRecoveryPreset,
  createRunActiveContextStore: activeContexts,
  registerRunActiveContextRoute: activeContexts,
  createRunScopedCredentials: daemonAccess,
};

test("agent-daemon-port exports exactly the documented runtime surface, no more and no less", () => {
  assert.deepEqual(Object.keys(port).sort(), Object.keys(EXPECTED_SOURCES).sort());
});

for (const [name, source] of Object.entries(EXPECTED_SOURCES)) {
  test(`agent-daemon-port.${name} is the owning module's own binding, defined and unwrapped`, () => {
    const exported = (port as Readonly<Record<string, unknown>>)[name];
    assert.notEqual(exported, undefined, `${name} must resolve to a real value through the barrel`);
    assert.equal(exported, source[name]);
  });
}
