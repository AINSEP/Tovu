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

*(Report continues in §4–§8: the concrete `assistant/index.ts` proposal, anti-goal compliance
walkthrough, the split-vs-single-module analysis, interaction with the two cycle sources, and the
ordered execution plan.)*
