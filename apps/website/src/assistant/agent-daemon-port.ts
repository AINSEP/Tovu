/**
 * @file Narrow port for `server/agent-daemon/agent-daemon-server.ts` — the daemon entry point
 * (relocated out of `assistant/` to `server/agent-daemon/`, 2026-08-17), which needs deep access to
 * ~17 individual `assistant/` implementation files purely to wire the daemon together. None of that
 * need is shared with any other external consumer, so it does NOT belong in `assistant/index.ts`
 * (that barrel is curated for its own, unrelated consumer set — widening it here would inflate the
 * reachable set of every one of ITS existing callers too, the same mechanism that made routing
 * through `core/index.ts` for `tool-surface-exchanges.ts` regress propagation cost).
 *
 * Deliberately NOT shared with `daemon-supervisor.ts` (the sibling file in `server/agent-daemon/`)
 * even though both are agent-daemon-process concerns: `daemon-supervisor.ts` has real external fan-in
 * (`src/index.ts`, `server/modules/assistant.ts`, `server/routes/admin/system/assistant-daemon.ts`)
 * while `agent-daemon-server.ts` has none (it is only ever spawned as a subprocess). Routing both
 * through one shared port measurably regressed propagation cost — `daemon-supervisor.ts`'s 3 external
 * callers all transitively inherited `agent-daemon-server.ts`'s entire 17-file reachable set, even
 * though they never touch it. `daemon-supervisor.ts` keeps its own 2 direct imports instead.
 *
 * This file is a narrow, single-purpose door: no other module should import it, and it must not
 * `export *` — every line here exists because `agent-daemon-server.ts` uses it today.
 */
export { listAssistantAgents, rescanAssistantAgents } from "./agents.js";
export { createCustomInstructionsCache } from "./custom-instructions.js";
export { DELEGATED_TOOL_CALLS_PATH, requireAgentDaemonToken } from "./daemon-auth.js";
export { AGENT_DAEMON_EXIT_CODE } from "./daemon-exit-codes.js";
export { FRONTEND_CONTROL_CAPABILITIES } from "./frontend-control-capabilities.js";
export { attachFederatedMcpTools } from "./mcp-federation/bootstrap.js";
// Pure, no transport: turns the SAME boot admission snapshot `attachFederatedMcpTools` returns into
// the prompt text that tells the model which external tools were withheld and why. Exported through
// this port for the same reason the line above is — the daemon process reaches this subtree only
// here. See `mcp-federation/refusal-notice.ts`.
export { buildFederatedRefusalPrefix } from "./mcp-federation/refusal-notice.js";
// The CALL-TIME counterpart to `buildFederatedRefusalPrefix` above — see that file's header and
// `federated-refusal-diagnosis.ts`'s own for why the boot-time prefix and this decorator
// deliberately disagree about `not-in-operator-allowlist`.
export { withFederatedRefusalDiagnosis } from "./federated-refusal-diagnosis.js";
export type { ResolvedFederatedConnection } from "./mcp-federation/config.js";
export { readEnabledExternalMcpConfigs, toResolvedFederatedConnections } from "./external-mcp-store.js";
// The daemon builds its OWN OAuth service: it refreshes tokens before launching an `authMode:
// "oauth"` child process, and gates federated calls on a connection that has since gone
// `needs_reauth`. It shares nothing in memory with the web server's instance — only the row.
export {
  createDeviceAuthorizationStore,
  createExternalMcpConnectionGate,
  createExternalMcpOAuthService,
} from "./external-mcp-oauth.js";
export { registerA2uiActionsRoute } from "./a2ui-actions-route.js";
export { registerMcpUiToolCallsRoute } from "./mcp-ui-tool-calls-route.js";
export { resolveMcpJsonInjection } from "./mcp-injection.js";
export { createOwnedRunListHandler, createRunOwnerRegistry, requireRunOwnership, RUN_PRINCIPAL_HEADER } from "./run-ownership.js";
export { parseRunStartContextRef } from "./run-start-context.js";
export { buildComponentCatalogQuery } from "./component-catalog-query.js";
export { buildToolCatalogQuery } from "./tool-catalog-query.js";
export { withToolAttemptAudit } from "./tool-executor-audit.js";
export { withToolFailureRecovery } from "./tool-failure-recovery.js";
export { constrainPrincipalToReadOnlyTools, withReadOnlyToolConstraint } from "./read-only-tool-constraint.js";
export { createAssistantToolExecutor } from "./tool-executor-stack.js";
export {
  UNSCOPED_TOOL_CATALOG_ROUTE_PRINCIPAL_ID,
  UNSCOPED_TOOL_CATALOG_ROUTE_RUN_ID,
  withToolCatalogAudit,
} from "./tool-catalog-audit.js";
export { buildAssistantToolRegistrations } from "./tool-registrations.js";
