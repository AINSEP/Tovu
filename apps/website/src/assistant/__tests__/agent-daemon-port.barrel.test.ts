import assert from "node:assert/strict";
import test from "node:test";

import * as mcpFederation from "@jini-ai/mcp/federation";

import * as a2uiActionsRoute from "../a2ui-actions-route.js";
import * as port from "../agent-daemon-port.js";
import * as agents from "../agents.js";
import * as componentCatalogQuery from "../component-catalog-query.js";
import * as customInstructions from "../custom-instructions.js";
import * as daemonAccess from "../daemon-access.js";
import * as daemonExitCodes from "../daemon-exit-codes.js";
import * as externalMcpOAuth from "../external-mcp-oauth.js";
import * as externalMcpStore from "../external-mcp-store.js";
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
