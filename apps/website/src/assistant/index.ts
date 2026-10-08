/**
 * @file Public surface (barrel) for `assistant` — ADR-009 §1: "A module's public contract is its
 * `index.ts`; boundary lint forbids deep imports."
 *
 * This is a CURATED door, not a re-export of everything `assistant/**` exports. Every symbol below
 * serves an external consumer or the return-type shape of a function that does. Internal-only helpers (e.g.
 * `resolvePublicTarget`, `resolveExecutionCredential`, the meta-tool descriptor set, the run-owner
 * registry) stay un-re-exported: nothing outside `assistant/` uses them, so exposing them here would
 * widen the surface this file exists to close. Deps/Input parameter types are likewise omitted
 * unless a consumer explicitly type-imports one today — every call site outside this module builds
 * those objects as inline literals, which TypeScript accepts structurally without the exported name.
 *
 * Organized by consumer concern.
 *
 * NOT re-exported here FOR `routes/types.ts`'s USE: `ChatStoreFactory` (`./persistence/tenant-scope`),
 * `AgentSessionStore` (`./persistence/agent-session-store` — same "routes/types.ts deep-imports the type, this barrel exports only the value
 * factories" split as `ChatStoreFactory`), `SiteAssistantCredentialRepoPort`
 * (`./site-credential-store`), `AdminExecutionCredentialRepoPort` (`./execution-credential-store`),
 * `ExternalMcpServerRepoPort` (`./external-mcp-store`), and `ExternalMcpOAuthService`
 * (`./external-mcp-oauth` — exported below for other consumers, but
 * `routes/types.ts` deep-imports it for the reason that follows). All six are otherwise-qualifying
 * type-only symbols that `server/routes/types.ts` imports directly instead — deliberately, not an
 * oversight.
 * `routes/types.ts` defines the widely imported `RouteDeps`. Routing these types through the
 * whole barrel expands every route's reachable graph, because `buildFileGraph` treats type-only
 * imports as edges too. Direct type imports avoid that fan-out. Composition roots have little
 * fan-in and can use the barrel. Splitting the barrel into narrow sections does not solve this
 * while `RouteDeps` spans several sections; re-evaluate if that wide type is split.
 */

// ---------------------------------------------------------------------------------------------
// A — Site Assistant (public/visitor-facing runtime)
//
// The anonymous-visitor chat's server-side surface (ADR-054, SPEC-046). Consumed almost entirely by
// `server/modules/site-assistant.ts`'s SSE route composition.
// ---------------------------------------------------------------------------------------------
export { createSiteCapabilityRegistry } from "./site/capability-registry.js";
export type {
  SiteCapabilityRegistry,
  SiteCapabilityInvocation,
  SiteCapabilityOutcome,
  SiteAssistantCallerClass,
} from "./site/capability-registry.js";

export { detectsExplicitNavigationIntent } from "./site/client-directives.js";
// `ClientDirective`/`PageAction`/`ResolvedPublicTarget` are reachable from `SiteCapabilityOutcome`'s
// `directive` field above, not imported directly anywhere today — kept public because a registry
// consumer that reads `outcome.directive` needs these names to type it. `resolvePublicTarget` itself
// (the function) has no external caller — `site/tools.ts` is the only user, inside this module —
// so it stays un-re-exported.
export type { ClientDirective, PageAction, ResolvedPublicTarget } from "./site/client-directives.js";

export { resolveBoundedHistory } from "./site/history.js";
export type { SiteAssistantHistoryTurn } from "./site/history.js";

export { resolveSiteAssistantMode } from "./site/mode.js";
export type { SiteAssistantMode, SiteAssistantModeResolution } from "./site/mode.js";

// ---------------------------------------------------------------------------------------------
// B — Assistant Settings & Credentials (admin CRUD + shared public-runtime read)
//
// Straddles the admin CRUD routes, both
// composition roots (`app.ts`/`deps.ts`), and the public-runtime read path (`isPublicAssistantEnabled`,
// `resolveSiteAssistantApiKey`) — which is why it is its own section rather than folded into A or C.
// ---------------------------------------------------------------------------------------------
export {
  ensurePublicAssistantSettingDefinitions,
  getPublicAssistantSettings,
  setPublicAssistantSettings,
  isPublicAssistantEnabled,
  ADMIN_ASSISTANT_PERMISSION,
  PublicAssistantSettingsValidationError,
} from "./public-assistant-settings.js";
export type { PublicAssistantSettings, PublicAssistantSettingKey } from "./public-assistant-settings.js";

export {
  getSiteAssistantCredential,
  setSiteAssistantCredential,
  deleteSiteAssistantCredential,
  resolveSiteAssistantApiKey,
  SiteAssistantCredentialValidationError,
  SiteAssistantSecretStoreUnconfiguredError,
} from "./site-credential-store.js";
export type {
  SiteAssistantCredentialRepoPort,
  SiteAssistantCredentialRecord,
  SiteAssistantCredentialView,
  ResolvedSiteAssistantCredential,
} from "./site-credential-store.js";
// ADR-006 rule-of-two in-memory adapter — `server/app.ts`'s hermetic composition root.
export { InMemorySiteAssistantCredentialRepo } from "./site-credential-store.memory.js";

// `db/sqlite/site-credential-repo.sqlite.ts` picks up `SiteAssistantCredentialRepoPort`/
// `SiteAssistantCredentialRecord` from here too — the port type genuinely belongs to this domain
// (sealed keys, masked views), not to `db`; see the trace report §3.2 for why that direction is
// correct hexagonal shape, not a defect to fix.

// ---------------------------------------------------------------------------------------------
// C — BYOK In-Process Execution (admin)
//
// The admin dock's provider-direct "API · BYOK" run path (ADR-049), a second execution mode
// alongside the Local CLI daemon proxy in section D. Consumed by `server/modules/assistant-byok.ts`
// (the composition point) plus the execution-credential CRUD routes.
// ---------------------------------------------------------------------------------------------
export {
  getExecutionCredential,
  setExecutionCredential,
  deleteExecutionCredential,
  // The read path, exported alongside the CRUD three because it now has a SECOND consumer beyond
  // `byok-credential.ts`'s stored port: `routes/assistant/stored-credential-probe.ts` opens the same
  // row so a probe can run against a key the browser does not hold.
  resolveExecutionCredential,
  ExecutionCredentialValidationError,
  ExecutionCredentialSecretStoreUnconfiguredError,
} from "./execution-credential-store.js";
export type {
  AdminExecutionCredentialRepoPort,
  AdminExecutionCredentialRecord,
  AdminExecutionCredentialView,
} from "./execution-credential-store.js";
export { InMemoryAdminExecutionCredentialRepo } from "./execution-credential-store.memory.js";

export { ensureExecutionSettingDefinitions } from "./execution-mode-settings.js";

// `createRequestSuppliedExecutionCredentialPort` (the request-only port variant) has no external
// caller today — kept internal. `createStoredExecutionCredentialPort` is the one
// `assistant-byok.ts` actually constructs.
export { createStoredExecutionCredentialPort } from "./byok-credential.js";
export type { ExecutionCredentialPort, ResolvedByokCredential, RequestSuppliedByokConfig } from "./byok-credential.js";

export { runByokProviderTurn } from "./byok-provider-turn.js";
export type {
  ByokChatMessage,
  ByokProtocol,
  ByokProviderTurnResult,
  ByokToolCall,
  ByokToolResult,
  ByokTurnEvent,
} from "./byok-provider-turn.js";

export { createByokToolSurface } from "./byok-tool-surface.js";
export type { ByokToolSurface, ByokToolSurfaceDeps } from "./byok-tool-surface.js";

// ---------------------------------------------------------------------------------------------
// D — Admin Daemon Proxy / Process Composition
//
// Consumed by `server/modules/assistant.ts` (the Local CLI daemon-proxy composition — most of these
// files have exactly one external importer, this module) plus `src/index.ts` (the process entry
// point, for daemon-lifecycle concerns).
// ---------------------------------------------------------------------------------------------
export { A2UI_ACTIONS_PATH, a2uiNotPendingBody, deliverA2uiAction, readA2uiAction } from "./a2ui-actions-route.js";
export { AGENT_DAEMON_TOKEN_ENV_VAR, ensureAgentDaemonToken } from "./daemon-access.js";
export { AGENT_DAEMON_EXIT_CODE } from "./daemon-exit-codes.js";
// Process-spawning daemon lifecycle belongs to server/runtime/lifecycle/daemon-supervisor.ts;
// re-exporting it here would create an assistant -> server dependency. The pure respawn policy
// remains public so the supervisor and its tests share crash-loop/backoff decisions.
export { createRespawnPolicy } from "./daemon-respawn-policy.js";
export type { RespawnDecision, RespawnPolicy } from "./daemon-respawn-policy.js";
export { getLiveClaudeModels, unionModels } from "./live-model-cache.js";
export { isMcpUiToolCallAllowed, isMcpUiToolCallPermitted } from "./mcp-ui-tool-calls.js";
export { MCP_UI_TOOL_CALLS_PATH, isTypedSurfaceAnswer } from "./mcp-ui-tool-calls-route.js";
// `UIResource`/`MCP_UI_MIME_TYPE` are the MCP-UI wire-format contract `mcp-ui.ts` declares —
// `features/post`'s own agent-tools tests build/assert against this exact shape to verify their
// tool output conforms to it, the same "consumer needs the port's own type" reasoning as any other
// cross-module port. The rest of `mcp-ui.ts` (`createUIResource`, `buildUIToolResult`, etc.) stays
// un-re-exported — no external caller constructs a `UIResource` today, only reads/asserts on one.
export { MCP_UI_MIME_TYPE } from "./mcp-ui.js";
export type { UIResource } from "./mcp-ui.js";
export { RUN_PRINCIPAL_HEADER } from "./daemon-access.js";

// Cross-domain consumers import the Jini exchange owner directly. Keep only the symbol pair
// the server's assistant module needs here, so the curated barrel does not widen its consumers.
export { SURFACE_EXCHANGE_ID_PARAM } from "@jini-ai/daemon/surface-exchanges";
export type { SurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";

// ---------------------------------------------------------------------------------------------
// E — External MCP Federation (registry)
//
// Settings -> External MCP admin CRUD, plus the deliberate plugin-registration seam
// `mcp-federation/{config,presets}.ts` (Category 3 in the trace report — a first-party plugin
// registering itself against a public registry is the designed extension point, not a leak; kept
// exposed here on purpose rather than chased to 0).
// ---------------------------------------------------------------------------------------------
export {
  listExternalMcpServerViews,
  saveExternalMcpServer,
  deleteExternalMcpServer,
  ExternalMcpValidationError,
  ExternalMcpSecretStoreUnconfiguredError,
  // The admin probe route (`routes/admin/
  // external-mcp/probe.ts`) resolves ONE server's live connection target the same way the daemon's
  // boot path does, so it can open its own short-lived session and ask `tools/list` — reusing this
  // pair rather than re-deriving credential/target resolution a second time.
  readEnabledExternalMcpConfigs,
  toResolvedFederatedConnections,
  resolveExternalMcpAuthMode,
  resolveExternalMcpOAuthStatus,
  externalMcpRecordHasStaticAccessToken,
} from "./external-mcp-store.js";
export type {
  ExternalMcpAuthMode,
  ExternalMcpOAuthStatus,
  ExternalMcpOAuthTokenResolverPort,
  ExternalMcpServerRepoPort,
  ExternalMcpServerRecord,
  ExternalMcpServerView,
  SaveExternalMcpOAuthInput,
  SaveExternalMcpServerInput,
  ExternalMcpServerConfig,
  // Plugin activation uses the same public store contract.
  ExternalMcpStoreDeps,
} from "./external-mcp-store.js";
export { InMemoryExternalMcpServerRepo } from "./external-mcp-store.memory.js";
export { InMemoryExternalMcpToolApprovalRepo, createInMemoryConversationToolApprovalStore } from "./external-mcp-tool-approval-adapters.js";
export {
  type ConversationToolApprovalStore,
  type ExternalMcpToolApprovalRecord,
  type ExternalMcpToolApprovalRepoPort,
} from "./external-mcp-tool-approval-ports.js";

// The OAuth half of the same surface — `authMode: "oauth"` connections. Exposed through this barrel
// rather than deep-imported so the `no-deep-imports:assistant` boundary rule keeps holding for the
// server routes and the composition roots that consume it.
export {
  createDeviceAuthorizationStore,
  createExternalMcpConnectionGate,
  createExternalMcpOAuthService,
  ExternalMcpReauthRequiredError,
  externalMcpSettingsDeepLink,
} from "./external-mcp-oauth.js";
export type {
  DeviceAuthorizationStore,
  ExternalMcpConnectStart,
  ExternalMcpOAuthDeps,
  ExternalMcpOAuthService,
} from "./external-mcp-oauth.js";

export { FEDERATED_CONNECTION_DEFAULTS, isFederationEnabled, parseAllowedToolNames, positiveIntOrDefault } from "@jini-ai/mcp/federation";
export type { ResolvedFederatedConnection } from "@jini-ai/mcp/federation";
// The admin probe is the other external consumer of the hosted MCP
// transport besides `mcp-federation/bootstrap.ts` itself — the admin probe route needs to open the
// exact same kind of short-lived session bootstrap.ts's `defaultConnect` opens for a `streamable_http`
// launch spec, so it can list a remote's tools on demand instead of waiting for the next daemon boot.
// `adapter.stdio.ts` stays unexported and unreached from here: D-7 restricts the probe to hosted
// connections only, so nothing outside `assistant/` needs the stdio transport's spawn path.
export { connectMcpHttpSession, createFetchMcpHttpExchange } from "./mcp-federation/adapter.http.js";
export { registerFederatedMcpPreset } from "./mcp-federation/presets.js";

// Roster-change fan-out: the seam that lets `put.ts`/`oauth-callback.ts`/
// `features/external-mcp/tool-registrations.ts` announce a saved or newly connected row without
// knowing how many federation runtimes exist in this process — see `external-mcp-roster-change.ts`'s
// own header. `onExternalMcpRosterChanged` is exported for the composition roots
// (`server/runtime/composition/app.ts`, `server/inbound/assistant/agent-daemon-server.ts`) that
// register a runtime's reload under a key; `resetExternalMcpRosterChangeListenersForTests` is exported
// for tests that rebuild those roots more than once in the same process.
export {
  notifyExternalMcpRosterChanged,
  onExternalMcpRosterChanged,
  resetExternalMcpRosterChangeListenersForTests,
} from "./external-mcp-roster-change.js";
export type { ExternalMcpRosterChangeListener } from "./external-mcp-roster-change.js";

// ---------------------------------------------------------------------------------------------
// E2 — AI-Tool Contribution Registry
//
// Host contribution contracts: see tool-contribution-registry.ts for ownership and dependency direction.
// ---------------------------------------------------------------------------------------------
export type { AssistantToolContributions, DerivedToolContributor, ToolContributor } from "./tool-contribution-registry.js";

// A SIBLING registry, not a field on `ToolContributor` above: a resource's "how do I copy myself"
// contribution to `content_duplicate` (`features/content-duplication/`) is a different concern from
// its "what tools do I expose" contribution — see `duplicate-resource-registry.ts`'s own header for
// the full rationale, including why the actual `registerDuplicateResourceHandler` calls live at the
// composition root (`tool-catalog-manifest.ts`) rather than inside each resource feature itself.
export { registerDuplicateResourceHandler, listDuplicateResourceHandlers, resetDuplicateResourceHandlersForTests } from "./duplicate-resource-registry.js";
export type { DuplicateResourceHandler, DuplicateResourceHandlerContributor } from "./duplicate-resource-registry.js";

// ---------------------------------------------------------------------------------------------
// F — Chat History Persistence (composition-root wiring)
//
// `persistence/store-factory.ts` picks the concrete `ChatStoreFactory` (SQLite vs. in-memory) —
// Category 3, an ADR-006 composition root selecting an adapter, not a leak. Consumed by
// `server/app.ts` and `server/deps.ts`.
// ---------------------------------------------------------------------------------------------
export { createChatStoreFactory, createInMemoryChatHistory, createInMemoryChatStoreFactory } from "./persistence/store-factory.js";
export { createChatRunLedger, type ChatRunLedger, type RunSettlement } from "./persistence/run-ledger.js";
export type { ChatStoreFactory } from "./persistence/tenant-scope.js";

// `persistence/agent-session-store.ts`'s SQLite/in-memory pair, same ADR-006 "composition root
// selects the adapter" shape as the chat-history pair immediately above, for the same two
// consumers (`server/app.ts` and `server/deps.ts`) plus `agent-daemon-server.ts`'s `onStarted` —
// the per-conversation agent-CLI session id lookup that backs `AgentExecutorRunInput.resumeSessionId`/
// `.newSessionId` (`RunEndPayload.sessionRef`'s round trip, `@jini-ai/protocol`'s doc on that field).
// `AgentSessionStore` (the type) stays un-re-exported here, same "routes/types.ts deep-imports it
// instead" treatment as `ChatStoreFactory` above — see this file's own header.
export { createSqliteAgentSessionStore, createInMemoryAgentSessionStore } from "./persistence/agent-session-store.js";
