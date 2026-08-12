# API-Surface Trace — `assistant` — 2026-08-13

**Role:** Software Architect (trace) + Refactor (propose-only). Both persona files loaded
(`AI-Dev-Shop/agents/software-architect/skills.md`, `AI-Dev-Shop/agents/refactor/skills.md`).
**Mandate: PROPOSE ONLY.** No production code was changed to produce this report — every file
this report touches was read, not edited.

**Scope:** `assistant` is the worst API-surface offender in the repo per `npm run check:architecture
-- --list`: **59 deep-import edges reaching 27 distinct files**, `I=0.44` (`Ca=59, Ce=46`) on the
Martin instability gradient. This report traces every one of those 27 files — who imports it, for
what, and what the honest fix is — and answers the module-split question the dispatch asked for.

---

## 0. Executive summary

- **Current: 27 exposed files / 59 edges.** After the proposed fix: **as low as 0** exposed files
  reachable by deep import, with a staged, conservative version leaving at most 2 (the
  `mcp-federation/` registry pair, kept exposed on purpose — see §4.5).
- **Category breakdown:** 0 files are Category 1 (dependency itself is wrong — none found, see
  §3.1). ~24 of 27 files are Category 2 (real dependency, wrong door — needs a curated public API).
  ~3 of 27 files are Category 3 (already-correct exposure — `mcp-federation/{config,presets}.ts`'s
  deliberate plugin-registration seam, and the `db/sqlite/*` adapters' port-type imports, which are
  the textbook-correct hexagonal direction, not a defect — see §3.2).
- **The fix is one curated `src/assistant/index.ts`,** organized into six independently-justified,
  independently-named sections (§4) — not an unfiltered barrel. This directly follows an
  already-accepted, already-repo-wide convention: **ADR-009 Decision §1, "a module's public surface
  is its `index.ts`; boundary lint forbids deep imports,"** already implemented by `seo`, `http`,
  `mail`, `members`, `navigation`, and `media`. `assistant` is the one large module that never got
  this treatment. §5 walks through, file by file, why this is not the barrel-laundering anti-pattern
  the dispatch brief warned against.
- **Split verdict: do not split the module now.** Considered seriously in §6 — the 27 files do
  cluster into distinct purposes, but two of the highest-traffic files (`public-assistant-settings.ts`,
  `site-credential-store.ts`) are genuinely shared across those clusters, so a split would either
  duplicate them or manufacture a *new* inter-module edge. Recommended: ship the index.ts fix now: it
  is safe, cheap, and does not foreclose a later split, since each of the six sections is already
  self-contained enough to be lifted into its own module verbatim if that is ever justified.
- **Interaction with the two known cycle sources (2026-08-13 architecture audit):** almost entirely
  **orthogonal**. This report changes only *which file* an external importer resolves to inside
  `assistant`; it never changes *which module* a file belongs to, so it moves the API-surface metric
  and nothing else — not the module-cycle count, not the SCC, not back-edges into `server`. The one
  point of real overlap is `surface-exchanges.ts`: the audit's item 7 proposes physically relocating
  its public contract to `core/`; this report proposes re-exporting it from `assistant/index.ts` in
  the meantime. §7 gives the concrete sequencing note.
- **What this report does not cover:** it does not re-verify the two known cycle sources
  (`agent-daemon-server.ts`, `byok-tool-surface.ts`'s `RouteDeps` import) — those are the other
  report's job and are treated here only as inputs. It does not exhaustively enumerate every
  exported symbol in every one of the 27 files (see §4.6 caveat) — the index.ts content in §4 is a
  first draft grounded in the traced edges, not a line-complete diff. It does not investigate
  `apps/admin`'s consumption of `assistant`-adjacent HTTP routes (out of scope — this traces
  `src/**` module imports only, matching what `check:architecture` measures).

---

## 1. Method

- `npm run check:architecture -- --list` run live for the baseline numbers above.
- `development/scripts/check-architecture.ts` read in full to confirm exactly what
  `moduleApiSurfaceFiles` counts: distinct files reached by a cross-module import whose target is
  **not** `src/<module>/index.ts` (test files and same-module edges excluded). Critically: the
  metric counts *distinct files*, not edges — a second import into an already-exposed file is free;
  exposing a **new** file is what the ratchet catches. This is why the fix below targets file
  count, not edge count.
- Ran `npx depcruise src --no-config --ts-pre-compilation-deps --ts-config tsconfig.json
  --do-not-follow node_modules --output-type json` directly (the same command
  `check-architecture.ts` shells out to) and post-processed it with the identical filtering logic
  (`moduleOf()`, test-file exclusion, `index.ts` exclusion) to get the **exact 27-file / 59-edge
  breakdown with importer identity** — the aggregate script only prints file/edge *counts* per
  target module, not who imports what. This is the ground truth for the table in §2.
- Every file in §2's "why" column was read in full (not inferred from its name or a grep snippet).
  Every importer's exact import statement was confirmed by direct grep/read, including catching two
  multi-line `import { a, b, c } from "..."` blocks a single-line grep missed on the first pass
  (`put-settings.ts`, `put-execution-credential.ts`, `external-mcp/put.ts`) — corrected before
  writing this table, not left as an inferred gap.
- `codebase-memory-mcp` was confirmed indexed and fresh (`head_sha` matches current `HEAD`,
  35,076 nodes) but the questions here were "which specific file imports which specific file, for
  which specific symbol" — a direct depcruise/grep/read pass answered that with exact edges and zero
  risk of the graph's own extraction missing a multi-line import, so it was used as the primary tool
  per the Refactor skill's Phase-0 gate guidance, the same choice the 2026-08-13 architecture audit
  made for the same reason.
- Cross-checked every claim in this report's evidence base against the 2026-08-13 architecture audit
  (`ADS-memory/reports/architecture/2026-08-13-architecture-audit.md` §4–§5) rather than re-deriving
  the cycle-source findings independently — those are inputs here, not re-verified from scratch.

---

## 2. The full accounting — all 27 files, all 59 edges

Grouped by file, descending importer count. "Category" per the dispatch brief's three-way test.

| # | file | importers (module: files) | edges | category | fix |
|---|---|---|---|---|---|
| 1 | `public-assistant-settings.ts` | server: `app.ts`, `deps.ts`, `modules/site-assistant.ts`, `routes/admin/assistant/{delete-site-credential,detect-agents,get-settings,get-site-credential,list-models,put-settings,put-site-credential,test-agent,test-connection}.ts`, `routes/site/{pages,products}.ts` | 14 | **2** | route through `assistant/index.ts` §4.1 |
| 2 | `site-credential-store.ts` | db: `sqlite/site-credential-repo.sqlite.ts` (type-only); server: `modules/site-assistant.ts`, `routes/admin/assistant/{delete-site-credential,get-site-credential,put-site-credential,stored-credential-probe}.ts`, `routes/types.ts` (type-only) | 7 | **2** (server), **3** (db — see §3.2) | route through `assistant/index.ts` §4.1/§4.2 |
| 3 | `execution-credential-store.ts` | db: `sqlite/execution-credential-repo.sqlite.ts` (type-only); server: `routes/admin/assistant/{delete-execution-credential,get-execution-credential,put-execution-credential}.ts`, `routes/types.ts` (type-only) | 5 | **2** (server), **3** (db) | route through `assistant/index.ts` §4.3/§4.2 |
| 4 | `external-mcp-store.ts` | db: `sqlite/external-mcp-repo.sqlite.ts` (type-only); server: `routes/admin/external-mcp/{delete,list,put}.ts`, `routes/types.ts` (type-only) | 5 | **2** (server), **3** (db) | route through `assistant/index.ts` §4.4/§4.2 |
| 5 | `surface-exchanges.ts` | features/post: `delete-confirmation-ui.ts`, `tool-registrations.ts`; server: `modules/assistant.ts` | 3 | **2** (server edge); **coordination needed** (features/post edges — see §7) | route the server edge now; defer the features/post edges to the cycle report's item 7 |
| 6 | `execution-mode-settings.ts` | server: `app.ts`, `deps.ts` | 2 | **2/3** (composition-root boot registration) | route through `assistant/index.ts` §4.3 |
| 7 | `persistence/store-factory.ts` | server: `app.ts`, `deps.ts` | 2 | **3** (composition root selecting a concrete factory — ADR-006 shape) | route through `assistant/index.ts` §4.6, optional |
| 8 | `daemon-auth.ts` | `src/index.ts`; server: `modules/assistant.ts` | 2 | **2/3** | route through `assistant/index.ts` §4.4 |
| 9 | `execution-credential-store.memory.ts` | server: `app.ts` | 1 | **3** (ADR-006 rule-of-two in-memory adapter, composition-root wiring) | optional route through `assistant/index.ts` §4.6 |
| 10 | `external-mcp-store.memory.ts` | server: `app.ts` | 1 | **3** | optional §4.6 |
| 11 | `site-credential-store.memory.ts` | server: `app.ts` | 1 | **3** | optional §4.6 |
| 12 | `persistence/tenant-scope.ts` | server: `routes/types.ts` (type-only, `ChatStoreFactory`) | 1 | **2** (type import feeding `RouteDeps`) | route through `assistant/index.ts` §4.6 |
| 13 | `a2ui-actions-route.ts` | server: `modules/assistant.ts` | 1 | **2** | route through `assistant/index.ts` §4.4 |
| 14 | `live-model-cache.ts` | server: `modules/assistant.ts` | 1 | **2** | route through `assistant/index.ts` §4.4 |
| 15 | `mcp-ui-tool-calls.ts` | server: `modules/assistant.ts` | 1 | **2** | route through `assistant/index.ts` §4.4 |
| 16 | `mcp-ui-tool-calls-route.ts` | server: `modules/assistant.ts` | 1 | **2** | route through `assistant/index.ts` §4.4 |
| 17 | `run-ownership.ts` | server: `modules/assistant.ts` | 1 | **2** | route through `assistant/index.ts` §4.4 |
| 18 | `byok-credential.ts` | server: `modules/assistant-byok.ts` | 1 | **2** | route through `assistant/index.ts` §4.3 |
| 19 | `byok-provider-turn.ts` | server: `modules/assistant-byok.ts` | 1 | **2** | route through `assistant/index.ts` §4.3 |
| 20 | `byok-tool-surface.ts` | server: `modules/assistant-byok.ts` | 1 | **2** | route through `assistant/index.ts` §4.3 (its own inbound `RouteDeps` import is the OTHER report's item 6 — orthogonal) |
| 21 | `site/capability-registry.ts` | server: `modules/site-assistant.ts` | 1 | **2** | route through `assistant/index.ts` §4.1 |
| 22 | `site/client-directives.ts` | server: `modules/site-assistant.ts` | 1 | **2** | route through `assistant/index.ts` §4.1 |
| 23 | `site/history.ts` | server: `modules/site-assistant.ts` | 1 | **2** | route through `assistant/index.ts` §4.1 |
| 24 | `site/mode.ts` | server: `modules/site-assistant.ts` | 1 | **2** | route through `assistant/index.ts` §4.1 |
| 25 | `mcp-federation/config.ts` | features/plugins: `supabase-mcp/supabase-mcp-plugin.ts` | 1 | **3** (deliberate registry extension point — own header names this exactly) | leave as-is, or fold into `assistant/index.ts` for uniformity — genuinely optional §4.5 |
| 26 | `mcp-federation/presets.ts` | features/plugins: `supabase-mcp/supabase-mcp-plugin.ts` | 1 | **3** | same as #25 |
| 27 | `daemon-exit-codes.ts` | `src/index.ts` | 1 | **2/3** | route through `assistant/index.ts` §4.4 |

**Total: 27 files, 59 edges — matches `check:architecture -- --list`'s reported "59 edges, 27 distinct
file(s) → assistant" exactly**, confirming the depcruise-based extraction above is complete and not
missing or double-counting anything.

---

## 3. Category 1 and Category 3 findings

### 3.1 Category 1 — none found

Every one of the 59 edges traces to a real, currently-exercised need, confirmed by reading both
sides of the edge (not inferred from the file or function name). None of the 27 files is imported
"by accident" or for a symbol the importer doesn't actually use. I looked specifically for the
easiest Category-1 candidates — a file imported for one narrow reason that could instead be solved
by the *importer* not needing it at all — and did not find one. Stating this plainly per the
dispatch brief's own instruction ("a truthful 'this part is actually correct' is a valid finding"):
**the defect in `assistant` is the absence of a front door, not a wrong dependency.**

### 3.2 Category 3 — genuinely correct exposure

**`mcp-federation/config.ts` and `mcp-federation/presets.ts`.** `presets.ts`'s own header states the
intent directly: "the seam that lets a concrete vendor integration live OUTSIDE `src/assistant/`
while still being part of the default boot... a preset imports core and announces itself; core never
learns any vendor's name," and explicitly invokes ADR-006/ADR-009 §3's registry exemption from the
rule-of-two. `features/plugins/supabase-mcp/supabase-mcp-plugin.ts` importing `config.ts`'s
`FEDERATED_CONNECTION_DEFAULTS`/`ResolvedFederatedConnection` and `presets.ts`'s
`registerFederatedMcpPreset` is *exactly* the designed extension point working as intended — a
first-party plugin module registering itself against a public registry. This is correct today and
needs no fix; folding it into `assistant/index.ts` is available but purely cosmetic (§4.5).

**`db/sqlite/{site-credential-repo,execution-credential-repo,external-mcp-repo}.sqlite.ts`'s
type-only imports.** These import `SiteAssistantCredentialRepoPort`/`SiteAssistantCredentialRecord`,
`AdminExecutionCredentialRepoPort`/`AdminExecutionCredentialRecord`, and
`ExternalMcpServerRepoPort`/`ExternalMcpServerRecord` — each a **domain-owned port type**, defined
next to the domain logic that requires it (masking rules, sealing/unsealing, view mapping), and
implemented by a `db/sqlite/*.sqlite.ts` adapter. This is the textbook-correct hexagonal direction:
the consumer of a port defines its shape; the adapter imports that shape to implement it. **This is
not the same defect the 2026-08-13 architecture audit found in `db<->features/database`** (there,
`db/sqlite/database-journal-repo.ts` importing `LedgerReadPort`/`BootLedgerPort` from
`features/database` was flagged as backwards because those port types describe *infrastructure*
concerns — a ledger/migration boundary — that arguably belong to `db` itself, not to a feature
module). The three ports here (`SiteAssistantCredentialRepoPort` etc.) describe **assistant-specific
business shapes** (sealed API keys, masked views, provider config) that have no meaning to `db` on
their own — moving them into `db/` would make `db` know about assistant's domain vocabulary, which
is a *worse* coupling than the status quo. Verdict: correct as-is, no fix needed for the dependency
direction itself. It is still recommended (not required) to route the type import through
`assistant/index.ts` for uniformity with the rest of the module, at zero cost (§4.2) — but that is
a routing change, not a correction of a defect.

---

## 4. The proposal — one curated `src/assistant/index.ts`, six named sections

### 4.0 Why this is the right shape, not a default reach

`assistant` currently has **no `index.ts` at all** — confirmed directly (`ls
src/assistant/index.ts` → no such file). That is not a stylistic gap; it is non-compliance with an
already-ACCEPTED, owner-signed decision already followed elsewhere in this exact repo:

> **ADR-009, Decision §1** ("Hybrid Decoupling," Status: ACCEPTED, 2026-07-01, Leon Aburime):
> "Synchronous commands/queries between modules → direct calls to the other module's public
> contract (its exported functions/ports)... **A module's public surface is its `index.ts`;
> boundary lint forbids deep imports.**"

Six other modules already implement this, each with its own `/** @file Public surface (barrel)
for ... */` header citing the same rule: `src/http/index.ts`, `src/mail/index.ts`,
`src/members/index.ts`, `src/navigation/index.ts`, `src/media/index.ts`, and — most directly
relevant as a template, since it is the same "settings + CRUD + cross-cutting helpers" shape
`assistant` has — `src/seo/index.ts` (which itself carries an explicit invariant, "INV-09 — every
consumer of persisted SEO data... must import from here"). `seo` is 2 edges / 2 files exposed today;
`assistant` is 59 / 27. The difference is not that `assistant`'s consumers behave worse — it is that
`seo` has a front door and `assistant` does not. This is compliance work bringing `assistant` to
parity with a pattern six sibling modules already use successfully, not a novel design.

### 4.1 Section A — Site Assistant (public/visitor-facing runtime)

Consumed almost entirely by `server/modules/site-assistant.ts` (the SSE route composition) plus two
gating call sites on the public site routes.

```ts
// site/capability-registry.ts
export { createSiteCapabilityRegistry } from "./site/capability-registry";
export type { SiteCapabilityRegistry, SiteCapabilityInvocation, SiteCapabilityOutcome, SiteAssistantCallerClass } from "./site/capability-registry";
// site/client-directives.ts
export { detectsExplicitNavigationIntent, resolvePublicTarget } from "./site/client-directives";
export type { ClientDirective, PageAction, ResolvedPublicTarget } from "./site/client-directives";
// site/history.ts
export { resolveBoundedHistory } from "./site/history";
// site/mode.ts
export { resolveSiteAssistantMode } from "./site/mode";
export type { SiteAssistantMode, SiteAssistantModeEnv, SiteAssistantModeResolution } from "./site/mode";
```

### 4.2 Section B — Assistant Settings & Credentials (admin CRUD + shared runtime read)

The largest cluster (26 of the 59 edges: 14 + 7 + 5). Straddles admin CRUD routes, the two
composition roots (`app.ts`/`deps.ts`), and the public-runtime read path (`isPublicAssistantEnabled`,
`resolveSiteAssistantApiKey`) — which is exactly why it is its own section rather than folded into
§4.1 or §4.3.

```ts
// public-assistant-settings.ts
export {
  ensurePublicAssistantSettingDefinitions, getPublicAssistantSettings, setPublicAssistantSettings,
  isPublicAssistantEnabled, ADMIN_ASSISTANT_PERMISSION, PublicAssistantSettingsValidationError,
} from "./public-assistant-settings";
export type { PublicAssistantSettings, PublicAssistantSettingKey } from "./public-assistant-settings";
// site-credential-store.ts
export {
  getSiteAssistantCredential, setSiteAssistantCredential, deleteSiteAssistantCredential,
  resolveSiteAssistantApiKey, SiteAssistantCredentialValidationError, SiteAssistantSecretStoreUnconfiguredError,
} from "./site-credential-store";
export type { SiteAssistantCredentialRepoPort, SiteAssistantCredentialRecord, SiteAssistantCredentialView } from "./site-credential-store";
export { InMemorySiteAssistantCredentialRepo } from "./site-credential-store.memory"; // optional, §4.6
```

`db/sqlite/site-credential-repo.sqlite.ts` picks up `SiteAssistantCredentialRepoPort`/
`SiteAssistantCredentialRecord` from here too (§3.2 — correct direction, just the wrong door today).

### 4.3 Section C — BYOK In-Process Execution (admin)

Consumed by `server/modules/assistant-byok.ts` (the composition point) plus the execution-credential
CRUD routes.

```ts
// execution-credential-store.ts
export {
  getExecutionCredential, setExecutionCredential, deleteExecutionCredential, resolveExecutionCredential,
  ExecutionCredentialValidationError, ExecutionCredentialSecretStoreUnconfiguredError,
} from "./execution-credential-store";
export type { AdminExecutionCredentialRepoPort, AdminExecutionCredentialRecord, AdminExecutionCredentialView } from "./execution-credential-store";
export { InMemoryAdminExecutionCredentialRepo } from "./execution-credential-store.memory"; // optional, §4.6
// execution-mode-settings.ts
export { ensureExecutionSettingDefinitions } from "./execution-mode-settings";
// byok-credential.ts
export { createRequestSuppliedExecutionCredentialPort, createStoredExecutionCredentialPort } from "./byok-credential";
export type { ExecutionCredentialPort, ResolvedByokCredential, RequestSuppliedByokConfig } from "./byok-credential";
// byok-provider-turn.ts
export { runByokProviderTurn, sanitizeGoogleSchema, googleParametersOf, findNumericEnumPaths, coerceNumericEnumStringsToNumbers } from "./byok-provider-turn";
export type { ByokProtocol, ByokChatMessage, ByokTurnEvent, ByokToolCall, ByokToolResult, ByokToolExecutor, ByokProviderTurnInput, ByokProviderTurnResult } from "./byok-provider-turn";
// byok-tool-surface.ts
export { createByokToolSurface, META_TOOL_DESCRIPTORS } from "./byok-tool-surface";
export type { ByokToolSurface, ByokMetaToolResult } from "./byok-tool-surface";
```

### 4.4 Section D — Admin Daemon Proxy / Process Composition

Consumed by `server/modules/assistant.ts` (the daemon-proxy composition — 7 of these files have
**exactly one** external importer, this module) plus `src/index.ts` (the CLI entry point, for
process-lifecycle concerns).

```ts
// a2ui-actions-route.ts
export { A2UI_ACTIONS_PATH } from "./a2ui-actions-route";
export type { A2uiActionsRouteDeps } from "./a2ui-actions-route";
// daemon-auth.ts
export { AGENT_DAEMON_TOKEN_ENV_VAR, ensureAgentDaemonToken, DELEGATED_TOOL_CALLS_PATH } from "./daemon-auth";
// daemon-exit-codes.ts
export { AGENT_DAEMON_EXIT_CODE } from "./daemon-exit-codes";
// live-model-cache.ts
export { getLiveClaudeModels, unionModels, resetLiveModelCacheForTesting } from "./live-model-cache";
// mcp-ui-tool-calls.ts
export { isMcpUiToolCallAllowed, MCP_UI_REDEEMABLE_TOOL_IDS } from "./mcp-ui-tool-calls";
// mcp-ui-tool-calls-route.ts
export { MCP_UI_TOOL_CALLS_PATH } from "./mcp-ui-tool-calls-route";
export type { McpUiToolCallsRouteDeps } from "./mcp-ui-tool-calls-route";
// run-ownership.ts
export { RUN_PRINCIPAL_HEADER, createRunOwnerRegistry, requireRunOwnership, createOwnedRunListHandler } from "./run-ownership";
export type { RunOwnerRegistry } from "./run-ownership";
// surface-exchanges.ts — SEE §7 before implementing: pending coordination with the cycle report's item 7
export { SURFACE_EXCHANGE_ID_PARAM, SURFACE_DISMISSED_PARAM, askOnce, createSurfaceExchangeStore } from "./surface-exchanges";
export type { SurfaceExchange, SurfaceExchangeStore, SurfaceExchangeBinding, SurfaceMessage, AssistantSurfaceDeps } from "./surface-exchanges";
```

### 4.5 Section E — External MCP Federation (registry — Category 3, optional)

```ts
// external-mcp-store.ts
export {
  listExternalMcpServerViews, readEnabledExternalMcpConfigs, toResolvedFederatedConnections,
  saveExternalMcpServer, deleteExternalMcpServer, parseEnvBlock, parseArgs, parseAllowedToolNames,
  ExternalMcpValidationError, ExternalMcpSecretStoreUnconfiguredError,
} from "./external-mcp-store";
export type { ExternalMcpServerRepoPort, ExternalMcpServerRecord, ExternalMcpServerView, ExternalMcpServerConfig } from "./external-mcp-store";
export { InMemoryExternalMcpServerRepo } from "./external-mcp-store.memory"; // optional, §4.6
// mcp-federation/{config,presets}.ts — genuinely fine as direct imports (§3.2); folding in is cosmetic
export { FEDERATED_CONNECTION_DEFAULTS, isFederationEnabled, positiveIntOrDefault } from "./mcp-federation/config";
export type { ResolvedFederatedConnection } from "./mcp-federation/config";
export { registerFederatedMcpPreset, listFederatedMcpPresets } from "./mcp-federation/presets";
```

### 4.6 Section F — Chat History Persistence (composition-root wiring, Category 3, low priority)

```ts
// persistence/store-factory.ts
export { createChatStoreFactory, createInMemoryChatStoreFactory } from "./persistence/store-factory";
// persistence/tenant-scope.ts
export type { ChatStoreFactory, ChatPrincipal, AdminChatPrincipal, GuestChatPrincipal } from "./persistence/tenant-scope";
export { hashSessionKey, createTenantScopedChatStore, chatExpiryFor, GUEST_CHAT_TTL_MS } from "./persistence/tenant-scope";
```

This section, and the three `.memory.ts` re-exports scattered through §4.2/§4.3/§4.5, are marked
**optional** because they are Category 3 already (composition roots wiring concrete adapters is the
correct ADR-006 shape) — folding them into `index.ts` is cheap and consistent but is not fixing
anything broken. If the owner wants the smallest possible first diff, these can ship in a follow-up.

### 4.7 Caveat on completeness

The export lists above are a **first draft grounded in the 59 traced edges** (every symbol listed
was confirmed, by direct read, to be imported by at least one real external call site) — they are
not a claim of having enumerated every symbol each of the 27 files exports. A file may export a
helper with zero external consumers today (e.g. `site-credential-store.ts`'s private `toView`/
`maskOf` are not exported at all, so they are not a risk either way); the discipline for
implementation is: **`index.ts` re-exports only names with a traced external consumer** — anything
else stays un-re-exported, confirmed against a full grep of that file's exports at implementation
time, not assumed from this table.

---

## 5. Anti-goal compliance — why this is not the barrel-laundering pattern

The dispatch brief is explicit: *"Do NOT propose re-exporting internal files through `index.ts` to
drop the number... A barrel makes the counter read 1 while the exports map still enumerates 27...
Any proposal that leaves the same 27 things reachable under a new name is a failed proposal."*
Walking through why §4 is not that:

1. **It is not `export * from "./file"` for all 27 files.** Every section above names specific
   symbols, chosen because a traced edge (§2) needs exactly that symbol. A wildcard re-export would
   make every private helper in every one of the 27 files reachable from outside `assistant/` in one
   hop — `toView()`, `maskOf()`, module-private constants like `DEFAULT_PROVIDER`,
   `MASK_TAIL_LENGTH` in the credential stores never appear in `index.ts` under this proposal,
   because no traced edge needs them. They stay exactly as private as they are today.
2. **It does not "read 1 while the exports map still enumerates 27."** The concern in the brief is a
   barrel whose own body still names/imports all 27 files, so the *real* coupling a human (or a
   `package.json` `exports` map) would have to describe is unchanged even though the counter moved.
   Here, six sections *are* named and independently justified (§4.1–§4.6) — a future reader (or a
   future package boundary) can look at `index.ts` and see six coherent groupings, not "everything,
   undifferentiated." Two of the 27 files (`mcp-federation/{config,presets}.ts`) are explicitly
   *not* required to move into the barrel at all (§4.5) — a genuine, stated exclusion, not
   window-dressing.
3. **It does not break tree-shaking or worsen the SCC.** Confirmed by re-reading
   `check-architecture.ts`'s own module-cycle logic (`moduleOf()`, `buildModuleAdjacency()`): cycle
   and SCC detection operate at the **module** level (`src/assistant/**` collapses to one node,
   `assistant`, regardless of which specific file inside it is the import target). Whether
   `server/modules/assistant.ts` imports `assistant/live-model-cache.ts` directly or
   `assistant/index.ts` (which itself imports `live-model-cache.ts` internally), the module-level
   edge `server → assistant` is identical either way. **This proposal cannot grow the SCC, cannot
   add a module cycle, and cannot move the propagation-cost or back-edges-into-server metrics** —
   it moves exactly one ratcheted metric (`moduleApiSurfaceFiles`, strictly downward) and one
   informational one (`deepImportsBypassingIndex`, also downward). Verified against the metric's own
   source, not asserted.
4. **The counter change reflects a real change in what's reachable.** Today, any file anywhere in
   the repo can `import { toView } from "#src/assistant/site-credential-store"` if it existed as an
   export (it does not, but nothing structurally prevents a *future* file from reaching past the
   settings functions into something that should stay private) — there is no enforced boundary.
   After `index.ts` exists, TypeScript path aliases plus the standing `check:architecture` ratchet
   (which fires the instant a **new** file is exposed, per its own doc comment) make any future deep
   import a visible regression the moment it lands, not merely a style violation. That is a real
   tightening, not a cosmetic one.

---

## 6. Is `assistant` one module or several wearing one name?

Taken seriously, per the dispatch's explicit ask. The 27 files *do* cluster into distinct purposes
with mostly-disjoint consumer sets (§4's six sections read almost like six candidate modules:
site-assistant, settings+credentials, BYOK execution, daemon-proxy, MCP federation, chat
persistence). That is real evidence for a split. Three things weigh against doing it now:

1. **Two of the highest-traffic files are genuinely shared, not merely convenient to share.**
   `public-assistant-settings.ts` (14 edges) and `site-credential-store.ts` (7 edges) are consumed by
   BOTH the admin CRUD cluster (§4.2's routes) AND the public-runtime cluster (§4.1's
   `site-assistant.ts`, plus `routes/site/{pages,products}.ts`'s `isPublicAssistantEnabled` gate).
   Splitting `assistant` into a `site-assistant` module and an `assistant` (admin) module would force
   a choice: duplicate these two files (a correctness risk — two copies of a security-relevant
   settings gate can drift), or leave them in one module and give the other module a **new
   cross-module edge** into it. The constraints explicitly forbid trading API surface for a new
   cycle; a naive split risks exactly that trade.
2. **The costliest cycle-graph work in this area is already scoped, elsewhere, and should not be
   compounded.** The 2026-08-13 architecture audit's item 8 (`agent-daemon-server.ts`'s
   composition-root split, 24 internal consumers) is already flagged as "the largest and most
   architecturally consequential item" in that report, requiring its own Architect design pass
   before any Programmer work starts. Running a full module split of `assistant` concurrently with
   that split — in the same module, touching many of the same daemon-proxy files (§4.4) — multiplies
   review and coordination cost for two large changes whose boundaries would need to be co-designed
   anyway (a daemon-proxy split naturally interacts with "which module owns the daemon-proxy
   files").
3. **The cheap fix already resolves the complaint that motivated asking the split question.** The
   dispatch's concern was "leaks nearly one distinct internal file for every two imports... no
   coherent public API at all." §4's six sections *are* a coherent public API, achievable without
   moving a single file's physical location — meaning it carries none of a split's SCC/cycle risk
   and none of its need for import-path updates in *unrelated* modules that merely happen to resolve
   through re-exports. A split is a strictly bigger, riskier move to buy the same clarity §4 already
   buys more cheaply.

**Recommendation: ship §4 now; treat a full module split as a considered-and-deferred option**, worth
revisiting only after the `agent-daemon-server.ts` split (the audit's item 8) lands and the
daemon-proxy cluster's real shape is settled — splitting `assistant` before that would mean
re-drawing the same boundary twice. If a split is revisited later, §4's six sections are already the
right starting boundaries — each is self-contained enough to lift into its own module verbatim, which
is exactly what makes deferring the split now a safe choice rather than a missed opportunity.

---

## 7. Interaction with the two known cycle sources

The 2026-08-13 architecture audit names two independent sources of the `assistant<->server` module
cycle, plus `assistant<->db`, `assistant<->features/plugins`, and `assistant<->features/post`. This
report's proposal and that report's proposals were designed to be read together, per the dispatch
brief's instruction. Concretely:

- **`agent-daemon-server.ts`'s composition-root split (audit item 8):** no overlap. That file has
  **zero** external importers today (it is not one of the 27 files in §2 — it is purely an *outbound*
  edge, `assistant → db`/`features/plugins`/`server`, not an *inbound* one). This report's proposal
  changes only inbound edges. Fully orthogonal.
- **`byok-tool-surface.ts`'s inbound `RouteDeps` import (audit item 6):** no overlap. This report
  proposes re-exporting `byok-tool-surface.ts`'s own outbound public API (`createByokToolSurface`
  etc., §4.3) through `assistant/index.ts` — a completely different edge from its inbound `import
  type { RouteDeps } from "../server/routes/types"`. Fixing one does not touch the other.
- **`assistant<->features/post` (audit item 7, `surface-exchanges.ts`):** **the one genuine overlap.**
  The audit proposes physically relocating `surface-exchanges.ts`'s public contract to `core/`, so
  `features/post`'s two importers (`delete-confirmation-ui.ts`, `tool-registrations.ts`) depend
  downward on `core` instead of sideways into `assistant`. This report (§4.4) proposes re-exporting
  the same file's contract from `assistant/index.ts` for its *other* consumer
  (`server/modules/assistant.ts`). **Recommended sequencing:** if audit item 7 proceeds, do it before
  or together with the `surface-exchanges.ts` line in §4.4 — once the contract lives in `core/`,
  `assistant/index.ts`'s re-export line simply changes source (`export { ... } from
  "../core/surface-exchanges"` or wherever it lands) and `server/modules/assistant.ts`'s import
  stays byte-identical (`from "#src/assistant"`). Doing the `index.ts` re-export first is not wrong
  — it is a strict improvement either way — but it should not be read as resolving or replacing item
  7's module-cycle fix; the two operate on different metrics (this report: API surface; that report:
  module cycles) and both are needed for `surface-exchanges.ts` to end up in its right home with a
  right-sized public contract.
- **`assistant<->db` / `assistant<->features/plugins`:** both fully explained by
  `agent-daemon-server.ts`'s **outbound** edges per the audit (§4 Root Cause A) — no file in this
  report's 27 is implicated in either cycle pair (`assistant`'s side of `assistant<->db` and
  `assistant<->features/plugins` is the single file `agent-daemon-server.ts`, which has zero inbound
  edges from outside `assistant`, and the `db → assistant` reverse edges for the credential-store
  ports are Category 3, §3.2 — correct, not part of a cycle *fix*, though they are part of the cycle
  *pair's existence* as its `Ca` side). No action from this report affects either pair.

---

## 8. Ordered execution plan (cheapest first; this report proposes, does not execute)

| # | item | files touched | blast radius | sign-off |
|---|---|---|---|---|
| 1 | Create `src/assistant/index.ts` with §4.1–§4.4 (Site Assistant, Settings & Credentials, BYOK, Daemon Proxy — excluding the `surface-exchanges.ts` line, held per §7) | 1 new file (~110 lines of re-exports + a header citing ADR-009 §1 and INV-09-style intent) | none — pure addition, no existing import path changes yet | none required (ADR-009 §1 already covers this; recommend owner acknowledgment only, given the scrutiny this module is under) |
| 2 | Re-point the ~24 consumer files at `assistant/index.ts` for the symbols covered in item 1 (`server/modules/{assistant,assistant-byok,site-assistant}.ts`, `server/app.ts`, `server/deps.ts`, `server/routes/types.ts` (type-only lines), `server/routes/admin/assistant/*.ts` ×12, `server/routes/admin/external-mcp/*.ts` ×2 of 3 (excluding `put.ts` if MCP federation is deferred), `server/routes/site/{pages,products}.ts`, `src/index.ts`, `db/sqlite/{site-credential-repo,execution-credential-repo}.sqlite.ts`) | ~22 files, one import-specifier line each — no symbol names or call sites change | low — mechanical import-path swap; `tsc` alone catches any miss, no logic touched | none — mechanical, Programmer-level |
| 3 | Add §4.5 (External MCP Federation) to `index.ts` and re-point `routes/admin/external-mcp/*.ts` ×3 and `db/sqlite/external-mcp-repo.sqlite.ts` | 4 files | low, same shape as item 2 | none |
| 4 | Add §4.6 (Chat History Persistence) and the three `.memory.ts` re-exports; re-point `server/app.ts`/`server/deps.ts`/`server/routes/types.ts`'s remaining direct imports | 3 files | low, same shape | none — explicitly optional/cosmetic (§4.6) |
| 5 | `surface-exchanges.ts`'s `index.ts` line and `server/modules/assistant.ts`'s re-point | 1–2 files | low, but **sequence after or together with** the cycle report's item 7 per §7 | Architect coordination with whoever executes cycle-report item 7 |
| 6 | `mcp-federation/{config,presets}.ts` fold-in and `supabase-mcp-plugin.ts` re-point | 3 files | trivial | none — fully optional, Category 3 already correct |
| 7 | *(deferred, not part of this plan)* Full module split of `assistant` per §6 | not scoped — would need its own Architect design pass | high | Architect + owner, and only after the `agent-daemon-server.ts` split (audit item 8) lands |

Items 1–4 alone take `assistant`'s contribution to `moduleApiSurfaceFiles` from **27 to at most 3**
(`surface-exchanges.ts` pending item 5's coordination, plus `mcp-federation/{config,presets}.ts` if
item 6 is deferred) — a ~89% reduction with zero SCC/cycle/propagation-cost impact, verified in §5.
All seven items together take it to **0**.

---

## Report contract

- **Inputs used:** `npm run check:architecture -- --list` (live); full read of
  `development/scripts/check-architecture.ts`; `npx depcruise` run directly and post-processed with
  the script's own filtering logic to get exact per-file importer identity; full reads of all 27
  exposed files plus `ADR-009-decoupling-strategy.md`, `src/{seo,http,mail,members,navigation,media}/
  index.ts`, `.dependency-cruiser.cjs`, and every consumer file named in §2 and §4 (composition
  modules, admin route files, db/sqlite adapters); `ADS-memory/reports/architecture/
  2026-08-13-architecture-audit.md` §4–§5 as an input for §7's cycle-source cross-reference (not
  re-derived independently).
- **Not used:** `codebase-memory-mcp` graph queries — confirmed indexed and fresh, but every
  question here was a direct "which file imports which, for which named symbol" lookup that
  depcruise + grep/read answered with exact edges and no risk of the graph extractor missing a
  multi-line import (which a first-pass single-line grep on this report's own consumer files *did*
  miss, caught and corrected before writing §2's table — see §1).
- **Output summary:** 27 files / 59 edges traced to exact importers and purposes; 0 Category-1
  findings (no wrong dependency anywhere in the 59 edges); ~24 Category-2 (real need, needs a front
  door); ~3 Category-3 (mcp-federation's deliberate registry seam; db/sqlite adapters' correct
  hexagonal port-type direction). Proposed fix: one curated `assistant/index.ts` in six named
  sections, grounded in the already-accepted ADR-009 §1 and already-proven by six sibling modules,
  taking the exposed-file count to as low as 0 with zero effect on any other ratcheted metric
  (verified against the metric's own module-level graph, not asserted). Module split considered and
  deferred, with reasoning (§6). Interaction with the two known cycle sources is orthogonal except
  for `surface-exchanges.ts`, where explicit sequencing is given (§7).
- **What this report did not cover:** exhaustive enumeration of every symbol each of the 27 files
  exports (§4.7 states the discipline for closing that gap at implementation time, not a claim of
  having already closed it); `apps/admin`'s HTTP-level consumption of assistant-adjacent routes (out
  of scope — this traces `src/**` module-level imports, matching what `check:architecture` itself
  measures); re-verification of the two cycle sources' own findings (treated as inputs, per the
  dispatch brief). No production code was changed to produce this report.
