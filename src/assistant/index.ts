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
 * NOT re-exported here: `ChatStoreFactory` (`./persistence/tenant-scope`), `SiteAssistantCredentialRepoPort`
 * (`./site-credential-store`), `AdminExecutionCredentialRepoPort` (`./execution-credential-store`), and
 * `ExternalMcpServerRepoPort` (`./external-mcp-store`). All four are otherwise-qualifying type-only
 * symbols that `server/routes/types.ts` imports directly instead — deliberately, not an oversight.
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
export type { ByokChatMessage, ByokProviderTurnResult, ByokTurnEvent } from "./byok-provider-turn.js";

export { createByokToolSurface } from "./byok-tool-surface.js";
export type { ByokToolSurface, ByokToolSurfaceDeps } from "./byok-tool-surface.js";

// ---------------------------------------------------------------------------------------------
// D — Admin Daemon Proxy / Process Composition
//
// Consumed by `server/modules/assistant.ts` (the Local CLI daemon-proxy composition — most of these
// files have exactly one external importer, this module) plus `src/index.ts` (the process entry
// point, for daemon-lifecycle concerns).
// ---------------------------------------------------------------------------------------------
export { A2UI_ACTIONS_PATH } from "./a2ui-actions-route.js";
export { AGENT_DAEMON_TOKEN_ENV_VAR, ensureAgentDaemonToken } from "./daemon-auth.js";
export { AGENT_DAEMON_EXIT_CODE } from "./daemon-exit-codes.js";
// `startAssistantDaemon`/`restartAssistantDaemon`/`ensureAssistantDaemonStarted` moved to
// `server/agent-daemon/daemon-supervisor.ts` (2026-08-17) — that file is now part of the `server`
// module itself, so its three real callers (`index.ts`, `server/modules/assistant.ts`,
// `server/routes/admin/system/assistant-daemon.ts`) import it directly rather than through this
// barrel; re-exporting it here would create an `assistant -> server` edge this barrel exists to
// avoid.
//
// `createRespawnPolicy`/`RespawnDecision`/`RespawnPolicy`, unlike the daemon-supervisor functions
// above, stay re-exported: `daemon-respawn-policy.ts` is a pure decision module (no `assistant ->
// server` edge risk the same way daemon-supervisor.ts's own process-spawning code carries), and it
// has a real external consumer of its own — `server/agent-daemon/daemon-supervisor.ts` (the file
// described above) plus that file's own test — needing the SAME crash-loop/backoff decision logic
// the daemon-supervisor code was split out to keep pure and unit-testable in isolation (2026-08-13
// no-deep-imports:assistant triage).
export { createRespawnPolicy } from "./daemon-respawn-policy.js";
export type { RespawnDecision, RespawnPolicy } from "./daemon-respawn-policy.js";
export { getLiveClaudeModels, unionModels } from "./live-model-cache.js";
export { isMcpUiToolCallAllowed } from "./mcp-ui-tool-calls.js";
export { MCP_UI_TOOL_CALLS_PATH } from "./mcp-ui-tool-calls-route.js";
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
// cross-module consumers import it directly from `#src/core/tool-surface-exchanges` now, not through
// this barrel. Only the ONE symbol pair `server/modules/assistant.ts` actually needs stays
// re-exported here, byte-identical for that caller (`from "#src/assistant/index"` or `"../../assistant"`).
export { SURFACE_EXCHANGE_ID_PARAM } from "../core/tool-surface-exchanges.js";
export type { SurfaceExchangeStore } from "../core/tool-surface-exchanges.js";

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
} from "./external-mcp-store.js";
export type { ExternalMcpServerRepoPort, ExternalMcpServerRecord, ExternalMcpServerView } from "./external-mcp-store.js";
export { InMemoryExternalMcpServerRepo } from "./external-mcp-store.memory.js";

export { FEDERATED_CONNECTION_DEFAULTS, isFederationEnabled, parseAllowedToolNames, positiveIntOrDefault } from "./mcp-federation/config.js";
export type { ResolvedFederatedConnection } from "./mcp-federation/config.js";
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
// ---------------------------------------------------------------------------------------------
export { registerToolContributor } from "./tool-contribution-registry.js";
export type { ToolContributor } from "./tool-contribution-registry.js";

// ---------------------------------------------------------------------------------------------
// E3 — Capability Source Registry
//
// The sibling seam a CONTENT source (today: `features/agent-plugins/capability-source.ts`)
// registers into, so `capability-tool-registrations.ts`'s `capability_search`/`capability_get`
// pair can discover every source without importing any of them by name — see
// `capability-source-registry.ts`'s own header for why this is a second registry rather than
// folded into E2 above (tool contributors vs. content sources are different shapes). Re-exported
// here rather than deep-imported for the identical reason E2 is: a registering feature gets the
// same "port, not a file path" seam every other cross-module consumer of this barrel does.
// ---------------------------------------------------------------------------------------------
export { registerCapabilitySource } from "./capability-source-registry.js";
export type { CapabilityCard, CapabilitySource, CapabilitySourceContext } from "./capability-source-registry.js";

// `capability_search`/`capability_get` themselves (the tool pair E3 above feeds) are assistant's
// OWN content — unlike every `contribute<Domain>Tools()` in `server/tool-catalog-manifest.ts`,
// which reaches into a FOREIGN feature module, this one reaches into `assistant/` itself, so it
// belongs on this barrel exactly like `server/app.ts`'s/`server/deps.ts`'s own existing
// `assistant/index.js` imports do, not as a deep import into `capability-tool-registrations.ts`.
export { contributeCapabilityTools } from "./capability-tool-registrations.js";

// ---------------------------------------------------------------------------------------------
// F — Chat History Persistence (composition-root wiring)
//
// `persistence/store-factory.ts` picks the concrete `ChatStoreFactory` (SQLite vs. in-memory) —
// Category 3, an ADR-006 composition root selecting an adapter, not a leak. Consumed by
// `server/app.ts` and `server/deps.ts`.
// ---------------------------------------------------------------------------------------------
export { createChatStoreFactory, createInMemoryChatStoreFactory } from "./persistence/store-factory.js";
export type { ChatStoreFactory } from "./persistence/tenant-scope.js";
