/**
 * @file Public surface (barrel) for `assistant` — ADR-009 §1: "A module's public contract is its
 * `index.ts`; boundary lint forbids deep imports." Six sibling modules already carry this shape
 * (`http`, `mail`, `members`, `navigation`, `media`, `seo`); `assistant` was the one large module
 * that never got it (traced in full: `ADS-memory/reports/architecture/
 * 2026-08-13-api-surface-trace-assistant.md`, 27 deep-imported files / 59 edges).
 *
 * This is a CURATED door, not a re-export of everything `assistant/**` exports. Every symbol below
 * was confirmed, by direct read of every external importer, to have a real external consumer today
 * — or to be the return-type shape of a function that does. Internal-only helpers (e.g.
 * `resolvePublicTarget`, `resolveExecutionCredential`, the meta-tool descriptor set, the run-owner
 * registry) stay un-re-exported: nothing outside `assistant/` uses them, so exposing them here would
 * widen the surface this file exists to close. Deps/Input parameter types are likewise omitted
 * unless a consumer explicitly type-imports one today — every call site outside this module builds
 * those objects as inline literals, which TypeScript accepts structurally without the exported name.
 *
 * Organized into six sections, matching the six independent consumer clusters the trace found.
 *
 * NOT re-exported here FOR `routes/types.ts`'s USE: `ChatStoreFactory` (`./persistence/tenant-scope`),
 * `AgentSessionStore` (`./persistence/agent-session-store`, added 2026-08-30 alongside its store
 * factories — same "routes/types.ts deep-imports the type, this barrel exports only the value
 * factories" split as `ChatStoreFactory`), `SiteAssistantCredentialRepoPort`
 * (`./site-credential-store`), `AdminExecutionCredentialRepoPort` (`./execution-credential-store`),
 * `ExternalMcpServerRepoPort` (`./external-mcp-store`), and `ExternalMcpOAuthService`
 * (`./external-mcp-oauth`, added 2026-08-25 — it IS exported below for every other consumer, but
 * `routes/types.ts` deep-imports it for the reason that follows). All six are otherwise-qualifying
 * type-only symbols that `server/routes/types.ts` imports directly instead — deliberately, not an
 * oversight.
 * `routes/types.ts` defines `RouteDeps`, a god-type with ~22 landing imports across `server/routes/**`
 * (2026-08-13 architecture audit). Measured empirically (`npm run check:architecture`, propagation
 * cost = mean fraction of the file graph reachable from each file): routing those 3 lines through
 * this barrel alone moved repo-wide propagation cost from 7.6% to 12.43% — reverting only them
 * recovered it to 8.20%, confirmed by isolating `routes/types.ts` from every other consumer in a
 * worktree bisection. The mechanism: `buildFileGraph` (`development/scripts/check-architecture.ts`)
 * does not distinguish `import type` from value imports, so these three type-only lines are graph
 * edges like any other; and because `routes/types.ts` has enormous fan-IN (every route file depends
 * on it), inflating ITS reachable set transitively inflates every one of its ~22 dependents' own
 * reachable sets too. Composition roots (`app.ts`/`deps.ts`) route through this barrel fine — they
 * have near-zero fan-in, so their own reachable-set growth stays local and costs the metric almost
 * nothing. A "six narrow doors" split (one file per section below) was also measured and rejected:
 * 11.79% propagation / 7 exposed files — worse on both axes than reverting just these 3 lines, because
 * `routes/types.ts` alone needs symbols spanning 4 of the 6 sections regardless of door width. Full
 * writeup: `ADS-memory/reports/architecture/2026-08-13-propagation-cost-barrel-attribution.md`
 * (Result 2 + the FixAssistant addendum). If `routes/types.ts` is ever split or its god-type status
 * resolved, re-evaluate whether these 4 symbols can safely route through this barrel again.
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
// The largest cluster (26 of the 59 traced edges). Straddles the admin CRUD routes, both
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
export { AGENT_DAEMON_TOKEN_ENV_VAR, ensureAgentDaemonToken } from "./daemon-auth.js";
export { AGENT_DAEMON_EXIT_CODE } from "./daemon-exit-codes.js";
// `startAssistantDaemon`/`restartAssistantDaemon`/`ensureAssistantDaemonStarted` moved to
// `server/runtime/lifecycle/daemon-supervisor.ts` (2026-08-17) — that file is now part of the `server`
// module itself, so its three real callers (`index.ts`, `server/modules/assistant.ts`,
// `server/routes/admin/system/assistant-daemon.ts`) import it directly rather than through this
// barrel; re-exporting it here would create an `assistant -> server` edge this barrel exists to
// avoid.
//
// `createRespawnPolicy`/`RespawnDecision`/`RespawnPolicy`, unlike the daemon-supervisor functions
// above, stay re-exported: `daemon-respawn-policy.ts` is a pure decision module (no `assistant ->
// server` edge risk the same way daemon-supervisor.ts's own process-spawning code carries), and it
// has a real external consumer of its own — `server/runtime/lifecycle/daemon-supervisor.ts` (the file
// described above) plus that file's own test — needing the SAME crash-loop/backoff decision logic
// the daemon-supervisor code was split out to keep pure and unit-testable in isolation (2026-08-13
// no-deep-imports:assistant triage).
export { createRespawnPolicy } from "./daemon-respawn-policy.js";
export type { RespawnDecision, RespawnPolicy } from "./daemon-respawn-policy.js";
export { getLiveClaudeModels, unionModels } from "./live-model-cache.js";
export { isMcpUiToolCallAllowed } from "./mcp-ui-tool-calls.js";
export { MCP_UI_TOOL_CALLS_PATH, isTypedSurfaceAnswer } from "./mcp-ui-tool-calls-route.js";
// `UIResource`/`MCP_UI_MIME_TYPE` are the MCP-UI wire-format contract `mcp-ui.ts` declares —
// `features/post`'s own agent-tools tests build/assert against this exact shape to verify their
// tool output conforms to it, the same "consumer needs the port's own type" reasoning as any other
// cross-module port. The rest of `mcp-ui.ts` (`createUIResource`, `buildUIToolResult`, etc.) stays
// un-re-exported — no external caller constructs a `UIResource` today, only reads/asserts on one.
export { MCP_UI_MIME_TYPE } from "./mcp-ui.js";
export type { UIResource } from "./mcp-ui.js";
export { RUN_PRINCIPAL_HEADER } from "./run-ownership.js";

// `tool-surface-exchanges.ts` now lives in `core/` (2026-08-13 architecture audit item 7, executed
// 2026-08-17) — `features/post/{delete-confirmation-ui, tool-registrations}.ts` and the other
// cross-module consumers import it directly from `#src/contracts/core/tool-surface-exchanges` now, not through
// this barrel. Only the ONE symbol pair `server/modules/assistant.ts` actually needs stays
// re-exported here, byte-identical for that caller (`from "#src/assistant/index"` or `"../../assistant"`).
export { SURFACE_EXCHANGE_ID_PARAM } from "../contracts/core/tool-surface-exchanges.js";
export type { SurfaceExchangeStore } from "../contracts/core/tool-surface-exchanges.js";

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
  // Added 2026-08-26 (write-tools outline, C-007): the admin probe route (`routes/admin/
  // external-mcp/probe.ts`) resolves ONE server's live connection target the same way the daemon's
  // boot path does, so it can open its own short-lived session and ask `tools/list` — reusing this
  // pair rather than re-deriving credential/target resolution a second time.
  readEnabledExternalMcpConfigs,
  toResolvedFederatedConnections,
  resolveExternalMcpAuthMode,
  resolveExternalMcpOAuthStatus,
  // Added 2026-09-13 (features/supabase-connect, SPEC-052): `supabase_set_project_scope` opens the
  // `supabase` row's sealed static access token to list the account's projects — the same opener
  // the store's own boot path uses, rather than a second decrypt path.
  openExternalMcpOAuthPayload,
} from "./external-mcp-store.js";
export {
  SUPABASE_MCP_URL,
  buildScopedSupabaseMcpUrl,
  isSupabaseMcpUrl,
  readSupabaseMcpScope,
  supabaseMcpScopeFailure,
} from "./supabase-mcp-scope.js";
export type {
  ExternalMcpAuthMode,
  ExternalMcpOAuthStatus,
  ExternalMcpOAuthTokenResolverPort,
  ExternalMcpServerRepoPort,
  ExternalMcpServerRecord,
  ExternalMcpServerView,
  SaveExternalMcpOAuthInput,
  // Added 2026-09-07 (features/external-mcp/tool-registrations.ts, wiring external_mcp_save): the
  // OAuth half was already exported above; the top-level save input was not, forcing a deep import
  // straight into `external-mcp-store.ts` (a `no-deep-imports:assistant` warning) for no reason but
  // this one missing re-export.
  SaveExternalMcpServerInput,
  // Added 2026-08-26, same reason as the value export above.
  ExternalMcpServerConfig,
  // Added 2026-09-10 (features/agent-plugins/federate-mcp.ts, wiring a plugin's declared remote MCP
  // servers into this same store on activation): same missing-re-export reasoning as
  // `SaveExternalMcpServerInput` above — `saveExternalMcpServer`'s own first parameter had no
  // re-export, forcing a deep import for no reason but this one gap.
  ExternalMcpStoreDeps,
} from "./external-mcp-store.js";
export { InMemoryExternalMcpServerRepo } from "./external-mcp-store.memory.js";

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

export { FEDERATED_CONNECTION_DEFAULTS, isFederationEnabled, parseAllowedToolNames, positiveIntOrDefault } from "./mcp-federation/config.js";
export type { ResolvedFederatedConnection } from "./mcp-federation/config.js";
// Added 2026-08-26 (write-tools outline, C-007): the ONLY other external consumer of the hosted MCP
// transport besides `mcp-federation/bootstrap.ts` itself — the admin probe route needs to open the
// exact same kind of short-lived session bootstrap.ts's `defaultConnect` opens for a `streamable_http`
// launch spec, so it can list a remote's tools on demand instead of waiting for the next daemon boot.
// `adapter.stdio.ts` stays unexported and unreached from here: D-7 restricts the probe to hosted
// connections only, so nothing outside `assistant/` needs the stdio transport's spawn path.
export { connectMcpHttpSession, createFetchMcpHttpExchange } from "./mcp-federation/adapter.http.js";
export { registerFederatedMcpPreset } from "./mcp-federation/presets.js";

// ---------------------------------------------------------------------------------------------
// E2 — AI-Tool Contribution Registry
//
// The boot-installed seam a feature's own `tool-registrations.ts` calls to contribute its AI tools
// to the assistant's catalog, in place of `assistant/tool-registrations.ts` importing that feature
// by name (see `tool-contribution-registry.ts`'s own header for the full rationale — same
// registry shape as `registerFederatedMcpPreset` above, one section up). Re-exported here rather
// than deep-imported so a converting feature (today: `comments`, `newsletter`) gets the same
// "port, not a file path" seam every other cross-module consumer of this barrel does. `features/post`
// tried this seam too and reverted the same night — see `features/post/tool-registrations.ts`'s
// trailing comment for why (it opened a new module cycle through `widgets`/`export`).
//
// A sibling CONTENT-source registry (`capability-source-registry.ts`) and the
// `capability_search`/`capability_get` tool pair it fed used to live here as E3 — REMOVED
// 2026-08-26 (owner call): every installed Agent Plugin now gets its own real tool,
// `agent_plugin_<pluginId>` (`features/agent-plugins/tool-registrations.ts`), so a second
// discovery index was no longer worth the ambiguity of two surfaces for the model to guess
// between. See `ADS-memory/knowledge/2026-08-26-removed-capability-search.md`.
// ---------------------------------------------------------------------------------------------
export { registerToolContributor } from "./tool-contribution-registry.js";
export type { ToolContributor } from "./tool-contribution-registry.js";

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
export { createChatStoreFactory, createInMemoryChatStoreFactory } from "./persistence/store-factory.js";
export type { ChatStoreFactory } from "./persistence/tenant-scope.js";

// `persistence/agent-session-store.ts`'s SQLite/in-memory pair, same ADR-006 "composition root
// selects the adapter" shape as the chat-history pair immediately above, added for the same two
// consumers (`server/app.ts` and `server/deps.ts`) plus `agent-daemon-server.ts`'s `onStarted` —
// the per-conversation agent-CLI session id lookup that backs `AgentExecutorRunInput.resumeSessionId`/
// `.newSessionId` (`RunEndPayload.sessionRef`'s round trip, `@jini-ai/protocol`'s doc on that field).
// `AgentSessionStore` (the type) stays un-re-exported here, same "routes/types.ts deep-imports it
// instead" treatment as `ChatStoreFactory` above — see this file's own header.
export { createSqliteAgentSessionStore, createInMemoryAgentSessionStore } from "./persistence/agent-session-store.js";
