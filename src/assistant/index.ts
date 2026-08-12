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
 */

// ---------------------------------------------------------------------------------------------
// A — Site Assistant (public/visitor-facing runtime)
//
// The anonymous-visitor chat's server-side surface (ADR-054, SPEC-046). Consumed almost entirely by
// `server/modules/site-assistant.ts`'s SSE route composition.
// ---------------------------------------------------------------------------------------------
export { createSiteCapabilityRegistry } from "./site/capability-registry";
export type {
  SiteCapabilityRegistry,
  SiteCapabilityInvocation,
  SiteCapabilityOutcome,
  SiteAssistantCallerClass,
} from "./site/capability-registry";

export { detectsExplicitNavigationIntent } from "./site/client-directives";
// `ClientDirective`/`PageAction`/`ResolvedPublicTarget` are reachable from `SiteCapabilityOutcome`'s
// `directive` field above, not imported directly anywhere today — kept public because a registry
// consumer that reads `outcome.directive` needs these names to type it. `resolvePublicTarget` itself
// (the function) has no external caller — `site/tools.ts` is the only user, inside this module —
// so it stays un-re-exported.
export type { ClientDirective, PageAction, ResolvedPublicTarget } from "./site/client-directives";

export { resolveBoundedHistory } from "./site/history";

export { resolveSiteAssistantMode } from "./site/mode";
export type { SiteAssistantMode, SiteAssistantModeResolution } from "./site/mode";

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
} from "./public-assistant-settings";
export type { PublicAssistantSettings, PublicAssistantSettingKey } from "./public-assistant-settings";

export {
  getSiteAssistantCredential,
  setSiteAssistantCredential,
  deleteSiteAssistantCredential,
  resolveSiteAssistantApiKey,
  SiteAssistantCredentialValidationError,
  SiteAssistantSecretStoreUnconfiguredError,
} from "./site-credential-store";
export type {
  SiteAssistantCredentialRepoPort,
  SiteAssistantCredentialRecord,
  SiteAssistantCredentialView,
  ResolvedSiteAssistantCredential,
} from "./site-credential-store";
// ADR-006 rule-of-two in-memory adapter — `server/app.ts`'s hermetic composition root.
export { InMemorySiteAssistantCredentialRepo } from "./site-credential-store.memory";

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
  ExecutionCredentialValidationError,
  ExecutionCredentialSecretStoreUnconfiguredError,
} from "./execution-credential-store";
export type {
  AdminExecutionCredentialRepoPort,
  AdminExecutionCredentialRecord,
  AdminExecutionCredentialView,
} from "./execution-credential-store";
export { InMemoryAdminExecutionCredentialRepo } from "./execution-credential-store.memory";

export { ensureExecutionSettingDefinitions } from "./execution-mode-settings";

// `createRequestSuppliedExecutionCredentialPort` (the request-only port variant) has no external
// caller today — kept internal. `createStoredExecutionCredentialPort` is the one
// `assistant-byok.ts` actually constructs.
export { createStoredExecutionCredentialPort } from "./byok-credential";
export type { ExecutionCredentialPort, ResolvedByokCredential, RequestSuppliedByokConfig } from "./byok-credential";

export { runByokProviderTurn } from "./byok-provider-turn";
export type { ByokChatMessage, ByokProviderTurnResult, ByokTurnEvent } from "./byok-provider-turn";

export { createByokToolSurface } from "./byok-tool-surface";
export type { ByokToolSurface } from "./byok-tool-surface";

// ---------------------------------------------------------------------------------------------
// D — Admin Daemon Proxy / Process Composition
//
// Consumed by `server/modules/assistant.ts` (the Local CLI daemon-proxy composition — most of these
// files have exactly one external importer, this module) plus `src/index.ts` (the process entry
// point, for daemon-lifecycle concerns).
// ---------------------------------------------------------------------------------------------
export { A2UI_ACTIONS_PATH } from "./a2ui-actions-route";
export { AGENT_DAEMON_TOKEN_ENV_VAR, ensureAgentDaemonToken } from "./daemon-auth";
export { AGENT_DAEMON_EXIT_CODE } from "./daemon-exit-codes";
export { getLiveClaudeModels, unionModels } from "./live-model-cache";
export { isMcpUiToolCallAllowed } from "./mcp-ui-tool-calls";
export { MCP_UI_TOOL_CALLS_PATH } from "./mcp-ui-tool-calls-route";
export { RUN_PRINCIPAL_HEADER } from "./run-ownership";

// `surface-exchanges.ts` — INTERIM. The 2026-08-13 architecture audit (item 7) proposes physically
// relocating this file's public contract to `core/`, because `features/post/{delete-confirmation-ui,
// tool-registrations}.ts` also depend on it and a sideways `features/post -> assistant` edge is one
// of the two known `assistant<->server`-adjacent module-cycle contributors. Only the ONE symbol pair
// `server/modules/assistant.ts` actually needs is re-exported here; `askOnce`,
// `createSurfaceExchangeStore`, and the `AssistantSurfaceDeps`/`SurfaceExchange` types stay
// un-re-exported because their only external consumers are the two `features/post` files the audit
// item is about to move, not this module's own barrel. Once item 7 lands, this line's source simply
// changes (`export { SURFACE_EXCHANGE_ID_PARAM, type SurfaceExchangeStore } from "../core/
// surface-exchanges"` or wherever it ends up) and `server/modules/assistant.ts`'s import stays
// byte-identical (`from "#src/assistant"`). Whoever executes item 7 should update this comment.
export { SURFACE_EXCHANGE_ID_PARAM } from "./surface-exchanges";
export type { SurfaceExchangeStore } from "./surface-exchanges";

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
} from "./external-mcp-store";
export type { ExternalMcpServerRepoPort, ExternalMcpServerRecord, ExternalMcpServerView } from "./external-mcp-store";
export { InMemoryExternalMcpServerRepo } from "./external-mcp-store.memory";

export { FEDERATED_CONNECTION_DEFAULTS, isFederationEnabled, parseAllowedToolNames, positiveIntOrDefault } from "./mcp-federation/config";
export type { ResolvedFederatedConnection } from "./mcp-federation/config";
export { registerFederatedMcpPreset } from "./mcp-federation/presets";

// ---------------------------------------------------------------------------------------------
// F — Chat History Persistence (composition-root wiring)
//
// `persistence/store-factory.ts` picks the concrete `ChatStoreFactory` (SQLite vs. in-memory) —
// Category 3, an ADR-006 composition root selecting an adapter, not a leak. Consumed by
// `server/app.ts` and `server/deps.ts`.
// ---------------------------------------------------------------------------------------------
export { createChatStoreFactory, createInMemoryChatStoreFactory } from "./persistence/store-factory";
export type { ChatStoreFactory } from "./persistence/tenant-scope";
