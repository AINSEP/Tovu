# ADR-041: Storage — the Timeline Surface, Migrate-Forward Ceremony, and Sidecar Ops Journal

- Status: **Accepted** (2026-07-14, human owner sign-off — Leon Aburime) — direction emerged from a 3-round
  `/debate` swarm consensus (2026-07-09, Primary Opus 4.8 + Fable subagent + Codex gpt-5.5 + Gemini 3.1 Pro)
  that unanimously endorsed the architecture but flagged it **not ADR-ready** pending a punch-list; this ADR
  is the Software Architect's fold-in pass over that punch-list. Cleared a 3-round `/audit-work` pass
  (2026-07-14, `TM-ADR-STORAGE-CONTENT-004`, Codex + agy/Gemini + Fable) — unanimous PASS as of round 3 (see
  item 11).
- Date: 2026-07-14
- Author: Claude Sonnet 5 (Software Architect persona) / Leon Aburime — synthesized from swarm debate
  `reports/swarm-consensus/runs/20260709-storage-database-surface-consensus-report.md` and merged design
  `.local-artifacts/swarm-consensus/context/CTX-database-admin-section-2026-07-09-R3b-merged.md`
- Extends: **ADR-023** §4 (amends the "snapshot before every DDL" rule with an explicit `index.provision`/
  `index.drop` carve-out, M1)
- Amends: **SPEC-003** — the `SERVE_SITE` behavior row must be revised per the Decision's B2 resolution below
  (state only; the spec file itself is not edited by this ADR)
- Relates to: ADR-003 (plugins never DDL — the precedent this surface's "no raw row edit" stance inherits), ADR-007
  (Decision 2's site-scope hatch, extended here to ports/tables), ADR-012 (install-dir layout — the sidecar ops
  journal is a new named entry in that tree), ADR-015 (Drizzle behind ports; forward-only migrations; drift-by-tag,
  §5/RT-005), ADR-021 (composite `(workspace_id,id)` actor identity, §4; fail-closed `authorize()` ordering, §2;
  live `grant ∩ delegator`, §6; seeded system principal, §9), ADR-022 (append-only revisions + per-entry seq, §4b;
  bounded expression language, amendment), ADR-023 (§4 snapshot-before-DDL — amended here; §8 sandboxed reads;
  §12 seam concretized here), ADR-024 (§4 isolation rungs — Rung 1 vs Rung 2)

## Context

Tovu's admin currently has no "Database"/"Storage" surface at all. The product's top guarantee — an update or
migration must never brick a live, end-user-operated SQLite site (ADR-011) — has no home in the admin UI where an
operator can *see* what happened to their schema, confirm a forward migration, or recover from a bad one. A 3-round
adversarial swarm debate (2026-07-09) was run to design this surface from scratch, explicitly rejecting a
WordPress-style "Database" page in favor of a narrower, safer "Storage" surface. All four participants (Primary,
Fable, Codex, Gemini) converged unanimously on the shape (D1–D6 below) but the final cross-review round (R3b)
found three blockers and six must-fix text corrections that had to be folded before the design could become an
ADR — see the Decision Ledger in the consensus report. This ADR is that fold-in, written up as a formal decision.

**Why "Storage," not "Database."** Every peer, working independently in the blind first round, rejected building a
raw-row-edit database console (a category error against the write chokepoint/authorize/append-only-revisions
model this codebase already commits to) and independently proposed renaming away from "Database." The surface that
survived is read-first: a **Timeline** rendering the never-brick ledger (migrations, snapshots, index provisions,
template upgrades, each anchored to a restore point, with a drift banner on top), plus exactly **one write
operation** — "migrate this site forward now," snapshot-anchored, with no rollback verb (migrations are
forward-only per ADR-015; the only reverse gear is snapshot restore, which lives on the sibling Recovery surface).

## Decision

### 1. Surface shape — Storage, not Database

- **Timeline is the centerpiece**: a read-first rendering of every migration, snapshot, index provision, template
  upgrade, and interrupted-migration event, each anchored to a restore point, with a drift banner surfaced above it.
- **One write operation**: forward-migrate, snapshot-anchored, no rollback verb. Raw row edit is **never** offered
  (category error against the write chokepoint). Free-form SQL console is **never** offered in v1. Database-first
  mode (creating a site by pointing at an existing external DB) is **never** offered — conflicts with ADR-012's
  template-instantiation model.
- Pure health metrics **merge into the planned Site Health surface**, not into Storage.
- **Layering**: a thin Tier-2 `db-ops` library → the Tier-5 admin Storage screen → an optional Tier-3 read-only
  browser (off by default).
- **Backups and Recovery are sibling faces over one shared snapshot primitive** — Storage narrates the timeline;
  Recovery executes a restore. They are not the same screen.

### 2. `db-ops` port + restore points (D1) + the sidecar ops journal (B1)

- A dialect-neutral `db-ops` port sits above the ADR-015 line; SQLite and Postgres adapters hold all dialect
  specifics. `getCapabilities()` reports `restorePoint.costClass: 'cheap'|'expensive'|'unavailable'` +
  `kind: 'file-snapshot'|'logical-dump'|'external'`. **cheap → one-click migrate; expensive → migrate allowed but
  the confirmer must acknowledge a cost/disk estimate carried in the plan hash; unavailable → the in-product
  migrate is refused** (pending + drift + a runbook pointer only — no attestation override; an "I attest external
  backups exist" bypass was rejected as unenforceable).
- SQLite restore point = SQLite online-backup whole-file copy of `content.db`. Postgres restore point = `pg_dump
  -Fc` logical dump plus a **blue/green schema repoint on restore, never in-place**. PITR is recorded only as an
  `external` marker the adapter cannot itself execute.
- **The operational record — `storage_ledger`, `migration_runs`, `restore_points`, and the restore-point artifacts
  themselves — lives in a sidecar ops journal in the install-dir, not inside `content.db`.** **Added, round-1 audit
  fold (2026-07-14, see item 11): every `restore_points` row MUST persist `watermarkAtCapture` — the
  `storage_write_watermark` value at the moment the restore point was taken — alongside the schema version+tag it
  already captures.** ADR-045 §2/§3's discarded-window disclosure computes its loss count as `current watermark −
  the selected restore point's watermarkAtCapture`; without this column that computation has no baseline and the
  disclosure is not computable at all. This was an under-committed dependency ADR-045 assumed but this ADR never
  stated. Concretely, extending
  ADR-012's install-dir tree with a new `ops/` entry:

  ```
  <install-dir>/
    config.json
    content.db
    uploads/  themes/  plugins/  overrides/
    .site-meta.json
    ops/
      storage-journal.db          # SQLite, always — even on a Postgres-backed site
      restore-points/<id>/artifact + manifest.json
  ```

  This is the direct fix for the blocker this design started with: restoring `content.db` from a snapshot must
  never erase the very incident record that snapshot restore is supposed to narrate, and boot recovery must be
  able to append a `migration.interrupted` row even when `content.db` itself won't open. A file that lives outside
  `content.db`'s own restore boundary is the only way both properties hold. `content.db` **may** carry a
  **non-authoritative, rebuildable mirror** (`storage_ledger_mirror`) purely so the Timeline UI can join ledger
  rows against entries/actors in one query; boot reconciliation rebuilds the mirror from the sidecar (the sole
  source of truth) whenever the mirror's watermark lags. `ops/` is a sibling of `content.db` in the install-dir,
  so it travels with export/import exactly like every other named entry ADR-012 already specifies — portability is
  unbroken, not newly invented.
- **`index.provision` rows carry `restorePointId = NULL`** — see the ADR-023 §4 amendment below (item 6).

### 3. Migrate-forward + human-confirm gateway (D2), corrected

- Two-phase gateway command pair: `plan()` (read, `storage.read`) → `confirm({planId, planHash})` (mints a
  single-use token, ~10 min TTL, bound to `planHash+siteId+confirmerPrincipalId`, callable only by `kind='user'`)
  → `execute({confirmationToken})` (`storage.migrate`).
- **`authorize()` runs at both confirm and execute, fail-closed, not only at execute** — a token must never be
  minted for a principal who does not already hold `storage.migrate`, and the check is re-run (not cached) at
  execute because ADR-021 §6's `grant ∩ delegator` is live, not snapshotted: a delegator disabled between confirm
  and execute must collapse the agent's access immediately.
- `execute` preconditions, in order: `authorize()` fail-closed before idempotency (ADR-021 §2) → token
  unexpired+unredeemed → recompute plan vs live state, hash mismatch → `PLAN_STALE` reject → actor-class rule (user
  mints+redeems own; **agent may execute only with a token minted by its own delegator**
  (`token.confirmer === agent.delegatedBy`); api_key confirmer must be the owning user).
- **State machine is dialect-conditional.** SQLite (in-place):
  `IDLE→PLANNED→CONFIRMED→QUIESCING→SNAPSHOTTING→APPLYING→VERIFYING→JOURNALING→DONE`, failure edges
  `SNAPSHOT_FAILED→ABORTED_SAFE`, `APPLY/VERIFY-fail→RESTORING→RESTORED|RESTORE_FAILED`. **Postgres (blue/green,
  the D1 commitment the state machine previously failed to model):**
  `IDLE→PLANNED→CONFIRMED→QUIESCING→SNAPSHOTTING(pg_dump of blue)→APPLYING(schema built on a green
  target, blue keeps serving)→VERIFYING(green verified against plan)→CUTOVER(atomic repoint blue→green)→
  JOURNALING→DONE`, with `APPLY/VERIFY-fail→RESTORING(discard green, blue never stopped serving)→RESTORED` and a
  distinct `CUTOVER_FAILED→ROLLBACK_TO_BLUE` edge (cutover failing after a validated green is a different failure
  shape than apply/verify failing — repoint back to blue, retain green for forensics).
- Preflight drift check compares `.site-meta.json {schemaVersion, schemaTag}` vs `__drizzle_migrations` **by tag
  identity, never count** (ADR-015 §5/RT-005); `ahead|diverged` refuses forward-migrate and routes to Recovery.
- Quiesce closes the ADR-022 §4a chokepoint and drains in-flight writers, recording `revisionSeqAtQuiesce` as a
  **global watermark** (corrected below, item 5) — not a per-entry ADR-022 §4b sequence.
- On failure: re-snapshot the broken state, then restore, then present the operator the exact discarded write
  window **before** they confirm the restore (D5).
- **Boot-time crash reconciliation**, unchanged in mechanism from the merged design: a boot scanner converts any
  non-terminal `migration_runs` row (now read from the sidecar journal, item 2 above — the only place guaranteed
  to survive a mid-crash restore of `content.db`) into a `migration.interrupted` ledger row and routes to
  Recovery, blocking normal site open until resolved. **This is a real, accepted downtime vector** — a crash
  mid-DDL means the site does not reopen instantly, it blocks on restore-or-complete — traded deliberately for
  "never boot into a half-migrated schema."

### 4. Ledger, composite actor identity, and the ADR-023 §4 carve-out

- One append-only `storage_ledger` (now living in the sidecar journal, item 2): kinds `core.migration |
  plugin.ddl | index.provision | index.drop | template.upgrade | restore_point.created | restore.executed |
  migration.interrupted`. Columns include `scope CHECK(scope='site')`, `siteId`, correlation id, restore-point id,
  schema before/after (version+tag), drift status, outcome, discarded-window bounds, detail JSON.
- **Composite actor identity, not a bare actor id.** Every ledger/`migration_runs` row that references an actor
  carries `(actorWorkspaceId, actorId)` and, where delegated, `(delegatedByWorkspaceId, delegatedById)` — matching
  ADR-021 §4's `(workspace_id, id)` shape everywhere a principal is referenced, rather than the bare `actor_id`/
  `delegated_by` an earlier draft carried. Because the sidecar journal is a physically separate SQLite file from
  `content.db` (where `principals` lives), this composite pair is **not** a DB-enforced foreign key — SQLite has no
  cross-database FK — it is populated by the core-mediated write path at append time and cross-checked as a soft,
  value-join reference by the Timeline UI. This is stated explicitly so the sidecar move (item 2) does not silently
  regress ADR-021 §4's guarantee back to application-only enforcement.
- **Site-scope exemption**, extended not pre-declared: `SITE_SCOPE_EXEMPT_TABLES = ['storage_ledger',
  'migration_runs', 'restore_points']` is a deliberate decision **extending** ADR-007 Decision 2's escape hatch to
  ports/tables — Decision 2 itself names workspace-less **events** only, and does not pre-declare this. Enforced by
  a `scope CHECK` + a `SiteScoped` brand type + the enumerated list the ADR-007 contract-test suite reads (any
  unlisted table failing workspace-scope tests fails CI).
- **ADR-023 §4 amendment (M1), stated formally:** "before every schema change that enters core's migration path"
  is narrowed to row-data-bearing table-shape changes (`CREATE`/`ALTER`/`DROP TABLE`, column changes).
  `CREATE INDEX`/`DROP INDEX` against the ADR-022 §3 expression-index mechanism are excluded from the
  pre-operation restore-point requirement — they mutate no table shape or row data, and their reversal is exactly
  symmetric (`DROP INDEX`). `index.provision`/`index.drop` ledger rows therefore carry `restorePointId = NULL` by
  design. The ADR-023 §3 disk-headroom preflight still applies regardless of this carve-out. **`CREATE INDEX
  CONCURRENTLY` is required on Postgres** — a foreground index build write-locks the table for its duration, which
  is unacceptable against a live site; Postgres's `CONCURRENTLY` cannot run inside a transaction block, so the
  Postgres adapter's index-provision path is a distinct non-transactional code path (SQLite has no equivalent and
  needs none — single-writer WAL is fast enough at v1 scale).

### 5. Discarded-window disclosure is a global, cross-table watermark, not a per-entry count

`revisionSeqAtQuiesce` is corrected from a scalar compared against ADR-022 §4b's **per-entry** revision sequence
(which cannot be compared meaningfully against a single site-wide number) to a genuine global watermark: a
single-row counter, `storage_write_watermark`.

**Corrected by round-1 `/audit-work` (2026-07-14 — see item 11): this paragraph originally claimed the watermark is
"incremented-and-stamped, in the same transaction as the write" across every write path, including writes that land
in `content.db` while the watermark counter itself lives in the sidecar ops journal — a physically separate SQLite
file. That is not achievable: `content.db` runs single-writer WAL (item 4), and SQLite does not provide atomic
multi-file commit when any attached database is in WAL mode. The corrected mechanism:**

- **The authoritative watermark counter lives in `content.db`** (not the sidecar), incremented in the same
  transaction as the write it stamps — this is the only way the increment is genuinely atomic with the write it
  claims to cover. The sidecar ops journal carries a **mirror** of the watermark's value, refreshed immediately
  after each `content.db` commit. **Corrected by round-2 `/audit-work` (2026-07-14 — see item 11): the boot-time
  reconciliation mechanism this paragraph originally specified — rebuilding the mirror from `storage_ledger`'s max
  recorded value — does not work. `storage_ledger` (item 4) records operational/schema events (migrations, DDL,
  index provisions, restores), not one row per ordinary content write, so its max value is not a proxy for the
  watermark's true value. The corrected mechanism: on every boot, if `content.db` opens successfully, the sidecar
  mirror is reconciled directly from `content.db`'s authoritative counter (the only genuine source of truth) — not
  derived from the ledger. If `content.db` cannot be opened (the exact case this reconciliation exists to handle),
  the mirror cannot be refreshed at all; the Timeline/Recovery UI must render the discarded-window disclosure as an
  explicit unknown/lower-bound estimate in that case, never a precise count it cannot actually compute.** This
  inverts item 2's stated mirror direction for this one counter only; every other sidecar record (the ledger
  itself, restore points, migration runs) keeps the sidecar-is-authoritative shape unchanged, because those
  records do not need to be atomic with a `content.db` write the way this counter does.
- **Write-path coverage: a real, evolving inventory, not an assumption (folded across rounds 3-5, 2026-07-14).**
  The claim that "the change-set gateway already covers most admin mutations including identity/authz" was
  independently found false. Rather than leave this as an open placeholder, a substantial inventory was produced
  against the live codebase and is presented below — but (see the note after the table) five successive review
  passes each found more that the previous pass missed, so this is deliberately **not** claimed as complete;
  option (b) is satisfied by honest, evolving disclosure, not by a claim of exhaustiveness this process has
  proven it cannot make. **This is what lets this ADR honestly move toward Accepted** — Accepted means "this is
  the committed design," not "every write path is already migrated"; the actual migration work (option (a)) is
  real, tracked implementation-phase work, sequenced into whichever spec/phase plan builds Storage, not a
  precondition for the design itself being sound.

  | Write path | Observability today | Disposition |
  |---|---|---|
  | `identity/grant-service.ts` — `createUser`/`createRole`/`createPolicy`/`assignRole`/`attachPolicy` | **None** — no change-set, no outbox at all | (b) not yet covered |
  | `members/write-service.ts` — `disableMember`, `requestSignInLink`, `completeSignIn`, `updateProfile`, `compSubscription`/`setSubscriptionStatus` (latent) | **None** — module has no `OutboxPort` in its deps despite its own doc comment claiming one | (b) not yet covered |
  | `seo/write-service.ts` — `setEntrySeoOverrides` | **None** | (b) not yet covered |
  | `media/media-service.ts` — upload/update/trash/purge | **None** | (b) not yet covered |
  | `integrations/subscriptions.ts` — create/update/pause/delete | **None** | (b) not yet covered |
  | `features/presentation/presentation.ts` — `setActiveTheme` | **None** | (b) not yet covered |
  | `forms/delete-submission.ts` | **None** — bare route-to-repo call, no service layer at all | (b) not yet covered |
  | `features/settings/write-service.ts` (+ `seo/settings.ts`'s `setSeoSettings`, which piggybacks on it) | Own `setting_revisions` ledger, no outbox/change-set | (b) not yet covered |
  | `newsletter/campaign-write-service.ts` | Own `newsletter_campaign_revisions` ledger, no outbox; **not yet wired to any admin route** (latent) | (b) not yet covered |
  | `newsletter/send-pipeline.ts` | Writes `campaignRepo.saveCampaignRow` directly across several steps — some paired with `appendRevision`, some not (`freezeAudience`'s campaign update, line 148, has neither); the outbox use in this file (line 163) drives send-batch job dispatch, not write-change notification | (b) not yet covered |
  | `newsletter/lists.ts`, `newsletter/subscriptions.ts`, `newsletter/confirmation.ts`, `newsletter/unsubscribe.ts` | Direct list/subscription/token writes, no outbox | (b) not yet covered |
  | `features/settings/purge-service.ts` — `purgeTenantSettings` | Appends `setting_revisions` and deletes value rows in one transaction, no outbox | (b) not yet covered |
  | `forms/submit-service.ts` | Explicitly documented as bypassing `executeCommand`; persists a submission, then enqueues outbox — same "has outbox, no change-set" shape as menus/redirects | (b) not yet covered, milder gap |
  | `media/rendition-service.ts` — lazy rendition generation | Writes blob/rendition rows directly, no outbox | (b) not yet covered |
  | `analytics/ingest.ts` | Writes through its sink directly, no outbox — **memory-backed only, no `repo.sqlite.ts` adapter exists** | (b) not yet covered |
  | `members/consent-service.ts` | `deps.consents.save(consent)` — the actual source-of-truth write the `newsletter/*` consent-adjacent files above delegate to | (b) not yet covered |
  | `features/workspace/create.ts` | Bypasses `executeCommand` but **does** call `outbox.enqueue` directly | (b) not yet covered, milder gap |
  | `integrations/delivery.ts` | Delivery-envelope/status writes (`enqueue`/`markDelivered`/`markFailed`/`envelopeStore.save`) — table's `integrations/subscriptions.ts` row above doesn't cover this separate write path | (b) not yet covered |
  | `redirects/hit-sink.ts` | Redirect-hit capture writes — **memory-backed only, no sqlite adapter exists (by design, per its own header)** | (b) not yet covered |
  | `media/blob-gc.ts` | Destructive GC path: tombstones then removes blob/journal rows | (b) not yet covered |
  | `identity/auth-service.ts` | Session/user writes on login/logout | (b) not yet covered |
  | `media/transform-registry.ts` | Transform registration writes | (b) not yet covered |
  | `navigation/menu-service.ts` (menus create/update-tree/assign-location/delete) | Bypasses `executeCommand` but **does** call `outbox.enqueue` directly | (b) not yet covered, milder gap |
  | `redirects/redirects.ts` (create/update/tombstone/import) | Bypasses `executeCommand` but **does** call `outbox.enqueue` directly | (b) not yet covered, milder gap |
  | `change-sets/revert.ts` | Standalone `revertChangeSet` call, explicitly documented as bypassing `executeCommand` ("that gateway wraps forward mutations, not reverts") — but **does** enqueue an outbox event when `deps.outbox` is supplied | (b) not yet covered, milder gap |
  | `posts/create.ts`, `posts/update.ts`, `pages/create.ts`, `forms/write-service.ts` (create/update) | Full `executeCommand` compliance | already covered |

  **This table is illustrative and substantial, not certified-exhaustive.** Six successive review passes (a full
  3-round external audit, a single-auditor spot-check, a targeted verification pass, and round 5's and round 6's
  independent passes) each independently found write paths the previous pass missed — empirical confirmation, not
  just an assertion, that assembling this list by manual code-reading does not converge no matter how many passes
  run. Round 6 asked two independent auditors *why*, not just to find more rows, and their diagnoses converged:

  - **No finite denominator.** Every prior pass found N more write paths with no way to answer "is that all?" —
    sampling from named seeds and fanning out to neighbors finds the neighbors, never the complement.
  - **No single grep signature is a superset.** This repo has at least four independent, non-overlapping "what
    counts as a write" shapes: Drizzle query-builder verbs (`.insert/.update/.delete`), raw SQL/better-sqlite3
    (`.run()/.prepare()`), semantic verb wrappers named after the domain action rather than the storage op
    (`enqueue`, `appendRevision`, `saveCampaignRow`, `consume`, `tombstone`, `accept`, `record`...), and in-memory
    adapter mutation (`Map.set`, array `.push`) with zero SQL signature at all. A grep tuned to any one of these
    silently misses the other three.
  - **Non-uniform naming per feature.** Each feature author picked their own mutating-method vocabulary, so
    pattern-matching learned from one feature doesn't transfer to the next.
  - **Adapter-anchoring repeats the exact blind spot it's meant to fix** — anchoring only on `repo.sqlite.ts` (or
    any single adapter kind) misses memory-only/sink-backed writers (`analytics/ingest.ts`, `redirects/hit-sink.ts`)
    that matter just as much to the disclosure.
  - **"Has an outbox call" is not one clean bucket.** `executeCommand` / same-transaction outbox / sequential
    persist-then-enqueue (the `post.ts`/ADR-043 pattern this repo has already been burned by once) / ledger-only /
    none are meaningfully different guarantees; classifying by mere presence of *any* outbox call would hide
    exactly the kind of gap the ADR-043 audit found.

  **The actual pre-acceptance Phase 0 deliverable, synthesized from both auditors' proposals:** a *typed* AST
  inventory — using the TypeScript compiler's own type checker (e.g. `ts-morph`), never text grep, so it follows
  types rather than names — anchored on two complementary, cross-validating denominators:

  1. **The closed set of `sqliteTable` exports in `src/infra/db/schema.ts`** (a finite, enumerable ground truth —
     every durable SQL write lands in one of these). For each table symbol, resolve every reference via the
     compiler's `getReferences()`, then classify each reference's enclosing call as read vs. write.
  2. **Every `*Port`/`*Repo`/sink/store interface method** whose name isn't a known reader prefix
     (`find*/get*/list*/count*/exists*/lookup*`) or whose implementation body contains durable/memory mutation
     evidence (Drizzle `insert/update/delete`, `onConflictDoUpdate`, `db.transaction`, `Map.set/delete`, array
     `push/splice`, filesystem `writeFile/rm/unlink`, blob-store `put/remove`) — this catches the table-less and
     memory-only writers (1) structurally cannot reach (`comments/`'s ports-only writes, `core/events/outbox-
     worker.ts`, in-memory-only caches).

  For every resolved write call site, emit: contract method, implementing class(es), caller, file/line, and a
  **coverage class** (`executeCommand` / `same_tx_outbox` / `sequential_outbox` / `ledger_only` / `none` /
  `unknown`) — not a binary covered/not-covered. **Fail CI** when a new mutating method appears with no coverage
  class assigned, or when this ADR's hand-written table diverges from the generated inventory — this is what
  prevents a round 7. **Cheapest de-risking step before trusting the full run:** execute the sweep against a
  single already-known-messy table first (`memberSubscriptions`, hit three different ways across this audit's
  passes) and confirm it reproduces the union of every previously-found call site for that one table before
  building the full 35-table harness — roughly 30 minutes, and it validates the whole approach before investing
  in it.

  Until that automated inventory exists and runs clean, the Timeline/Recovery UI's discarded-window disclosure
  must render as **partial, explicitly labeled, with no claim of exhaustiveness** — the table above demonstrates
  the scope of the gap, it does not close it.
- **`sessions` and `member_sessions` do not currently carry any column capable of recording this watermark** (no
  `seq`/`updated_at`/watermark column exists on either table today). Enumerating "Z sessions" in the disclosure (see
  ADR-045 §3 Step 2) is not implementable against the current schema. This ADR now requires adding a
  watermark-stamping column to both tables as part of the same write-path-inventory work above, before the
  disclosure may include a session count; until that column exists, the disclosure omits sessions entirely rather
  than asserting a number it cannot honestly compute.

Quiesce records the watermark's value at the moment write-quiesce completes. The discarded-window disclosure shown
to the operator **before** they confirm a restore enumerates every row stamped past that watermark **across
whichever write paths the inventory table above marks "already covered"** — `posts`/`pages` writes and plugin-table
typed writes (ADR-023 §7) today; the remaining rows once their migration onto the watermark chokepoint closes. The
disclosure must be honest about what it does and does not yet cover — see item 11.

### 6. Agent tools + permissions (D4)

- Catalog: `storage.read`, `storage.migrate`, `backup.create`, `backup.restore` (ADR-021 §3 house style).
- Reads (`storage_get_health`, `_get_schema_state`, `_list_pending_migrations`, `_query_timeline`,
  `_list_restore_points`) are freely agent-callable; `storage_plan_migrate_forward` is a read;
  `storage_execute_migrate_forward` is destructive and token-gated per item 3 above.
- **`backup_create_restore_point`** is the named tool for the `backup.create` permission (an earlier draft of this
  design introduced the permission without a corresponding tool) — mints a restore point independent of any
  migration, subject to the same authorize()-at-mint discipline as item 3 wherever cost applies.
- **Restore is a Recovery tool, not a Storage tool.** An agent asking to "roll back" receives
  `storage_get_restore_guidance` — a deep-link routing envelope, never a lever. The actual `recovery_restore_to`
  lives on the Recovery surface (`backup.restore`), human-confirm token required for **every** actor including the
  owner.
- Enforcement chain: server-side tool filter (ADR-014) → `authorize()` fail-closed (ADR-021 §2) → agent
  `grant ∩ delegator` live (ADR-021 §6) → confirmation token as an independent second gate → change-set stamps
  actor + delegatedBy.

### 7. Deep-link contract (D5) — unsigned, untrusted, re-verified everywhere

One `StorageContextEnvelope` (`v, correlationId, siteId, ledgerEventId?, restorePointId?, drift, intent, issuedAt`),
**unsigned and untrusted end to end**: every receiving surface re-runs `authorize()` and recomputes drift
server-side on arrival; the envelope carries display continuity only. **Every id inside the envelope is untrusted
and must be re-looked-up server-side** by the receiving surface — an envelope carrying a stale or forged id fails
closed to "not found / re-derive from current state," never trusted implicitly. Hop 1: Site-Health storage card →
Storage timeline (mints a fresh correlation id — the incident thread). Hop 2: timeline row → Recovery restore
(pre-focused, discarded-window preview shown **before** the confirm step, per item 5's disclosure). Hop 3: Recovery
completion → back to the same timeline. Authority lives only in permissions and confirmation tokens; deep links
carry context, never authority. **`siteId` vs `workspaceId` remains SPEC-003 OQ-04**, not resolved by this ADR — the
envelope carries `siteId` as-is, pending that open question's resolution elsewhere.

### 8. Tier-3 read-only browser (D6), with mandatory redaction

`dbOps.describeTables()` + `dbOps.readRows({table, where?: BoundedPredicate[], orderBy?, cursor, limit≤200})`, where
`where` uses the **ADR-022 bounded/total expression language, never SQL text**; core executes read-only, with a
statement timeout, a row cap, and injects workspace filtering (site-scope-exempt tables need site-admin
`storage.read`). **This is a hardening choice this design makes deliberately — it is not required by ADR-023**,
whose §8 already permits sandboxed raw `SELECT`s bounded by `sqlite3_set_authorizer` + `PRAGMA query_only` + a
progress-handler timeout; D6 goes further than that floor by choice.

**Sensitive-table redaction is mandatory, unconditional, and not gated by permission tier.** `users`, `api_keys`,
and `sessions` carry hash/token columns that must never reach a `storage.read` holder through this surface — not
even a site-admin. Every core table's Drizzle schema (ADR-015) marks hash/secret-bearing columns `sensitive: true`;
`describeTables()` never lists a `sensitive` column at all, and `readRows()` unconditionally excludes it from
projection before the row leaves core. Plugin-owned tables (ADR-023 `dataModule`) inherit the identical mechanism
via the same manifest flag, so the rule is symmetric across core and plugin tables, not a core-only carve-out.

### 9. Known residual — quiesce is best-effort (record as a limitation, not a defect)

The chokepoint is CI-canary discipline, not a runtime wall: a Tier-3 in-process plugin (ADR-024 blast radius) can
write around quiesce during snapshot/apply, so "0 discarded" holds only for chokepoint-visible writes. The ledger
records `quiesceIntegrity: 'chokepoint-only'` whenever any Tier-3 plugin is enabled, surfaced in the confirm plan
before the operator commits. **This closes fully only at ADR-024 §4 Rung 2 (the capability sandbox) — not Rung 1**
(per-site `utilityProcess` isolation). An earlier draft of this design cited Rung 1 here; that is the same
over-claim ADR-023 §0 independently corrected for its own recoverability/access-control halves (its T1/T7 fixes),
for the identical reason: Rung 1 drops the blast radius from machine→site but does not restrict `fs` access, so a
Tier-3 plugin process retains ordinary filesystem access to open its own direct connection to `content.db` and
write around the chokepoint even post-Rung-1. Only Rung 2's capability sandbox makes that structurally
unavailable.

### 10. SERVE_SITE reconciliation (B2) — amends SPEC-003

SPEC-003's `SERVE_SITE` today forward-migrates unconditionally on boot with no plan/confirm/snapshot, which
bypasses the entire ceremony above simply by restarting a site under a newer runtime. **Chosen resolution: route
serve-time migration through the same snapshot-anchored path, gated by this ADR's own `costClass` distinction,
rather than either "always auto-migrate" (unsafe) or "always refuse" (an availability regression for the common
low-risk case).**

- If the boot-time drift check shows the site behind the runtime **and** `plan().costClass === 'cheap'` (the
  common SQLite whole-file-snapshot case): `SERVE_SITE` runs the same state machine as an interactive migration —
  snapshot-before-DDL, verify, journal — under a **reserved no-token boot policy**. The token-mint/confirm step is
  deliberately skipped, not accidentally bypassed, and the operation is attributed to the seeded `kind='system'`
  principal (ADR-021 §9) via the composite actor identity (item 4). Every safety property of the ceremony holds;
  only the interactive human token is intentionally absent for this low-risk, no-cost-acknowledgment-needed case.
- If `costClass` is `'expensive'` or `'unavailable'` at boot (Postgres blue/green, or an external-only backup
  mechanism): `SERVE_SITE` **refuses to auto-migrate.** The site boots into a degraded `PENDING_MIGRATION` state
  — admin reachable, public serving refused — surfacing the Timeline's drift banner and requiring an interactive
  plan→confirm→execute before normal serving resumes.
- **Required SPEC-003 amendment (recorded here, not performed by this ADR):** the `SERVE_SITE` behavior column
  ("forward-migrates db if older; updates schemaVersion+schemaTag together after migration; starts listener") must
  be revised to the cost-gated branch above, and `state.spec.md` §4's status lifecycle must gain the
  `PENDING_MIGRATION` state plus its illegal-state additions (a `PENDING_MIGRATION` site must not silently resume
  public serving without either an interactive execute or a later boot where `costClass` has become `'cheap'`).

## Consequences

- **Never-brick gets an admin-visible narrative** (the Timeline) without opening a raw-SQL or raw-row-edit surface
  that would be a category error against this codebase's write-chokepoint/authorize/append-only-revision model.
- **The operational record survives the incidents it exists to narrate** (B1) — a design property the R1 merged
  draft did not have, since an in-`content.db` ledger is erased by the very restore it should describe.
- **Forward-migration ceremony can no longer be silently bypassed by a restart** (B2) — but the fix is cost-gated
  rather than universally friction-adding, preserving the "site just starts" UX for the low-risk SQLite case while
  closing the bypass for the higher-risk Postgres blue/green case.
- **Actor attribution on every ledger row is now composite and workspace-safe** (B3), at the cost of that
  attribution being a soft, application-enforced reference rather than a DB-enforced FK, because the sidecar
  journal is a physically separate file from `principals`. This tradeoff is accepted and stated, not hidden.
- **ADR-023 §4 gains a formal, explicit carve-out** for index provisioning (M1) rather than an implicit,
  undocumented exception — future readers of ADR-023 will see this ADR's amendment rather than infer it.
- **`authorize()` now runs twice** across the confirm/execute lifecycle (M2) — a small latency cost, in exchange
  for closing a live-delegator-collapse gap ADR-021 §6 already promises elsewhere.
- **The discarded-window disclosure's stated blast radius was itself corrected by round-1 audit** (M4, see item
  11) — the original claim of covering entries, change-sets, sessions, identity/authz, and plugin-table writes
  overstated what the current codebase's write chokepoint actually covers. The corrected design requires an
  explicit write-path inventory and labels the disclosure partial until every path closes — honesty about a known
  gap, not a claim of completeness that doesn't hold yet.
- **Sensitive columns can never leak through the Tier-3 browser** (M5), at the cost of every core/plugin schema
  needing an explicit `sensitive` flag maintained going forward — a small, permanent schema-authoring discipline.
- **Postgres blue/green now has a modeled cutover phase** (M6), closing a gap where the state machine silently
  assumed in-place apply for a dialect that was never going to get one.
- **Quiesce integrity is honestly staged** (residual + M3): "0 discarded" is a chokepoint-visible claim, not an
  absolute one, until ADR-024 §4 Rung 2 ships — and this ADR now cites the correct rung.

## 11. Round 1 audit fold (2026-07-14), amended by rounds 2 through 6

**Round 2 update:** round-1's fix (below) moved the authoritative watermark into `content.db` but its stated
boot-reconciliation mechanism was itself factually wrong — Codex (gpt-5.5, high) caught this in round 2:
`storage_ledger` doesn't record ordinary content writes, so reconciling the sidecar mirror from the ledger's max
value doesn't work. Corrected in item 5's text above: boot reconciliation now pulls directly from `content.db`'s
authoritative counter when it opens, and the disclosure degrades to an explicit unknown/lower-bound estimate when
it can't. agy and Fable's round-2 passes did not independently catch this — Codex was the only one of three.

**Round 3 update (post-audit closure, 2026-07-14):** the write-path-inventory requirement below originally read as
a placeholder ("must be produced") gating this ADR's move to Accepted on work not yet done. A first-pass inventory
was produced against the live codebase and folded into item 5's table.

**Round 4 update (2026-07-14):** a verification pass (Codex, targeted) found the round-3 inventory itself
incomplete — several more real write paths (`purge-service.ts`, four more `newsletter/*` files, `forms/submit-
service.ts`, media rendition writes, analytics ingest) had been missed. This is the **third** consecutive pass to
find gaps a prior pass missed (round 1's original audit, the round-3 spot-check, and now this verification pass),
which is itself the signal: manually assembling this list by reading code does not converge. Item 5's table now
states this plainly — it is illustrative evidence of scope, not a certified-exhaustive inventory — and requires a
**systematic, automated** inventory (script-driven, cross-referencing every adapter's mutating methods against
their call sites) as the actual Phase 0 deliverable, rather than treating any hand-assembled table as "done."

**Round 5 update (2026-07-14):** two more independent passes (Codex + Fable) each found yet more missed write
paths (`consent-service.ts`, `workspace/create.ts`, `integrations/delivery.ts`, `redirects/hit-sink.ts`,
`blob-gc.ts`, `identity/auth-service.ts`, `media/transform-registry.ts` — the fourth and fifth consecutive passes
to find gaps) — but both, independently, endorsed the round-4 reframe as correct, treating their own new finds as
further empirical proof rather than evidence the reframe was wrong. Fable additionally caught that the automation
scope as originally specified ("`repo.sqlite.ts` adapters") would itself have reproduced the memory-only blind
spot, since `analytics/ingest.ts` and `redirects/hit-sink.ts` have no SQLite adapter at all — corrected to cover
all adapter kinds. Codex separately caught leftover round-3 text still claiming "the full inventory was produced,"
directly contradicting the reframe — removed.

**Round 6 update (2026-07-14):** rather than ask for more rows, both auditors were asked to diagnose *why* every
pass kept finding more, and to propose an actual fix. Both converged independently on the same root cause (no
finite denominator to check completeness against, plus at least four non-overlapping "what counts as a write"
signatures in this codebase that no single grep pattern is a superset of) and complementary fixes (Fable: anchor
on the closed set of `sqliteTable` exports via the TypeScript compiler's reference resolver; Codex: anchor on
every mutating port/repo interface method, classified by coverage class, enforced in CI). Item 5's automation
description above is the synthesis of both proposals, replacing the earlier vague "a script that cross-
references..." placeholder with an actually-buildable spec.

Audited under `TM-ADR-STORAGE-CONTENT-004` by three independent auditors (Codex gpt-5.6-terra/high, agy/Gemini 3.1
Pro High, Fable/Opus in-host). All three independently found the same underlying defect class by different routes:
the watermark/disclosure design claimed more write-path coverage and cross-file transactional guarantees than the
current codebase and SQLite's own WAL semantics actually support. Fable additionally passed this ADR at the auditor
level (9.0) while still naming the defect; the Coordinator overrode that PASS to FAIL given the corroborating
agy/Codex findings and the safety-critical nature of the disclosure this defect feeds (ADR-045 §3 Step 2) — see the
external-audit run for the full cross-auditor reasoning.

- **Fixed (this fold):** the cross-file same-transaction claim (item 5) — authoritative watermark moved into
  `content.db`, sidecar carries a reconciled mirror.
- **Fixed (this fold):** the false "gateway already covers most admin mutations" claim (item 5) — replaced with an
  explicit pre-acceptance write-path inventory requirement naming the concrete bypasses found.
- **Fixed (this fold):** the sessions/`member_sessions`-watermark-column gap (item 5) — disclosure now omits
  sessions until the column exists, rather than asserting an uncomputable count.
- **Fixed (this fold):** `restore_points` did not commit to persisting a watermark-at-capture baseline (item 2),
  which ADR-045's discarded-window disclosure assumes exists — now an explicit required column.
- **Accepted as-is, not a defect:** the `SITE_SCOPE_EXEMPT_TABLES` extension of ADR-007 Decision 2 (item 4) — all
  three auditors (where they addressed it) agreed this is a disclosed, CI-enforced, deliberate extension, not a
  silent violation. No change made.

## Open Questions

- **`siteId` vs `workspaceId` (SPEC-003 OQ-04)** is inherited, not resolved, by this ADR — the deep-link envelope
  (§7) and the sidecar journal's site-scoping both assume `siteId` is stable and sufficient for v1's
  single-workspace-per-`content.db` topology (ADR-021 §7), but the desktop multi-site host's eventual answer to
  OQ-04 may require a revision here.
- **Degraded-serve policy under `PENDING_MIGRATION` (§10)** — this ADR recommends refusing public serving entirely
  rather than serving read-only, but that choice is not yet load-bearing anywhere else in the system and is
  flagged here as a decision SPEC-003's amendment must ratify explicitly, not one this ADR can unilaterally settle
  for a spec it does not own.
- **`storage_write_watermark`'s single-row-counter contention** under concurrent writers at scale is unaddressed —
  acceptable at v1's self-hosted, single-writer-WAL scale (ADR-022's own stated ceiling, ~≤100k entries), but not
  yet benchmarked for this specific counter's write-serialization cost. Flagged as owed, following the same pattern
  ADR-022/023/024 already use for their own unbenchmarked claims.
- **Postgres `CUTOVER` repoint mechanism** (a stable DSN/connection-alias indirection, a database rename, or a
  connection-pool re-target) is named as a requirement (§3/M6) but its concrete implementation is deferred to the
  `db-ops` Postgres adapter's own design — this ADR commits to the state-machine shape, not the repoint mechanism.
- **Whether every punch-list item survived the fold cleanly** — reviewed against the completion bar in this ADR's
  originating task: B1, B2, B3, M1–M6, the four notes-in-ADR items, and the known-residual disclosure are all
  addressed in the Decision above. None required leaving as an unresolved open question beyond the four listed
  above, which are genuinely new open items this fold-in surfaced, not punch-list items left unaddressed.

## Process note

This ADR emerged from the 2026-07-09 swarm `/debate` (Primary Opus 4.8, Fable subagent, Codex gpt-5.5, Gemini 3.1
Pro) plus this fold-in pass over its Decision Ledger. **It has since cleared a 3-round `/audit-work` pass
(2026-07-14, `TM-ADR-STORAGE-CONTENT-004`) — unanimous PASS from all three auditors as of round 3, see item 11.**
Per the process this repo's own consensus report names (`debate → audit → ADR`), that step is now complete;
Accepted status still requires an explicit human-owner sign-off, which this ADR has not yet received.
