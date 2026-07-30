# Postgres/Supabase Database Backend — Scoping Spec

- **Agent:** Software Architect (subagent dispatch), AI Dev Shop framework
- **Date:** 2026-07-30
- **Status:** SCOPING PROPOSAL — greenlight-decision input only. No code was written, no git operation
  performed beyond persisting this document.
- **Personas loaded:** `AI-Dev-Shop/AGENTS.md`, `AI-Dev-Shop/agents/software-architect/skills.md`
- **The user's ask, verbatim:** *"i want them to be able to set up a supabase db project completely
  new and have it be the database and not sqllite... a user decided they dont want to use sqllite so
  they see the supabase plugin and create one on Supabase through this Tovu platform."*
- **Explicitly NOT this document's subject:** `src/features/plugins/supabase-mcp/` (landed `9b284b7`)
  is a read-only MCP federation preset that lets the admin AI assistant *query* an external Supabase
  project. It has no relationship to where Tovu's own content lives and is untouched by this proposal.

---

## 0. Method and evidence standard

Per `AI-Dev-Shop`'s anti-hallucination policy, claims below are labeled:

- **VERIFIED** — read directly from source (this repository's working tree, or an official Supabase
  doc page).
- **INFERRED** — my reasoning over verified evidence, marked as such.
- **UNKNOWN** — a real gap; named precisely rather than guessed at.

All Tovu-side claims were read from the working tree at `/Users/la/Programming/Tovu` on 2026-07-30.
Files read in full: `src/infra/db/schema.ts`, `src/infra/sqlite/content-db.ts`,
`src/infra/sqlite/db-ops.ts`, `src/infra/postgres/db-ops.ts`, `src/core/gated-mutations/ports.ts`,
`src/core/gated-mutations/watermark.ts`, `src/features/plugins/data-module.ts`,
`src/assistant/mcp-federation/presets.ts`, `src/assistant/mcp-federation/config.ts`,
`src/features/plugins/supabase-mcp/supabase-mcp-plugin.ts`, `drizzle.config.ts`,
`ADS-memory/reports/architecture/ADR-023-core-mediated-plugin-data-modules.md`,
`ADS-memory/reports/architecture/ADR-006-ports-rule-of-two.md`, plus targeted excerpts of
`ADS-memory/reports/architecture/ADR-041-storage-timeline.md`,
`ADS-memory/reports/architecture/ADR-012-site-template-and-instantiation.md`,
`src/server/deps.ts`, `src/index.ts`, `src/features/database/migrate-forward/state-machine.ts`,
`src/features/database/migrate-forward/execute.ts`, `src/features/post/repo.sqlite.ts`, and
`ADS-memory/reports/architecture/lipay-payment-plugin-architecture.md` (used as this repo's most
recent precedent for how a scoping doc in this style is structured, and as the concrete template for
the core-mechanism/vendor-plugin split). External research: Supabase's own Management API reference
and platform-integration guide (cited inline in §3).

---

## 1. Executive summary

The user's request is real and buildable, but it is **two projects, not one**, and they have very
different risk profiles:

1. **A generic Postgres `ContentDb` adapter in core.** This does not exist today in any form beyond
   design intent — VERIFIED: no `pg` or `postgres` npm package is even a dependency
   (`package.json`), `drizzle.config.ts` is hardcoded to `dialect: "sqlite"`, and
   `src/infra/postgres/db-ops.ts` is explicitly documented as "evaluation-only — no live `pg`
   client." This is genuinely a from-scratch build, not a port-and-fill exercise, **but** the
   codebase has done real conceptual prep for it (§2.5) and its actual public contracts are already
   shaped to accept it cheaply (§4.6).
2. **A Supabase-specific plugin** that calls Supabase's real Management API to provision a project
   and hands the resulting connection string to #1. This is the smaller, better-precedented half —
   `src/features/plugins/supabase-mcp/` and `src/assistant/mcp-federation/presets.ts` are a working,
   shipped example of exactly this core-mechanism/vendor-plugin split (§3.1), and Supabase's
   provisioning API is well-documented and mechanically straightforward (§3.2).

**The crux, stated precisely:** `declareDataModule()` (`src/features/plugins/data-module.ts`) —
Tovu's DDL engine for plugin-owned tables — **cannot be shared across dialects as-is and needs a
parallel Postgres-specific implementation, not a portable core.** Its safety mechanics (whole-file
snapshot, disk-headroom preflight, exclusive file lock) are SQLite-file concepts with no meaning
against a remote managed Postgres instance, and it is written directly against `better-sqlite3`'s
*synchronous* API. This is detailed in §2.2 — but the news is not all bad: Postgres's native
transactional DDL likely makes the *safety story* for a Postgres engine substantially **simpler**
than SQLite's, not harder. Building it is real work; the risk that it's an unsolvable problem is low.

**Recommended sequencing:** build and prove #1 completely, against a plain/local Postgres instance,
before starting #2 — #2 is meaningless without #1 and adds an unrelated risk surface (a real cloud
API, real money, real credentials) that would only slow down and confuse validation of #1. See §5.

**A real governance tension exists and must be resolved before either lands:** ADR-041 §1 states
plainly, *"Database-first mode (creating a site by pointing at an existing external DB) is never
offered — conflicts with ADR-012's template-instantiation model."* This proposal is not that — see
§6 for why, and for the explicit ADR amendment this proposal requires before implementation, not
after.

---

## 2. Layer 1 — the core Postgres `ContentDb` adapter

### 2.1 What has to exist that doesn't today

VERIFIED, `src/infra/sqlite/content-db.ts:42`:

```ts
export type ContentDb = BetterSQLite3Database<typeof schema> & { $client: Database.Database };
```

`ContentDb` is a **concrete type**, not an interface with two adapters. This is itself the gap ADR-006's
rule-of-two discipline says should already be closed and isn't: ADR-006 lists `DatabasePort`/repos as a
port with "in-memory + SQLite" as its two adapters (VERIFIED, `ADR-006-ports-rule-of-two.md`) — SQLite
is one *specific* adapter of a *different* rule-of-two pair (in-memory vs. real), not itself already
paired against a second real backend. There is no `PostgresContentDb` type, no `PostgresJsDatabase`
reference, and no `pg`/`postgres` runtime dependency anywhere in `package.json`. Building this is
building the second real adapter from nothing, following the same shape `content-db.ts` already
establishes (open a driver connection, apply pragma-equivalents, run migrations, return a typed handle
plus whatever raw-client escape hatch the `DbOpsPort` adapter needs — see §2.4).

### 2.2 `declareDataModule()` — the crux, in detail

VERIFIED, `src/features/plugins/data-module.ts`. This is Tovu's DDL engine for plugin-owned tables
(ADR-023) — the mechanism a future `supabase-db` plugin's own manifest tables (project metadata,
provisioning status) would also go through, and the mechanism every existing Tier-2/Tier-3 plugin
(store, deploy, lipay, newsletter, comments) already depends on.

**Concretely, line by line, why it does not generalize:**

- `declareDataModule(required: { db: Database.Database; ... })` — its first parameter is typed as
  `better-sqlite3`'s own `Database.Database`, not a dialect-neutral port. Every call site
  (`comments/data-module-install.ts`, `newsletter/data-module-manifest.ts`, `store-plugin.ts`,
  `deploy-plugin.ts`, `lipay-plugin.ts`) passes a real `better-sqlite3` handle.
- `db.transaction(() => { ... })()` (line 265) — `better-sqlite3`'s transaction wrapper is
  **synchronous**. Both real Node Postgres drivers (`pg`, `postgres`) are async-only; a Postgres
  equivalent is `await db.transaction(async (tx) => { ... })`. This is not a type-signature tweak —
  every DDL statement inside the transaction body must become `await`ed, and the whole function
  becomes async at a different layer than it is today.
- `existingTables()` (line 192) queries `sqlite_master` directly — SQLite's own catalog table. The
  Postgres equivalent is `information_schema.tables` or `pg_catalog.pg_tables`, a different query
  entirely.
- The `_plugin_migrations` journal table (line 181) uses `INTEGER PRIMARY KEY AUTOINCREMENT` —
  SQLite syntax. Postgres uses `GENERATED ALWAYS AS IDENTITY` or `SERIAL`.
- The column-type grammar (`TEXT | INTEGER | REAL | BLOB`, line 70) maps reasonably cleanly to
  Postgres native types (`TEXT`, `INTEGER`/`BIGINT`, `REAL`/`DOUBLE PRECISION`, `BYTEA`) — this part
  is genuinely close to portable and not a real risk.
- **The safety mechanics have no Postgres analogue as coded, at all:**
  - §4's whole-file snapshot (`snapshotDb`, via SQLite's Online Backup API) assumes a local file to
    copy. A managed Supabase Postgres instance is not a local file.
  - §3's disk-headroom preflight (`checkDiskHeadroom`, `1.5x current DB+WAL size`) checks free space
    on the volume holding `content.db`. There is no such volume for a remote database.
  - The (now-removed, per ADR-023's own T2 correction) `PRAGMA locking_mode=EXCLUSIVE` concept has no
    Postgres equivalent in the same shape; Postgres's own locking model (row/table locks, advisory
    locks, MVCC) is a different mechanism the engine would need to reason about on its own terms, not
    inherit.

**Verdict:** a Postgres `declareDataModule()` is a **second, independently-written implementation of
the same manifest→DDL contract**, sharing only the `DataModuleDecl`/`TableDecl`/`ColumnDecl` input
shape and the "core alone executes DDL" invariant (ADR-023 §2) — not a shared code path. This is
consistent with the rule-of-two discipline this codebase already applies elsewhere (two real
`DbOpsPort` adapters, §2.4), not a departure from it.

**The good news, and it is genuinely good:** Postgres has **native transactional DDL** — a
`CREATE TABLE` inside a transaction that crashes mid-statement is automatically rolled back by
Postgres's own WAL, with no possibility of a half-applied schema surviving a crash. SQLite's elaborate
snapshot/journal/crash-recovery apparatus (ADR-023 §2, §4, three audit rounds, T1–T8 findings) exists
specifically because SQLite's transaction guarantees don't extend across a same-process crash the same
way for this codebase's usage pattern, and because "never-brick" for a local file demands a physical
backup to restore from. A Postgres engine likely does **not** need an equivalent of the whole-file
snapshot/phase-journal machinery to satisfy the *same-process-crash* half of never-brick — Postgres's
own crash recovery already delivers "committed or rolled back, never half-applied" for free. What a
Postgres engine *does* still need is an answer to "the DDL succeeded but was the wrong DDL" (a bad
plugin manifest) — and for Supabase specifically, this maps naturally onto Supabase's own
Point-in-Time-Recovery or branching, not a file copy. This is not speculative: `src/infra/postgres/
db-ops.ts`'s `PostgresRestoreToolingConfig` already carries an `externalPitrConfigured: boolean` field
(VERIFIED) — the existing evaluation-only stub already anticipated exactly this shape of answer.

### 2.3 Core schema migrations (the drizzle-kit path)

VERIFIED, `drizzle.config.ts`:

```ts
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/infra/db/schema.ts",
  out: "./src/infra/drizzle",
});
```

`schema.ts` is written with `drizzle-orm/sqlite-core` (`sqliteTable`, `text`, `integer`) — VERIFIED,
its own file header already says the design intent is that this "maps cleanly to a future Postgres
dialect," and `body_json`/other JSON-text columns are deliberately TEXT so they can become Postgres
`jsonb` later. That intent is real but **not yet actionable as one schema file**: `drizzle-kit
generate` is dialect-specific per config, so a Postgres migration set requires either (a) a second,
parallel `pg-core` schema file plus a second `drizzle.config.ts`, hand-kept in sync with every future
change to `schema.ts`, or (b) some generation/codegen step that derives one from the other — no such
tool ships with Drizzle today to my knowledge (UNKNOWN — worth a short spike before committing to
either approach; do not assume). Either way this is an ongoing maintenance cost every future schema
change pays twice, not a one-time cost.

**Real, already-existing prior art for the migration-*execution* side:** `src/features/database/
migrate-forward/state-machine.ts` (SPEC-017, ADR-041 §3) is VERIFIED to already be
**dialect-conditional by design**: "SQLite migrates in-place (`QUIESCING -> SNAPSHOTTING -> APPLYING
-> VERIFYING -> JOURNALING -> DONE`); Postgres migrates blue/green, inserting a `CUTOVER` phase between
`VERIFYING` and `JOURNALING` that atomically repoints blue to green." This is a **pure state-transition
function with no I/O** (its own header says so) — it already encodes the right shape for a Postgres
core-schema-migration story (blue/green, not in-place), but `migrate-forward/execute.ts` is
VERIFIED to be an orchestration wrapper around a lock port and the state machine's `advance()` only —
there is no real DDL execution behind either dialect branch today. This is exactly the same "the
seam/shape has been designed, the live implementation has not been built" pattern as
`postgres/db-ops.ts`. **This state machine is the one piece of this whole proposal that is closer to
done than the dispatch brief assumed** — the hard design thinking (blue/green vs in-place, the two
distinct failure shapes `RESTORING` vs `ROLLBACK_TO_BLUE`) already happened and passed review under
SPEC-017/ADR-041. Building the real Postgres executor behind it is real work, but it is filling in a
already-shaped hole, not inventing the shape.

### 2.4 `DbOpsPort` (restore points)

VERIFIED — this is the one port in this whole surface that already has a genuine rule-of-two pair:
`src/infra/sqlite/db-ops.ts` (real, does file-copy backup/restore) and `src/infra/postgres/db-ops.ts`
(explicitly evaluation-only per its own header — pure capability-scoring logic, no live `pg` client, no
real `pg_dump`/blue-green execution, "per implementation-outline.md's 'Postgres adapter deferred'
note"). Building the live half is bounded, well-scoped work: implement `getCapabilities()` /
`captureRestorePoint()` / `restoreFromArtifact()` against a real Postgres connection, feeding the
already-written `evaluatePostgresRestoreCapability()` pure function real config instead of test
fixtures. For a Supabase-backed site specifically, the natural real answer is
`externalPitrConfigured: true` — Supabase's own managed PITR/branching, not a `pg_dump` Tovu triggers
itself — which the plugin layer (§3) would be responsible for surfacing.

### 2.5 Watermark

VERIFIED, `src/core/gated-mutations/watermark.ts` — `stampWatermarkTx`/`getCurrentWatermark` are
written against Drizzle's query builder (`tx.update(...).set(...).where(...)`), not raw SQL, and
`ContentDbTransaction` is derived structurally from `ContentDb["transaction"]`'s parameter type. This
is the smallest, most mechanically-portable piece of the whole surface — the SQL Drizzle generates for
an `UPDATE ... SET value = value + 1 WHERE id = 1` is nearly identical across dialects, and the actual
code changes needed are type-level (a `PostgresContentDbTransaction` variant) plus confirming Postgres
`drizzle-orm/node-postgres`'s query builder exposes the same `.set()`/`.where()` shape (it does, per
Drizzle's own design — INFERRED from Drizzle's documented cross-dialect query-builder parity, not
independently re-verified against Postgres in this pass).

### 2.6 Surface area — every file that would need a second implementation

VERIFIED by direct search of the working tree:

- **25 files** matching `*.sqlite.ts` under `src/` — the rule-of-two SQLite repo adapters (posts,
  entries, settings, identity, comments, forms, members, navigation, newsletter, redirects, widgets,
  taxonomy, content-types, media, outbox, change-sets, origin, analytics-sink, workspace, tool-audit,
  presentation, plugin-runtime, `core/entry-refs`, `features/database`, `integrations`).
- **21 files** that import `better-sqlite3` directly (beyond the typed Drizzle wrapper) — the DDL
  engine and its support modules (`data-module.ts`, `migration-journal.ts`, `migration-recovery.ts`,
  `plugin-identity.ts`, `snapshot.ts`), `content-db.ts`/`database-journal-db.ts` themselves, and every
  Tier-2/3 plugin that opens its **own** dedicated `better-sqlite3` connection (`store-plugin.ts`,
  `deploy-plugin.ts`, `lipay-plugin.ts`, `comments/data-module-install.ts`,
  `newsletter/data-module-manifest.ts`) — each of those would need its own Postgres-aware bootstrap
  following whatever pattern `content-db.ts`'s Postgres sibling establishes.

**A genuinely reassuring, independently-checked finding that meaningfully de-risks that number:**
VERIFIED, `src/features/post/repo.sqlite.ts` — every repo method is already declared `async` and
returns a `Promise`, even though its SQLite implementation internally calls synchronous
`better-sqlite3`/Drizzle `.all()`/`.run()` methods (the async keyword wraps already-sync work). This
pattern held in every adapter spot-checked. **This means the *port contracts* throughout this codebase
already assume an async backend and require no interface change for a second adapter** — a Postgres
implementation of `PostRepoPort` (or any of the other 24) is a drop-in second class satisfying an
already-async interface, not an interface redesign. The 25-file number is real, mechanical,
per-file-nontrivial work (rewriting query internals against `drizzle-orm/node-postgres`'s builder,
verifying Drizzle's SQLite-vs-Postgres query-builder API parity holds for every query shape actually
used — INFERRED close but not independently re-verified per query), but it is not an architecture
problem. It is a large, boring, parallelizable migration task once Layer 1's foundational adapter
exists — which is exactly the kind of slice this document's §5 sequencing recommendation is built to
surface early.

### 2.7 New runtime dependency

VERIFIED — no `pg` or `postgres` package exists in `package.json` today, only `drizzle-orm` itself
(dialect-agnostic at the ORM layer, but needs a driver). This adapter requires adding
`drizzle-orm/node-postgres` (with `pg`) or `drizzle-orm/postgres-js` (with `postgres`) as a new
production dependency — a real, if small, supply-chain and maintenance-surface decision that should be
made deliberately (which driver, why) rather than defaulted.

---

## 3. Layer 2 — the Supabase-specific plugin

### 3.1 Structural precedent (concrete template, already shipped)

VERIFIED — `9b284b7` established exactly the split this proposal needs, for a different concern:

- **Core mechanism**, vendor-blind: `src/assistant/mcp-federation/presets.ts` — a module-level
  registry (`registerFederatedMcpPreset`/`listFederatedMcpPresets`), explicitly "exempt from the
  rule-of-two" per its own header (a registry/hook, not a port with two swappable adapters) — and
  `config.ts`, which defines the generic `ResolvedFederatedConnection` shape every preset must produce
  and nothing vendor-specific.
- **Vendor plugin**: `src/features/plugins/supabase-mcp/supabase-mcp-plugin.ts` — resolves an env bag
  into a `ResolvedFederatedConnection` or `null`, registers itself via
  `registerFederatedMcpPreset({ presetId: "supabase-mcp", resolve: resolveSupabaseMcpConnection })`,
  and is called from the composition root (`agent-daemon-server.ts`) at ordinary boot — "default
  included," not the heavier SPEC-005 sandboxed third-party plugin runtime.

**The direct analogy for this proposal:** a generic core seam (e.g. `content-db-provisioning`
registry, or simply a documented handoff contract: "a plugin resolves a Postgres connection string and
calls `openPostgresContentDb(connectionString, ...)` from Layer 1") that names no vendor, plus
`src/features/plugins/supabase-db/` (name chosen to read unambiguously distinct from the existing
`supabase-mcp/` — do not reuse or overload that name) containing all Supabase-specific provisioning
logic: calling the Management API, polling for readiness, capturing the one-time database password,
and handing the resulting connection string to Layer 1's adapter. **Note the important asymmetry
versus the MCP precedent:** `supabase-mcp-plugin.ts` is pure "resolve config from env, connect to
something already provisioned elsewhere" — it declares no `dataModule()` tables because it holds no
state (VERIFIED, its own header says so explicitly). `supabase-db` is the opposite: its whole job is a
stateful, side-effecting **provisioning** action (create a real cloud resource, capture a
credential that can never be re-fetched), not passive config resolution. The registry/handoff shape
generalizes; the "pure config, no I/O" characterization of the precedent does not — plan for `supabase-
db` to be a real Tier-2 plugin with its own small manifest table(s) (provisioning status, project ref,
last-known health) via `declareDataModule()`, not a config-only module.

### 3.2 Supabase Management API — what it actually offers (verified against Supabase's own docs)

- **Project creation**: `POST /v1/projects` against `api.supabase.com`, authenticated with a Bearer
  **personal access token** (`Authorization: Bearer sbp_...`) — VERIFIED, and consistent with what
  `supabase-mcp-plugin.ts`'s own header already independently documented about the vendored MCP
  server's `create_project` tool needing an account-level PAT, not a project-scoped key. Request
  fields confirmed present: `organization_id`, `name`, `region` (Supabase has moved to "smart region"
  selection — `americas` / `emea` / `apac` — resolved via `GET /v1/projects/available-regions`),
  `db_pass`, `plan`. I was not able to retrieve the complete formal request/response JSON schema in
  this pass (the official reference page exceeded my fetch tool's size limit) — **treat the exact
  field list as INFERRED-from-multiple-corroborating-sources, not independently verified against the
  raw OpenAPI spec, and re-confirm against the live reference before implementation.**
- **Provisioning is asynchronous.** Supabase's own platform-integration guide (VERIFIED,
  `supabase.com/docs/guides/integrations/supabase-for-platforms`) instructs callers to poll a health
  endpoint until the project reaches `ACTIVE_HEALTHY` before treating it as usable — a newly-created
  project is not immediately connectable.
- **The database password is captured exactly once and cannot be retrieved via the API afterward.**
  VERIFIED, both from web research and directly consistent with Supabase's own platforms guide: *"once
  you set the password during project creation, there is no way to programmatically change the
  password"* short of the dashboard. This is the single most consequential fact for this whole
  plugin's design — see §3.3.
- **`GET /v1/projects/{ref}/api-keys`** retrieves API keys (the new `publishable`/`secret` key pair,
  superseding legacy `anon`/`service_role`) — but **not** the database password and not a ready-made
  Postgres connection string. The connection string is assembled from the project ref plus known
  Supabase host conventions (pooler/direct host patterns), combined with the password captured at
  creation.
- **Authentication model**: platform-managed provisioning (Tovu creating projects on behalf of its own
  site owners, inside Tovu's or the operator's own Supabase organization) uses a personal access
  token, the same credential class `supabase-mcp-plugin.ts` already handles and already documents the
  correct risk framing for (account-level, not project-scoped — VERIFIED consistent across both the
  existing plugin's header and the platforms guide). OAuth is Supabase's separate mechanism for
  *end users claiming projects they personally own* — not the shape this proposal needs, since the
  intent (per the user's own words) is Tovu provisioning on the site owner's behalf through Tovu's UI,
  not redirecting the site owner through a Supabase OAuth consent screen. **This is a real design
  choice with real consequences (whose Supabase organization do provisioned projects land in? whose
  billing?) and belongs in a follow-up ADR, not assumed silently.**

Sources consulted: Supabase's own API reference (`supabase.com/docs/reference/api/v1-create-a-project`,
`v1-list-all-projects`) and platform-integration guide
(`supabase.com/docs/guides/integrations/supabase-for-platforms`).

### 3.3 Credential handling — harder than lipay's, and lipay's own precedent applies directly

The already-accepted `lipay-payment-plugin-architecture.md` (this same repo, same day) establishes the
load-bearing rule this plugin inherits unchanged: **credentials never live in the portable
`content.db`** (its L10, citing ADR-024's secret invariant and ADR-012's install-dir portability), and
all outbound HTTP goes through the guarded `HttpClientPort` seam (ADR-038, `src/http/client.ts`) —
never a raw `fetch`. Both apply here without modification: the Supabase PAT and the per-project
database password are exactly the class of secret `SecretSealerPort` exists for, and every Management
API call must route through `createHttpClient`.

**What makes this harder than lipay's payment-provider credentials:** a payment provider's API key is
re-issuable — if lost or leaked, the operator rotates it in the provider's dashboard and updates one
env var. **The Supabase database password captured at project-creation time is not re-issuable via
API at all** (§3.2). If Tovu fails to durably and correctly persist it the moment the Management API
returns it, the result is not "a misconfigured integration" — it is **a newly-created, real, paid
Postgres database whose credentials are permanently lost**, recoverable only through a manual
dashboard password reset the plugin did not design for. This must be treated as a first-class failure
mode in the actual implementation design (e.g. capture-and-seal *before* returning success to the
caller, verify the seal round-trips before declaring provisioning complete, surface an unambiguous
"provisioning succeeded but credential capture failed — reset the password in the Supabase dashboard
and re-link" recovery path) — not discovered during implementation.

---

## 4. Recap: what "adding a payment provider costs one file" cost analogously here

Not applicable in the same shape as lipay's payment-provider extensibility goal — this proposal is not
about supporting N interchangeable database vendors behind one interface (the ADR-006 rule-of-two
governs *that* differently: SQLite and Postgres are the two adapters, full stop, not an open-ended
provider registry). The closer analogy is `mcp-federation`'s preset registry (§3.1): adding a **second
provisioning vendor** later (e.g. a "Neon" or "PlanetScale" plugin, if ever wanted) should cost "one new
plugin file implementing the same provision→connection-string handoff contract Layer 1 exposes," not a
core edit — provided Layer 1's adapter is built against Postgres generically (as scoped in §2) and
never learns Supabase's name. This is the concrete reason §5's sequencing insists Layer 1 stay vendor-
blind even though Supabase is the only real consumer being built now.

---

## 5. Sequencing and risk

### 5.1 Recommended build order

1. **Layer 1, fully, tested against a plain local/self-hosted Postgres instance (e.g. Docker), with no
   Supabase involvement at all.** This is the only order that lets "does Tovu's data model and write
   path work correctly on Postgres" be validated independently of "does the Supabase provisioning flow
   work" — two unrelated risk surfaces that should never be debugged together. Concretely this means,
   in rough dependency order: (a) settle the dual-schema-maintenance question (§2.3) before writing 25
   adapters against a schema that might still change shape; (b) build the Postgres `declareDataModule()`
   engine and prove it against the existing plugin manifests (store/deploy/lipay/newsletter/comments)
   running unmodified against Postgres; (c) build the live `PostgresDbOpsAdapter`; (d) port the 25
   `*.sqlite.ts` adapters (mechanical per §2.6, but real work — likely the single largest line-count
   item in the whole effort); (e) wire a `TOVU_DB=postgres://...`-shaped selection point analogous to
   the existing `TOVU_DB=memory` switch already in `src/index.ts`/`agent-daemon-server.ts`.
2. **Only then, Layer 2** — because it is genuinely meaningless before Layer 1 exists (there is nothing
   for a provisioned connection string to be handed *to*), and because building it first would tempt
   testing Layer 1 exclusively against Supabase's cloud, conflating "is my Postgres adapter correct"
   with "is my Supabase API integration correct, and am I burning real project quota/money on every
   test run."

### 5.2 Genuinely hard vs. mechanical

**Hard, real unknowns — name what would resolve each:**

- **The ADR-041 tension (§6)** — resolved by ADR amendment, not by code. Blocking for Layer 2's public
  framing regardless of Layer 1's progress.
- **Dual-schema maintenance (§2.3)** — resolved by a short spike: does any tool exist to derive a
  `pg-core` schema + migrations from the existing `sqlite-core` one, or is hand-maintained duplication
  accepted as the ongoing cost? Decide before writing the first Postgres migration.
- **Live-site migration (SQLite → Postgres, mid-life)** — the user's own framing ("a user decided they
  don't want to use SQLite... and create one on Supabase") strongly implies this must work for a site
  with **existing content**, not only fresh installs. This document deliberately does not scope that
  data-copy mechanism (ordering, consistency during copy, cutover, rollback-if-copy-fails) — it is a
  distinct, non-trivial project in its own right (arguably its own ADR, closely related to but
  separate from ADR-041's `migrate-forward` cutover concept in §2.3) and was out of the research budget
  for this pass. **Flagging this explicitly rather than silently assuming "provision + point at empty
  DB" satisfies the user's actual ask** — it likely does not, for any site that isn't brand new.
- **Concurrent-access model** — SQLite's WAL mode + `busy_timeout` (VERIFIED, `content-db.ts`'s
  `sqlite.pragma("busy_timeout = 5000")`, added after a real production "database is locked" bug per
  ADR-023's own T2 correction) is a single-file, single-machine concurrency story. Postgres's MVCC +
  connection pooling (doubly relevant for Supabase, which fronts Postgres with its own pooler) is a
  different model with different failure modes (pool exhaustion, not lock contention) — this needs its
  own design pass, not an assumption that "it'll just work, and better."
- **Whose Supabase organization / billing** (§3.2's OAuth-vs-PAT note) — a product/business decision as
  much as a technical one; resolve before building §3.

**Mechanical, bounded work — not architecturally risky:**

- The 25 `*.sqlite.ts`→Postgres adapter rewrites (§2.6), given Layer 1's foundation exists and the
  async-port-contracts finding holds.
- The live `PostgresDbOpsAdapter` (§2.4) — the pure evaluation logic it plugs into already exists and
  is already tested.
- The Supabase Management API integration itself (§3.2) — well-documented, conventional REST-over-HTTP
  work once the credential-handling design (§3.3) is settled.

---

## 6. The ADR-041 tension — must be resolved explicitly, not assumed away

VERIFIED, `ADR-041-storage-timeline.md` §1: *"Database-first mode (creating a site by pointing at an
existing external DB) is never offered — conflicts with ADR-012's template-instantiation model."*

**Why this proposal is not the same thing as what ADR-041 rejected, precisely:** ADR-012's model
(VERIFIED, `ADR-012-site-template-and-instantiation.md` §2–3) is "Create = instantiate a versioned site
template (seed `content.db` + config) into a new install-dir." What ADR-041 rejected is a user
supplying an **arbitrary, pre-existing, already-populated external database of unknown schema and
provenance** and asking Tovu to treat it as a site — a fundamentally unscoped, unvalidatable input.
What this proposal describes is different in kind: Tovu **provisions a brand-new, empty** Postgres
database (via the plugin in §3) and then **seeds it from the same template mechanism ADR-012 already
governs**, exactly as `openContentDb`'s existing `seed` parameter does for SQLite today (VERIFIED,
`content-db.ts`'s `seedContentDb`). The site is still instantiated from Tovu's own template; only the
storage location changes.

**That distinction is my (Software Architect) reasoning, not a ruling ADR-041 itself makes** — ADR-041
was written before this capability was contemplated and its text does not draw this line. **This
proposal should not proceed to implementation on the strength of this document's argument alone.** It
requires either a short ADR-041 amendment that explicitly carves out "provision-new-and-seed-from-
template" as distinct from "point at an existing populated external DB," or a fresh ADR that supersedes
that clause — decided by the same governance process (human sign-off, `/debate` or `/audit-work` as
this codebase's own precedent for storage-surface decisions already demonstrates — ADR-041 itself went
through a 3-round swarm debate and a 3-round external audit before acceptance). Treat this as a
blocking prerequisite for Layer 2's admin-facing framing, not a footnote.

---

## 7. Summary table

| Question | Answer |
|---|---|
| Does a generic Postgres `ContentDb` exist today, even partially? | No live code. Real design-intent groundwork exists (schema doc comments, `DbOpsPort`'s evaluation-only Postgres half, `migrate-forward`'s dialect-conditional state machine) but zero live Postgres connection code and no `pg`/`postgres` dependency. |
| Can `declareDataModule()` be made dialect-neutral? | No — needs a parallel Postgres-specific implementation of the same contract. Its safety mechanics are SQLite-file-specific; Postgres's native transactional DDL likely makes the equivalent *simpler* to build, not harder. |
| How big is the SQLite-coupled surface? | 25 `*.sqlite.ts` repo adapters + 21 files with direct `better-sqlite3` imports (VERIFIED counts). Mechanical per-file work once Layer 1 exists — de-risked by the finding that every port method is already `async`-shaped. |
| Is Supabase's provisioning API well-documented and usable? | Yes — `POST /v1/projects`, PAT auth, async health-polling, well-precedented by this repo's own `supabase-mcp` plugin's independent research into the same vendor. One hard constraint: the DB password is capturable exactly once. |
| What's the safest build order? | Layer 1 (generic Postgres adapter), proven against plain Postgres, fully, before Layer 2 (Supabase plugin) is started. |
| What's genuinely unresolved? | Live-site SQLite→Postgres data migration (not scoped here), dual-schema-maintenance mechanism, the ADR-041 tension (needs a real amendment), Supabase org/billing ownership, concurrent-access model redesign. |
