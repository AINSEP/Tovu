# ADR-041: Storage — the Timeline Surface, Migrate-Forward Ceremony, and Sidecar Ops Journal

- Status: **PROPOSED** — direction emerged from a 3-round `/debate` swarm consensus (2026-07-09, Primary Opus 4.8 +
  Fable subagent + Codex gpt-5.5 + Gemini 3.1 Pro) that unanimously endorsed the architecture but flagged it
  **not ADR-ready** pending a punch-list; this ADR is the Software Architect's fold-in pass over that punch-list.
  **This ADR has NOT been through `/audit-work`.** A human owner must review and approve before it is marked
  Accepted — do not treat PROPOSED status as a formality.
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
  themselves — lives in a sidecar ops journal in the install-dir, not inside `content.db`.** Concretely, extending
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
single-row counter, `storage_write_watermark`, held in the sidecar ops journal (so it survives a `content.db`
restore) and incremented-and-stamped, in the same transaction as the write, by every core-mediated write path —
entries (ADR-022 §4a), the change-set gateway (ADR-008, which already covers most admin mutations including
identity/authz), session create/revoke (ADR-021 §7), and plugin-table typed writes (ADR-023 §7). Quiesce records the
watermark's value at the moment write-quiesce completes. The discarded-window disclosure shown to the operator
**before** they confirm a restore now enumerates every row across **entries, change-sets (sessions and
identity/authz land here), sessions, and plugin tables** stamped past that watermark — not just entry revisions, as
an earlier draft of this design understated.

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
- **The discarded-window disclosure is now honest about its true blast radius** (M4) — sessions, identity/authz,
  and plugin-table writes, not just entry revisions — which may surface as a larger, more alarming disclosure to
  operators than the narrower version would have. This is treated as a feature (honesty) not a regression.
- **Sensitive columns can never leak through the Tier-3 browser** (M5), at the cost of every core/plugin schema
  needing an explicit `sensitive` flag maintained going forward — a small, permanent schema-authoring discipline.
- **Postgres blue/green now has a modeled cutover phase** (M6), closing a gap where the state machine silently
  assumed in-place apply for a dialect that was never going to get one.
- **Quiesce integrity is honestly staged** (residual + M3): "0 discarded" is a chokepoint-visible claim, not an
  absolute one, until ADR-024 §4 Rung 2 ships — and this ADR now cites the correct rung.

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
Pro) plus this fold-in pass over its Decision Ledger. **It has not been through `/audit-work`.** Per the process
this repo's own consensus report names (`debate → audit → ADR`), an external audit pass is the expected next step
before this ADR could reasonably move from PROPOSED to Accepted — that step is deliberately not taken here and is
left to an explicit user request in a later session.
