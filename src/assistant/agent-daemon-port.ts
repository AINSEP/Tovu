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
export type { ResolvedFederatedConnection } from "./mcp-federation/config.js";
export { readEnabledExternalMcpConfigs, toResolvedFederatedConnections } from "./external-mcp-store.js";
export { registerA2uiActionsRoute } from "./a2ui-actions-route.js";
export { registerMcpUiToolCallsRoute } from "./mcp-ui-tool-calls-route.js";
export { resolveMcpJsonInjection } from "./mcp-injection.js";
export { createOwnedRunListHandler, createRunOwnerRegistry, requireRunOwnership } from "./run-ownership.js";
export { parseRunStartContextRef } from "./run-start-context.js";
export { buildComponentCatalogQuery } from "./component-catalog-query.js";
export { buildToolCatalogQuery } from "./tool-catalog-query.js";
export { withToolAttemptAudit } from "./tool-executor-audit.js";
export { buildAssistantToolRegistrations } from "./tool-registrations.js";
