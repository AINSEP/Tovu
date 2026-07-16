# Feature Spec: storage-timeline

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-017 |
| version | 1.3.0 |
| status | APPROVED |
| content_hash | sha256:bce97937e6e34ec517b57385c80b34cd9a0c7ab33360cf97e081437b438ff6a8 |
| feature_name | FEAT-017-storage-timeline |
| last_edited | 2026-07-15T00:45:00Z |
| owner | Leon Aburime |
| spec_agent | Spec Agent (Claude Sonnet 5, delegated subagent run, 2026-07-14) |
| spec_mode | brownfield |
| depends_on | SPEC-016 (content-admin-core-contract) |

---

## Numbering Disambiguation (read first)

ADR-041 §10 requires an amendment to a spec it calls "SPEC-003." That reference is to the
**pre-existing** `ADS-project-knowledge/specs/003-site-install-dir/` package from Tovu's earlier v1
spec suite (validated 2026-07-07, before this ADS-memory numbering existed) — **not** the new
dependent Collections spec, which was renumbered to **SPEC-020** under
`ADS-memory/specs/020-collections/` (Coordinator decision, 2026-07-14) specifically to resolve this
collision without editing the pre-existing, already-Accepted ADRs and historical audit records that
cite the old SPEC-003 by name. Throughout this document, the older package is cited by its full
path, never by the bare label "SPEC-003," since that label still unambiguously belongs to it now.

---

## Overview

This spec defines the Storage admin surface: a read-first **Timeline** over the never-brick ledger
(migrations, snapshots, index provisions, template upgrades, interrupted-migration events) with a
drift banner, plus the single write operation the surface offers — a snapshot-anchored
forward-migration ceremony with no rollback verb. It instantiates SPEC-016's generic
watermark/gated-mutation-gateway/actor-identity/`db-ops` contract for the `storage.migrate` domain,
per ADR-041.

---

## Problem Statement

**Current state:** Tovu's admin has no "Database"/"Storage" surface at all. An operator cannot see
what happened to their schema, confirm a forward migration, or know a migration is pending. Boot
already forward-migrates unconditionally on `SERVE_SITE` (per
`ADS-project-knowledge/specs/003-site-install-dir/state.spec.md` §3's `SERVE_SITE` row) with no
plan/confirm/snapshot ceremony, silently bypassing any future safety ceremony simply by restarting.

**Desired state:** An operator can see a Timeline narrating every schema-affecting event with a
drift banner when the site has diverged from the runtime, and can run exactly one write
operation — forward-migrate — through a plan→confirm→execute ceremony that is snapshot-anchored,
cost-aware, and dialect-conditional (SQLite in-place vs. Postgres blue/green). Boot-time
auto-migration is cost-gated rather than unconditional.

**Why now:** ADR-041 is Accepted (2026-07-14) and cleared a 3-round `/audit-work` pass; this spec
is the first of its four dependent domain specs to instantiate SPEC-016's shared contract, so its
citations become the worked example the other three (SPEC-020, SPEC-018, SPEC-019) can pattern-match
against.

**Success signal:** An operator restarting a behind-runtime SQLite site sees it auto-migrate safely
(cost-gated, cheap case); an operator restarting a behind-runtime Postgres site instead sees a
`PENDING_MIGRATION` banner and must run the ceremony interactively; neither case can silently brick
the site or silently skip the snapshot.

---

## User Journey

1. **Trigger:** An operator opens the Storage admin screen, or an agent acting on the operator's
   behalf calls a Storage read tool, because the Site-Health screen's storage card shows a drift
   warning (or the operator is simply checking on their site's schema state).
2. **Steps:**
   1. The Timeline renders the ledger (migrations, snapshots, index provisions, template upgrades,
      interrupted-migration events), each anchored to a restore point where applicable, with a
      drift banner above the list if the site is `ahead` or `diverged` relative to the runtime.
   2. The operator (or an agent holding `storage.read`) calls `storage_plan_migrate_forward`
      (`plan()`) and reviews the `MigratePlan` — target schema version/tag, `costClass`, and, for
      `'expensive'` sites, an explicit cost/disk estimate.
   3. A human operator (`kind='user'` only) calls `confirm({planId, planHash})`, receiving a
      single-use confirmation token with a fixed TTL of exactly 600 seconds (10 minutes, no
      jitter), per SPEC-016 REQ-10.
   4. The caller that will run the migration (the same user, a delegated agent, or the api_key's
      owning user) calls `storage_execute_migrate_forward({confirmationToken})`.
   5. The dialect-specific state machine runs: quiesce → snapshot → apply → verify → (Postgres
      only: cutover) → journal → done.
3. **Outcome:** The site's schema is forward-migrated exactly once, attributed to a composite actor
   identity on the new `storage_ledger`/`migration_runs` rows, or the operation is rejected with a
   specific named error (`PLAN_STALE`, `TOKEN_EXPIRED`, `TOKEN_ALREADY_REDEEMED`, `FORBIDDEN`,
   `SCHEMA_DRIFT_DIVERGED`, `RESTORE_POINT_UNAVAILABLE`) before any mutation occurs.
4. **Alternate paths:** If `db-ops.getCapabilities().restorePoint.costClass === 'unavailable'` at
   execute time, the migration is refused outright with no attestation-override bypass. If the
   `APPLYING`/`VERIFYING` step fails, the system re-snapshots the broken state and routes the
   operator to the sibling Recovery surface's own restore-confirmation flow — Storage never
   executes a restore itself. If a boot-time drift check finds the site behind the runtime with a
   `'cheap'` `costClass`, `SERVE_SITE` runs the same ceremony automatically under a reserved
   no-token boot policy; if `costClass` is `'expensive'`/`'unavailable'`, the site instead boots
   into `PENDING_MIGRATION` (admin reachable, public serving refused).

---

## Scope

**In scope:**
- The Timeline read surface: rendering every `storage_ledger` row (migrations, snapshots, index
  provisions/drops, template upgrades, `migration.interrupted` events) with restore-point linkage,
  plus the drift banner and the tag-identity drift check. (REQ-01 – REQ-04)
- The single write operation — forward-migrate — as this domain's instantiation of SPEC-016's
  generic `plan()`→`confirm()`→`execute()` gateway for `domain="storage.migrate"`, including the
  explicit rejections of raw row edit, a free-form SQL console, and DB-first site creation.
  (REQ-05 – REQ-09)
- The dialect-conditional migrate-forward state machine: SQLite in-place, Postgres blue/green with
  a `CUTOVER` phase, and their respective failure edges. (REQ-11 – REQ-14)
- Boot-time crash reconciliation for an interrupted migration. (REQ-15)
- The `storage_ledger`/`migration_runs` schema shape, the `SITE_SCOPE_EXEMPT_TABLES` membership,
  and the ADR-023 §4 `index.provision`/`index.drop` no-restore-point carve-out plus the Postgres
  `CREATE INDEX CONCURRENTLY` requirement it implies. (REQ-16 – REQ-19)
- This domain's agent-tool catalog: the free-read tools, the `plan`/`execute` pair for
  migrate-forward, `backup_create_restore_point`, and the restore-guidance routing tool.
  (REQ-20 – REQ-23)
- The `StorageContextEnvelope` deep-link contract between Site-Health, Timeline, and Recovery.
  (REQ-24)
- The optional Tier-3 read-only browser, with mandatory sensitive-column redaction and the bounded
  expression-language read contract. (REQ-25 – REQ-26)
- The quiesce-is-best-effort residual disclosure (`quiesceIntegrity`). (REQ-27)
- The required cost-gated `SERVE_SITE` amendment and the `PENDING_MIGRATION` status, as a
  requirement this domain owns even though the concrete edit target is a file outside this
  package. (REQ-28 – REQ-30)

**Out of scope:**
- The `storage_write_watermark` counter's own definition, the sidecar mirror and its boot
  reconciliation rule, the generic gated-mutation gateway mechanics (`authorize()` ordering, token
  minting/TTL/redemption, actor-class redemption rule), the composite actor-identity shape and soft
  cross-boundary reference pattern, and the `db-ops` port's `getCapabilities()`/restore-point-capture
  contract — all owned by SPEC-016, cited here by REQ/AC id, never restated. (see Integration
  Contracts)
- The actual `recovery_restore_to` tool, the Recovery screen's information architecture, and the
  discarded-write-window disclosure's exact copy/UI — owned by SPEC-019 (Backups/Recovery), per
  ADR-045 §§1–5. This spec references the hand-off but does not define SPEC-019's contract.
- The write-path inventory and remediation work that brings existing legacy write paths (e.g.
  `identity/grant-service.ts`, `members/write-service.ts`, `media/media-service.ts`, and the rest
  of ADR-041 §5's table) onto the watermark chokepoint — tracked as ADR-041 item 5's own Phase 0
  deliverable, not this spec's implementation surface.
- Editing `ADS-project-knowledge/specs/003-site-install-dir/state.spec.md`'s `SERVE_SITE` row and
  status lifecycle directly. REQ-28–REQ-30 state the required behavior this domain now owns, but
  the mechanical edit of that pre-existing file is a follow-up action against that file's own
  package, not performed by this dispatch — matching ADR-041 §10's own "recorded here, not
  performed by this ADR" stance.
- Pure health metrics (uptime, disk usage graphs, etc.) — ADR-041 §1 folds these into the planned
  Site Health surface, not Storage.
- The full ADR-021 identity/authorization schema, the full ADR-022 content-model design, and the
  full ADR-023/ADR-024 plugin data-module and trust-tier model — cited here by reference only,
  never restated, per this project's Brownfield/Legacy Code Rule 3.

---

## Requirements

- REQ-01: The Timeline MUST render, in reverse-chronological order, every `storage_ledger` row of
  kind `core.migration | plugin.ddl | index.provision | index.drop | template.upgrade |
  restore_point.created | restore.executed | migration.interrupted` for the site, each displaying
  its linked `restorePointId`, or an explicit "no restore point — index operation" label when the
  kind is `index.provision`/`index.drop`.
- REQ-02: The Timeline MUST render a drift banner above the ledger list whenever the preflight
  drift check reports the site as `ahead` or `diverged` relative to the runtime.
- REQ-03: The drift check MUST classify site status by comparing `.site-meta.json`'s
  `schemaVersion`/`schemaTag` against `__drizzle_migrations` by `schemaTag` identity, never by
  comparing migration count or `schemaVersion` index alone.
- REQ-04: The system MUST expose a Timeline query surface (`storage_query_timeline`) returning
  ledger rows filtered by kind, date range, and outcome, accepting no caller-supplied SQL text in
  any parameter.
- REQ-05: The Storage admin surface MUST NOT expose any operation that edits a table row directly,
  executes caller-supplied SQL text, or creates a site by attaching an existing external database
  as its `content.db`/Postgres backing store.
- REQ-06: `storage_plan_migrate_forward` (this domain's instantiation of SPEC-016 REQ-09) MUST be
  read-only, requiring only `storage.read`, and MUST return a `MigratePlan` including the target
  schema version/tag and the `costClass`/`kind` from `db-ops.getCapabilities()` (SPEC-016 REQ-19);
  when `costClass === 'expensive'`, the plan MUST include an explicit cost/disk estimate the
  confirmer must acknowledge.
- REQ-07: `confirm()` for `storage.migrate-forward` MUST follow SPEC-016 REQ-10 exactly, using
  `siteId` as SPEC-016's generic `scopeId` slot.
- REQ-08: `execute()` for `storage.migrate-forward` MUST follow SPEC-016 REQ-11–REQ-13's
  authorize-then-token-state-then-actor-class-then-plan-hash ordering, and MUST additionally
  refuse the call with `RESTORE_POINT_UNAVAILABLE` when
  `db-ops.getCapabilities().restorePoint.costClass === 'unavailable'` at execute time, honoring no
  attestation-override bypass field even if one is supplied. This domain requires no
  domain-specific instantiation of the actor-class-before-plan-hash ordering itself beyond
  SPEC-016's own generic coverage (SPEC-016 REQ-11, AC-38, EC-10) — no `storage.migrate-forward`-specific
  interaction with `RESTORE_POINT_UNAVAILABLE` was found that would produce a different observable
  outcome under either ordering, so no separate SPEC-017 AC is added for this rule.
- REQ-09: When every precondition in REQ-08 passes, `execute()` MUST run the dialect-specific state
  machine (REQ-11/REQ-12) exactly once per redeemed confirmation token.
- REQ-10: Quiesce MUST close the ADR-022 §4a write chokepoint before the `SNAPSHOTTING` state
  begins, and MUST record SPEC-016's `storage_write_watermark` value (SPEC-016 REQ-01) at the
  moment quiesce completes as `revisionSeqAtQuiesce` on the `migration_runs` row.
- REQ-11: For a SQLite-backed site, the migrate-forward execute state machine MUST progress
  `IDLE→PLANNED→CONFIRMED→QUIESCING→SNAPSHOTTING→APPLYING→VERIFYING→JOURNALING→DONE` on success,
  with failure edges `SNAPSHOT_FAILED→ABORTED_SAFE` and
  `(APPLYING|VERIFYING)_FAILED→RESTORING→(RESTORED|RESTORE_FAILED)`.
- REQ-12: For a Postgres-backed site, the migrate-forward execute state machine MUST progress
  `IDLE→PLANNED→CONFIRMED→QUIESCING→SNAPSHOTTING→APPLYING→VERIFYING→CUTOVER→JOURNALING→DONE` on
  success, where `APPLYING` builds schema on a green target while blue continues serving, with
  failure edges `(APPLYING|VERIFYING)_FAILED→RESTORING→(RESTORED|RESTORE_FAILED)` — `RESTORING`
  here means discarding the unpublished green schema, which normally succeeds (`RESTORED`) but can
  itself fail (`RESTORE_FAILED`), e.g. if a lock or permission error prevents the green schema from
  being dropped; blue is never touched by either outcome and never stops serving — and a distinct
  `CUTOVER_FAILED→ROLLBACK_TO_BLUE` edge.
- REQ-13: On `SNAPSHOT_FAILED`, the system MUST transition directly to `ABORTED_SAFE` without
  entering any restore state.
- REQ-14: On an `APPLYING`/`VERIFYING` failure, the system MUST re-snapshot the broken state, then
  route the operator to the sibling Recovery surface's own restore-confirmation flow — this
  domain MUST NOT itself execute a restore — presenting the discarded-write-window disclosure
  (computed per SPEC-016 REQ-06/REQ-07) before that confirmation.
- REQ-15: On boot, the system MUST scan the sidecar journal's `migration_runs` table for any
  non-terminal row and convert it into a `migration.interrupted` ledger row, blocking normal
  site-open (admin reachable, public serving refused) until the interrupted migration is resolved
  via Recovery. This reconciliation MUST run and resolve or block before the cost-gated
  auto-migrate decision (REQ-28/REQ-29) is ever evaluated — a site with a non-terminal
  `migration_runs` row MUST NOT reach `evaluateBootMigrationPolicy` until Recovery has resolved it
  (see `behavior.spec.md` §2.4 for the explicit boot-sequence ordering rule).
- REQ-16: Every `storage_ledger` row and every `migration_runs` row MUST carry
  `scope CHECK(scope='site')`, `siteId`, and a correlation id; every row of a kind other than
  `index.provision`/`index.drop` MUST carry a non-null `restorePointId`.
- REQ-17: `storage_ledger`, `migration_runs`, and `restore_points` MUST be members of
  `SITE_SCOPE_EXEMPT_TABLES` and MUST NOT carry a `workspaceId` column.
- REQ-18: `index.provision` and `index.drop` ledger rows MUST be created with `restorePointId =
  NULL` by design, applying only to `CREATE INDEX`/`DROP INDEX` against the ADR-022 §3
  expression-index mechanism, never to a table-shape-changing DDL statement.
- REQ-19: On Postgres, index provisioning MUST use `CREATE INDEX CONCURRENTLY` executed outside
  any transaction block, as a distinct non-transactional code path from the table-shape migration
  flow (REQ-12).
- REQ-20: The agent-tool catalog for this domain MUST expose `storage_get_health`,
  `storage_get_schema_state`, `storage_list_pending_migrations`, `storage_query_timeline`, and
  `storage_list_restore_points` as freely agent-callable read tools requiring only `storage.read`.
- REQ-21: The agent-tool catalog MUST expose `storage_plan_migrate_forward` (agent-callable,
  `storage.read`) and `storage_execute_migrate_forward` (agent-callable subject to SPEC-016
  REQ-13's actor-class rule, `storage.migrate`), and MUST NOT expose any tool that performs the
  `confirm()` step, per SPEC-016 REQ-22.
- REQ-22: The agent-tool catalog MUST expose `backup_create_restore_point` (permission
  `backup.create`) as a single-call, non-gateway, `authorize()`-gated write that mints a restore
  point independent of any migration, requiring an explicit `costAck` field in the request when
  `db-ops.getCapabilities().restorePoint.costClass === 'expensive'`.
- REQ-23: An agent requesting to roll back or restore MUST receive `storage_get_restore_guidance`
  — a deep-link routing response — and the agent-tool catalog for this domain MUST NOT expose any
  tool that itself executes a restore.
- REQ-24: Every hop between the Site-Health storage card, the Storage Timeline, and the Recovery
  restore screen MUST carry a `StorageContextEnvelope` (`v, correlationId, siteId, ledgerEventId?,
  restorePointId?, drift, intent, issuedAt`) that is unsigned and untrusted; the receiving surface
  MUST re-run `authorize()` and MUST re-derive drift status server-side rather than trusting any
  value carried in the envelope.
- REQ-25: When the Tier-3 read-only browser is enabled for a site, `describeTables()` MUST NOT
  list any column any core or plugin schema marks `sensitive: true`, and `readRows()` MUST
  unconditionally exclude any `sensitive: true` column from its projection before a row leaves
  core, regardless of the caller's permission tier. The agent-tool catalog for this domain MUST
  NOT expose the Tier-3 browser via any agent-callable tool.
- REQ-26: `readRows()` MUST accept only the ADR-022 bounded/total expression language for its
  `where` predicate, MUST enforce `orderBy`/`cursor`/`limit≤200`, and MUST NOT accept
  caller-supplied SQL text in any field.
- REQ-27: Whenever a Tier-3 (in-process) plugin is enabled for a site, every `migration_runs` row
  created while that plugin remains enabled MUST record `quiesceIntegrity: 'chokepoint-only'`, and
  the confirm-time plan MUST surface this value to the confirming operator before they confirm.
- REQ-28: At boot, when the drift check shows the site behind the runtime and
  `plan().costClass === 'cheap'`, `SERVE_SITE` MUST run the same state machine as an interactive
  migration (REQ-11) under a reserved no-token boot policy, attributing the operation to the
  seeded `kind='system'` principal via the composite actor identity (SPEC-016 REQ-16).
- REQ-29: At boot, when the drift check shows the site behind the runtime and `plan().costClass`
  is `'expensive'` or `'unavailable'`, `SERVE_SITE` MUST refuse to auto-migrate and MUST boot the
  site into `PENDING_MIGRATION` status: admin-reachable, public serving refused, with the
  Timeline's drift banner surfaced.
- REQ-30: A site in `PENDING_MIGRATION` status MUST NOT resume public serving except through
  either an interactive `plan→confirm→execute` that completes successfully, or a later boot where
  `costClass` has become `'cheap'`.

---

## Acceptance Criteria

- AC-01 (REQ-01) [P1]: Given `storage_ledger` contains rows of every kind, when the Timeline is
  rendered, then rows appear in reverse-chronological order and each row shows its
  `restorePointId`, or "no restore point — index operation" for `index.provision`/`index.drop`.
- AC-02 (REQ-02) [P1]: Given the drift check reports `'ahead'` or `'diverged'`, when the Timeline
  renders, then the drift banner appears above the ledger list; given the drift check reports
  `'in-sync'` or `'behind'` (in either `costClass` case), then no drift banner is shown from the
  Timeline itself — a `behind`-and-non-`'cheap'` site instead shows `PendingMigrationBanner` per
  REQ-29, never `DriftBanner`.
- AC-03 (REQ-03) [P1]: Given two runtime builds share the same `schemaVersion` index but bundle
  different migrations (different `schemaTag`), when the drift check runs, then the site is
  classified `'diverged'`, not in-sync.
- AC-04 (REQ-04) [P2]: Given a caller requests ledger rows filtered by `kind='core.migration'` and
  a date range, when `storage_query_timeline` is called, then only matching rows are returned and
  no field accepts SQL text as input.
- AC-05 (REQ-05) [P1]: Given the full Storage admin route/tool catalog, when it is inspected, then
  no route or tool performs a direct row edit, accepts arbitrary SQL text, or creates a site by
  attaching an existing external database.
- AC-06 (REQ-06) [P1]: Given a principal holding `storage.read` calls `storage_plan_migrate_forward`
  against a Postgres site with `costClass='expensive'`, when the call returns, then the
  `MigratePlan` includes an explicit disk/cost estimate field.
- AC-07 (REQ-06) [P2]: Given a `kind='agent'` and a `kind='api_key'` principal each hold
  `storage.read`, when each calls `storage_plan_migrate_forward`, then both calls succeed
  identically, matching SPEC-016 AC-11's cross-kind guarantee for `plan()`.
- AC-08 (REQ-07) [P1]: Given a `kind='user'` principal holding `storage.migrate` calls `confirm`
  for migrate-forward, when it succeeds, then the returned token is bound to
  `(planHash, siteId, confirmerPrincipalId)` and `expiresAt` equals exactly `createdAt + 600
  seconds` (10 minutes, no jitter), per SPEC-016 REQ-10.
- AC-09 (REQ-08) [P1]: Given `db-ops.getCapabilities().restorePoint.costClass === 'unavailable'` at
  execute time, when `execute()` runs, then the call is refused with `RESTORE_POINT_UNAVAILABLE`
  and no attestation-override field is honored even if supplied.
- AC-10 (REQ-09) [P1]: Given a valid, unexpired, unredeemed token for a `'cheap'` migration, when
  `execute()` is called, then the dialect-specific state machine runs to completion exactly once,
  and a second `execute()` call with the same (now-redeemed) token is rejected with
  `TOKEN_ALREADY_REDEEMED`.
- AC-11 (REQ-10) [P1]: Given quiesce completes, when the `migration_runs` row is inspected, then
  `revisionSeqAtQuiesce` equals `storage_write_watermark`'s value at that moment, and the
  `SNAPSHOTTING` state has not been entered before that value was recorded.
- AC-12 (REQ-11) [P1]: Given a SQLite site's `execute()` encounters an `APPLYING` failure, when the
  state machine is inspected, then it transitions `APPLYING_FAILED→RESTORING→(RESTORED|
  RESTORE_FAILED)`, never skipping `RESTORING`.
- AC-13 (REQ-12) [P1]: Given a Postgres site's `execute()` reaches `CUTOVER` and the repoint fails,
  when the state machine is inspected, then it transitions to
  `CUTOVER_FAILED→ROLLBACK_TO_BLUE`, distinct from the `APPLYING`/`VERIFYING` failure edge.
- AC-14 (REQ-12) [P2]: Given a Postgres migration is in `APPLYING`, when blue is inspected during
  that state, then blue continues serving traffic unaffected.
- AC-15 (REQ-13) [P1]: Given a `SNAPSHOTTING` step fails, when the state machine is inspected,
  then it transitions directly to `ABORTED_SAFE` with no `RESTORING` state entered.
- AC-16 (REQ-14) [P1]: Given an `APPLYING` failure occurs, when the operator is subsequently
  routed to confirm a restore, then the discarded-write-window disclosure is displayed before the
  restore confirmation control is enabled, and the restore itself is executed by the Recovery
  surface's own tool, never by a Storage-domain tool.
- AC-17 (REQ-15) [P1]: Given `content.db` is reopened after a crash mid-migration, when boot
  reconciliation runs, then the non-terminal `migration_runs` row is converted to a
  `migration.interrupted` ledger row and normal site-open is blocked until Recovery resolves it.
- AC-18 (REQ-16) [P1]: Given any `storage_ledger` row of a kind other than
  `index.provision`/`index.drop`, when inspected, then `restorePointId` is non-null.
- AC-19 (REQ-16) [P2]: Given a `storage_ledger` or `migration_runs` row, when inspected, then
  `scope='site'` and `siteId` is present.
- AC-20 (REQ-17) [P1]: Given `storage_ledger`/`migration_runs`/`restore_points` table
  definitions, when checked against `SITE_SCOPE_EXEMPT_TABLES`, then all three are listed and none
  carries a `workspaceId` column.
- AC-21 (REQ-18) [P1]: Given an `index.provision` ledger row is created, when inspected, then
  `restorePointId` is null and no restore-point capture was invoked for that operation.
- AC-22 (REQ-18) [P1]: Given a table-shape-changing DDL (`CREATE`/`ALTER`/`DROP TABLE`, column
  change), when its ledger row is created, then it is never classified as
  `index.provision`/`index.drop` and always carries a non-null `restorePointId`.
- AC-23 (REQ-19) [P1]: Given a Postgres site provisions an index, when the executed SQL is
  inspected, then `CREATE INDEX CONCURRENTLY` is used and the statement runs outside any
  transaction block.
- AC-24 (REQ-20) [P1]: Given a principal holding `storage.read`, when it calls each of
  `storage_get_health`/`storage_get_schema_state`/`storage_list_pending_migrations`/
  `storage_query_timeline`/`storage_list_restore_points`, then every call succeeds with no
  additional permission required.
- AC-25 (REQ-21) [P1]: Given the full agent-tool catalog for this domain, when inspected, then
  `storage_plan_migrate_forward` and `storage_execute_migrate_forward` are both present and
  agent-callable, and no tool performing a `confirm()`-equivalent step exists.
- AC-26 (REQ-22) [P1]: Given a request to `backup_create_restore_point` against a site where
  `costClass='expensive'` omits `costAck`, when the call is processed, then it is rejected with
  `VALIDATION_ERROR` rather than proceeding to mint a restore point.
- AC-27 (REQ-22) [P2]: Given a request to `backup_create_restore_point` supplies `costAck=true`
  against an `'expensive'` site and `authorize()` passes, when the call is processed, then a
  restore point is minted independent of any in-flight migration.
- AC-28 (REQ-23) [P1]: Given an agent calls a tool asking to roll back, when the catalog is
  inspected, then the only matching tool is `storage_get_restore_guidance`, and it returns a
  deep-link envelope, never executes a restore.
- AC-29 (REQ-24) [P1]: Given a `StorageContextEnvelope` carries a `restorePointId` that no longer
  exists, when the receiving surface (Recovery) receives it, then it re-derives from current state
  and reports "not found" rather than trusting the envelope's id.
- AC-30 (REQ-24) [P2]: Given an envelope is passed between the Site-Health card and the Timeline,
  when the Timeline receives it, then `authorize()` is re-run and drift is recomputed
  server-side rather than read from the envelope.
- AC-31 (REQ-25) [P1]: Given the Tier-3 browser is enabled and `describeTables()` is called
  against a table with a `sensitive: true` column, when the response is inspected, then that
  column name does not appear anywhere in the response, regardless of the caller's permission
  tier.
- AC-32 (REQ-25) [P1]: Given `readRows()` is called against the sensitive-bearing tables (e.g.
  identity/session tables carrying hash/token columns), when rows are returned, then no
  `sensitive: true` column value is present in any returned row.
- AC-33 (REQ-25) [P1]: Given the full agent-tool catalog for this domain, when inspected, then no
  tool exposes `describeTables()`/`readRows()` to an agent caller.
- AC-34 (REQ-26) [P1]: Given a `readRows()` request supplies a `where` clause using the ADR-022
  bounded expression language, when it is evaluated, then it is accepted; given a request supplies
  raw SQL text in any field, when it is evaluated, then it is rejected with `VALIDATION_ERROR`.
- AC-35 (REQ-26) [P2]: Given a `readRows()` request omits `limit`, when it is evaluated, then the
  server applies its own ≤200 cap rather than returning an unbounded result set.
- AC-36 (REQ-27) [P1]: Given a Tier-3 plugin is enabled for a site, when a `migration_runs` row is
  created, then it records `quiesceIntegrity='chokepoint-only'`, and the confirm-time plan
  surfaces this value to the operator before confirmation.
- AC-37 (REQ-28) [P1]: Given a site boots behind the runtime with `costClass='cheap'`, when
  `SERVE_SITE` runs, then the same snapshot-anchored state machine (REQ-11/REQ-12) executes under
  a no-token boot policy, and the resulting ledger rows attribute the actor as the seeded
  `kind='system'` principal.
- AC-38 (REQ-29) [P1]: Given a site boots behind the runtime with `costClass='expensive'` or
  `'unavailable'`, when `SERVE_SITE` runs, then the site enters `PENDING_MIGRATION` status, admin
  routes remain reachable, and public-serving routes are refused.
- AC-39 (REQ-30) [P1]: Given a site is in `PENDING_MIGRATION` status, when any request attempts
  public serving without an intervening successful `execute()` or a later boot with
  `costClass='cheap'`, then the request is refused, not silently served.
- AC-40 (REQ-12) [P1]: Given a Postgres site's `execute()` reaches `APPLYING`/`VERIFYING` failure
  and the subsequent `RESTORING` step (discarding the abandoned green schema) itself fails (e.g. a
  lock held on the green schema), when the state machine is inspected, then it transitions to
  `RESTORE_FAILED`, and blue continues serving unaffected throughout — distinguishing this edge
  from the `CUTOVER_FAILED→ROLLBACK_TO_BLUE` edge, which is only reachable after `VERIFYING` has
  already succeeded.
- AC-41 (REQ-08) [P1]: Given a principal lacking `storage.migrate` calls
  `storage_execute_migrate_forward` with a `confirmationToken` that has already been redeemed by a
  prior successful migration for the same site, when `execute()` evaluates the call, then the
  response is `FORBIDDEN` with `details.reasonCode === 'AUTHORIZE_DENIED'` (produced by the
  `authorize()` check) rather than `TOKEN_ALREADY_REDEEMED`, proving `authorize()` is evaluated
  before the token expiry/redemption-state check for this domain's `execute()` instantiation of
  SPEC-016 REQ-11's `authorize()`-re-evaluation ordering (`behavior.spec.md` §2.2) — an
  unauthorized caller never learns whether the token it presented was already redeemed. (This
  domain has no idempotency-key input or `DUPLICATE_COMMAND` mechanism — see the Integration
  Contracts note on SPEC-016 REQ-14 below — so this AC evidences REQ-11's ordering rule, not
  REQ-14's distinct idempotency-key short-circuit rule.)
- AC-42 (REQ-08) [P1]: Given a `kind='agent'` principal holds a valid, unexpired, unredeemed
  confirmation token for `storage.migrate-forward` (`confirmerPrincipalId` equal to the agent's
  `delegatedBy`), and the delegator's `storage.migrate` grant is revoked after `confirm()` but
  before `execute()` is called, when `execute()` re-evaluates `authorize()`, then the call is
  rejected with `FORBIDDEN` with `details.reasonCode === 'AUTHORIZE_DENIED'`, reflecting the
  delegator's current (revoked) permission state rather than the state at confirm-time, per this
  domain's instantiation of SPEC-016 REQ-15's live grant ∩ delegator intersection rule.

---

## Invariants

- INV-01: A `migration_runs` row must never enter `SNAPSHOTTING` before `QUIESCING` has completed.
- INV-02: A `storage_ledger` row of a kind other than `index.provision`/`index.drop` must always
  reference an existing `restore_points` row at the moment it is created.
- INV-03: An `index.provision`/`index.drop` ledger row must never carry a non-null
  `restorePointId`.
- INV-04: A site in `PENDING_MIGRATION` status must never silently resume public serving.
- INV-05: A Postgres migration must never apply schema changes in-place against the
  currently-serving (blue) schema.
- INV-06: `quiesceIntegrity` must never be recorded as anything other than `'chokepoint-only'` or
  its absence (full integrity) — no undocumented third value.
- INV-07: Tier-3 `describeTables()`/`readRows()` must never return a `sensitive: true` column's
  value, even transiently, regardless of the caller's permission tier.
- INV-08: `evaluateBootMigrationPolicy` must never run while a non-terminal `migration_runs` row
  exists for the site — `reconcileInterruptedMigrationOnBoot` (REQ-15) must always resolve or
  block first, per `behavior.spec.md` §2.4.

---

## Edge Cases

- EC-01: What happens when a migration is confirmed but the site drifts to `'diverged'` before
  `execute()` runs? Expected behavior: the recomputed plan hash mismatches the token's bound
  `planHash`; `execute()` rejects with `PLAN_STALE` (SPEC-016 REQ-12) and the operator is routed
  to re-plan.
- EC-02: What happens when a Tier-3 plugin writes directly to `content.db` during `QUIESCING`?
  Expected behavior: `quiesceIntegrity` is recorded `'chokepoint-only'` on that `migration_runs`
  row (REQ-27); the write is not blocked at the storage layer — this is a known, disclosed
  residual (ADR-041 §9), not a defect this spec claims to close.
- EC-03: What happens when `CUTOVER` fails after a validated green schema? Expected behavior:
  `CUTOVER_FAILED→ROLLBACK_TO_BLUE` — blue is repointed back to serving, and green is retained for
  forensics rather than deleted.
- EC-04: What happens when a restore-point capture is requested for a site whose `costClass` is
  `'unavailable'`? Expected behavior: `backup_create_restore_point` is refused — no in-product
  override exists (ADR-041 §2).
- EC-05: What happens when a Tier-3 browser `readRows()` `where`-clause references a column that
  is marked `sensitive: true`? Expected behavior: the column is excluded from the returned row
  shape unconditionally; the query does not error, it silently omits that column.
- EC-06: What happens when boot occurs and `content.db` opens successfully but the sidecar
  journal's `migration_runs` table is itself missing or unreadable? Expected behavior: boot
  treats this as equivalent to "no non-terminal `migration_runs` row found" for crash-
  reconciliation purposes; the watermark mirror reconciliation defined by SPEC-016 REQ-04 proceeds
  independently against `content.db`'s own counter and is not blocked by this condition.
- EC-07: What happens when `SERVE_SITE`'s cost-gated check finds `costClass` has changed from
  `'unavailable'` to `'cheap'` between two boots (e.g. Postgres tooling was newly configured)?
  Expected behavior: the site is no longer required to stay in `PENDING_MIGRATION` — the next boot
  re-evaluates `costClass` fresh and may auto-migrate under REQ-28 if it is now `'cheap'`.
- EC-08: What happens when a Tier-3 (in-process) plugin is disabled after being enabled during a
  prior migration? Expected behavior: `quiesceIntegrity` remains recorded as `'chokepoint-only'`
  on the historical `migration_runs` rows created while it was enabled; it is not retroactively
  rewritten.

---

## Integration Contracts

This spec instantiates SPEC-016's shared core contract for the `storage.migrate` domain. The
following SPEC-016 ids are cited by number, not restated, and the listed SPEC-017 ACs depend on
them being live:

| SPEC-016 id(s) | What it provides to this spec | SPEC-017 ACs that require it live |
|---|---|---|
| REQ-01 – REQ-05 (watermark counter, sidecar mirror, boot reconciliation, unknown/lower-bound rendering) | The `storage_write_watermark` this domain reads at quiesce time (REQ-10) and the unknown-rendering rule the discarded-window disclosure at Recovery hand-off falls back to | AC-11, AC-16 (indirectly, via the disclosure REQ-14 hands to Recovery) |
| REQ-06, REQ-07 (`restore_points.watermarkAtCapture`, disclosure partial-coverage labeling) | The baseline column `backup_create_restore_point` (REQ-22) writes and the honesty rule the Recovery hand-off (REQ-14) inherits | AC-27 |
| REQ-08 – REQ-13 (the generic `plan→confirm→execute` gateway, `authorize()` ordering, actor-class redemption rule) | The exact mechanics REQ-06 – REQ-09 instantiate for `domain="storage.migrate"`, including REQ-11's `authorize()`-before-token-state ordering | AC-06 – AC-10, AC-41 |
| REQ-15 (live agent-delegation intersection) | The live-collapse behavior an agent-executed migration must honor | AC-42 |
| REQ-16 – REQ-18 (composite actor identity; soft cross-boundary reference population/validation/orphan-tolerance/sweep) | The actor-attribution shape on every `storage_ledger`/`migration_runs` row (REQ-16), and the soft-reference discipline `restorePointId` linkage (REQ-16, INV-02) follows | AC-19, AC-37 (REQ-28's `kind='system'` attribution) |
| REQ-19 – REQ-21 (`db-ops.getCapabilities()` shape; SQLite/Postgres restore-point capture contract) | The `costClass`/`kind` values `MigratePlan` (REQ-06) surfaces and the restore-point artifact shape `backup_create_restore_point` (REQ-22) produces | AC-06, AC-09 |
| REQ-22 (agent-tool naming convention; no `confirm` tool ever) | The naming/callability rule this domain's own catalog (REQ-20 – REQ-23) must follow | AC-25 |

**Note on SPEC-016 REQ-14 (why it is not cited above):** SPEC-016 REQ-14 (`behavior.spec.md` §1.1)
defines a distinct, general-purpose rule: for a mutating call that carries **both an idempotency
key and an authorization requirement**, `authorize()` MUST run before the idempotency
short-circuit that would otherwise return a prior `DUPLICATE_COMMAND` result. This is a different
mechanism from REQ-11's execute()-internal check ordering (`authorize()` before the
confirmation-token's own expiry/redemption-state check), which this domain already instantiates
and cites above (REQ-08–REQ-13, AC-06–AC-10, AC-41). `storage.migrate-forward` has no
idempotency-key input anywhere in its contract — `api.spec.md` §4's
`storage_execute_migrate_forward` request body carries only `confirmationToken`, never a
caller-supplied idempotency key — and no `DUPLICATE_COMMAND` error code exists anywhere in this
package's `errors.spec.md` or SPEC-016's reused codes. This domain's only duplicate-suppression
mechanism is the confirmation token's own single-use redemption, which is REQ-11/REQ-13's
mechanism (already cited), not an independent instantiation of REQ-14. ADR-041 §3's execute()
precondition list uses the word "idempotency" loosely to describe that same token-redemption-state
check, not a separate idempotency-key mechanism — confirmed directly against ADR-041's text, which
names no idempotency-key field for this domain. REQ-14 therefore has no independent
domain-specific instantiation in this spec and is intentionally not cited in this table.

---

## Resolution of SPEC-016 OQ-04 (owned by this spec)

SPEC-016 OQ-04 asks whether a second `confirm()` call for the same still-valid `planId`/`planHash`
mints an independent additional token, or is deduplicated against an already-outstanding one, and
names "Spec Agent for SPEC-017" as the owner, to resolve by this spec's `spec-dod.md` sign-off.

**Resolution:** For `storage.migrate-forward`, a second `confirm()` call for the same still-valid
`planId`/`planHash` mints an independent additional single-use token; the first token remains
valid until it is separately redeemed or expires. This adopts SPEC-016's own stated default
assumption (see SPEC-016's `behavior.spec.md` §7) rather than special-casing Storage, because (a)
deduplicating would require a new token-lookup-by-plan index this domain has no other need for,
and (b) there is no domain-specific safety reason to differ — `execute()`'s actor-class rule
(SPEC-016 REQ-13) already prevents a stray second token from being redeemed by the wrong caller.

This resolution closes SPEC-016 OQ-04 for the `storage.migrate-forward` instantiation. The
Coordinator folded this resolution back into SPEC-016 itself as the contract's single global
answer (2026-07-14), since no domain-specific reason was found to diverge — SPEC-016 OQ-04 is now
marked Resolved directly, not just here.

---

## Dependencies

| Dependency | What It Provides | Failure Mode | Fallback |
|------------|------------------|--------------|----------|
| SPEC-016 (content-admin-core-contract) | The watermark/gateway/actor-identity/`db-ops` contract this spec instantiates throughout (see Integration Contracts) | If SPEC-016's mechanisms are unavailable, no gated migration can be planned, confirmed, or executed | None — fail-closed; the migrate-forward ceremony cannot proceed |
| ADR-022 §3 (bounded/total expression-index language), §4a (write chokepoint) | The `where`-predicate language `readRows()` (REQ-26) accepts, and the chokepoint quiesce (REQ-10) closes | If the expression language is unavailable, Tier-3 reads cannot be bounded safely | Tier-3 browser stays disabled for that site |
| ADR-023 §3 (disk-headroom preflight), §4 (snapshot-before-DDL, amended here per M1), §8 (sandboxed-read floor) | The headroom check this domain's snapshot step relies on, and the authorizer/`PRAGMA query_only`/timeout floor the Tier-3 browser (REQ-25/REQ-26) builds on top of | If headroom preflight is unavailable, migrations proceed without the disk-safety check ADR-023 §3 requires | None — this spec does not define an independent headroom check; it depends on ADR-023's |
| ADR-024 §4 (Rung 1 per-site process isolation, Rung 2 capability sandbox) | The isolation rung whose absence is what makes `quiesceIntegrity: 'chokepoint-only'` (REQ-27) a real, disclosed residual rather than a hypothetical one | Until Rung 2 ships, "0 discarded writes" remains a chokepoint-visible claim only | REQ-27's disclosure is the accepted mitigation until Rung 2 ships |
| ADR-012 (install-dir layout, the `ops/` sidecar tree) | The on-disk location `storage_ledger`/`migration_runs`/`restore_points` and their artifacts live in | If the install-dir layout changes without updating this spec's assumed path, boot reconciliation (REQ-15) cannot find the sidecar journal | None — blocks boot reconciliation until the path is corrected |
| ADR-015 (Drizzle behind ports; forward-only migrations; drift-by-tag RT-005) | The `__drizzle_migrations` journal and the tag-identity comparison the drift check (REQ-03) performs | If tag identity is unavailable (e.g. an older bundled migration set with no tag), the drift check cannot distinguish divergent lineages from equal ones | None — this spec assumes ADR-015's tag mechanism is present |
| ADR-021 §9 (seeded `kind='system'` principal) | The actor identity `SERVE_SITE`'s no-token boot-migration path (REQ-28) attributes its ledger rows to | If no seeded system principal exists, boot auto-migration cannot stamp a valid composite actor identity | None — boot auto-migration would need to be disabled until the seed exists |
| `ADS-project-knowledge/specs/003-site-install-dir/` (pre-existing, see Numbering Disambiguation) | The current unconditional `SERVE_SITE` behavior and `.site-meta.json` status-lifecycle definitions this spec's REQ-28–REQ-30 require amending | If that package's `SERVE_SITE` row and status lifecycle are never actually amended to match REQ-28–REQ-30, the cost-gated boot behavior this spec specifies is not implemented anywhere | None — REQ-28–REQ-30 remain unimplemented until that file is amended, tracked as a follow-up, not a blocker to this spec's own approval. **Owner:** Software Architect for SPEC-017 (must sequence the amendment as an explicit task against the pre-existing package). **Resolve by:** before Programmer work begins on REQ-28–REQ-30 — this gates only those three requirements' implementation, not this spec's own approval or the rest of this domain's rollout. |
| SPEC-019 (Backups/Recovery, dispatched in parallel, not yet written) | The `recovery_restore_to` tool and restore-confirmation UI that REQ-14/REQ-23's hand-off routes to | If SPEC-019 is not yet approved when this spec's implementation begins, the hand-off (REQ-14/REQ-23) has no receiving surface to route to | Implementation of REQ-14/REQ-23's routing may need to be sequenced after SPEC-019, a Software Architect scheduling concern, not a spec-content gap |

---

## Open Questions

- OQ-01 (carried forward from SPEC-016 OQ-01): `storage_write_watermark`'s single-row-counter
  write-serialization cost under concurrent writers at scale is unbenchmarked. — Owner: Software
  Architect for SPEC-017 — Resolve by: before this spec's architecture sign-off.
- OQ-02 (carried forward from SPEC-016 OQ-02): `siteId` vs `workspaceId` scoping. This spec uses
  `siteId` throughout for the sidecar journal's scoping (REQ-16, REQ-17), consistent with ADR-041
  §7's stated assumption for v1's single-workspace-per-`content.db` topology. — Owner: whoever
  resolves the original `ADS-project-knowledge/specs/003-site-install-dir` lineage's OQ-04 —
  Resolve by: before the desktop multi-site host ships.
- OQ-03 (carried forward from SPEC-016 OQ-03): the concrete Postgres `CUTOVER` repoint mechanism
  (a stable DSN alias, a database rename, or a connection-pool re-target) is unspecified at this
  spec's level — REQ-12 commits only to the state-machine shape. — Owner: Software Architect for
  SPEC-017 — Resolve by: before the Postgres `db-ops` adapter's implementation begins.
- OQ-04: **Resolved** — see the dedicated "Resolution of SPEC-016 OQ-04" section above.
- OQ-05: Whether the Tier-3 read-only browser (REQ-25/REQ-26) ships in the same implementation
  phase as the Timeline/migrate-forward ceremony, or is deferred to a later phase. ADR-041 §1
  calls it optional and "off by default" but does not commit to a ship date. — Owner: Software
  Architect for SPEC-017 — Resolve by: before task breakdown (`/tasks`) for this feature.
- OQ-06: The exact mechanism for computing the cost/disk estimate `MigratePlan` (REQ-06) must
  surface for `'expensive'` Postgres sites — ADR-041 §2 requires the confirmer to acknowledge an
  estimate but does not specify how it is computed. — Owner: Software Architect for SPEC-017 —
  Resolve by: before this spec's architecture sign-off.

---

## Constitution Compliance

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | N/A | `ADS-memory/governance/constitution.md` Article I is an unfilled template placeholder (literal `[PRINCIPLE NAME]` text, no ratified project-specific principle) — there is no concrete compliance target to check this spec against. |
| II — Test-First | N/A | Same template-placeholder state as Article I — no ratified principle text exists in the constitution file to evaluate compliance against. |
| III — Simplicity Gate | N/A | Same template-placeholder state — no ratified principle text exists to evaluate against; this spec's own scope discipline (see Scope, Out of scope) is documented independently of any constitution article. |
| IV — Anti-Abstraction Gate | N/A | Same template-placeholder state — no ratified principle text exists to evaluate against. |
| V — Integration-First Testing | N/A | Same template-placeholder state — no ratified principle text exists to evaluate against. |
| VI — Security-by-Default | N/A | Same template-placeholder state — no ratified principle text exists to evaluate against; this spec's own mandatory sensitive-column redaction (REQ-25, INV-07) and no-attestation-bypass rule (REQ-08) stand on ADR-041's decision, not on a constitution article. |
| VII — Spec Integrity | N/A | Same template-placeholder state — no ratified principle text exists to evaluate against; this spec still carries its own `spec_id`/`content_hash` discipline per the Speckit compatibility contract regardless. |
| VIII — Observability | N/A | Same template-placeholder state — no ratified principle text exists to evaluate against; this spec's error envelope (see `errors.spec.md`) still carries `correlationId` regardless. |

---

## Implementation Readiness Gate

- [x] spec_id assigned and unique (verified: `ADS-memory/specs/002-*` and `ADS-memory/reports/pipeline/002-*` were confirmed absent before this run; SPEC-017 is newly assigned here)
- [x] version set to correct semver
- [x] status set to APPROVED (not DRAFT or REVIEW)
- [x] content_hash computed using the Speckit canonical hash rule and verified by the provider-local validator (see spec-manifest.md Validation Notes)
- [x] feature_name matches the FEAT folder name exactly
- [x] Zero `[NEEDS CLARIFICATION]` markers remain in this file
- [x] All Open Questions have an owner and a resolution target date
- [x] All REQ-* items are testable and contain no vague qualifiers
- [x] All REQ-* items have at least one AC
- [x] All AC items have a [P1], [P2], or [P3] priority tag
- [x] All AC items follow Given/When/Then format
- [x] All Invariants are written as absolute, falsifiable statements
- [x] All Edge Cases have an explicit Expected Behavior
- [x] Dependencies table is complete — no blank failure mode or fallback cells
- [x] Constitution Compliance table complete — all 8 articles marked COMPLIES / EXCEPTION / N/A
- [x] Scope: in-scope list present and non-empty
- [x] Problem Statement: "Why now" field is filled (even if answer is "no deadline")
- [x] User Journey: trigger, steps, outcome, and alternate paths are present
- [x] Scope: out-of-scope list present and non-empty
- [x] Full spec-system package present: all `PRESENT` files listed in spec-manifest.md exist
- [x] behavior.spec.md complete (this feature has real precedence/ordering/default/limit rules — see Scope)
- [x] traceability.spec.md complete (marked "pending implementation" — no code has been written yet)
- [x] spec-manifest.md complete — all 10 logical files listed with `PRESENT` or `OMITTED` and concrete reasons
- [x] spec-dod.md filled and all items PASS or NA with concrete justification
- [x] spec-dod.md Spec Agent sign-off row completed; Coordinator row is reserved for Coordinator Planning Preflight before `/plan`
- [x] `spec_mode` is `brownfield` — brownfield evidence paths are recorded in `spec-manifest.md`
- [x] `## Integration Contracts` section present, citing SPEC-016's exact REQ/AC ids

**Gate result:** PASS

---

## Agent Directives

Always:
- Every requirement referencing `authorize()`, the confirmation-token lifecycle, the watermark
  counter, or the composite actor-identity shape calls SPEC-016's exact contract (REQ-08 – REQ-18)
  — do not introduce a second implementation of any of these mechanisms.
- Use `siteId` as the `scopeId` value bound into every migrate-forward confirmation token
  (REQ-07), matching ADR-041 §7's stated v1 assumption.
- Cite `ADS-project-knowledge/specs/003-site-install-dir/` by its full path whenever discussing
  the `SERVE_SITE`/`PENDING_MIGRATION` amendment (REQ-28 – REQ-30). The bare label "SPEC-003" now
  unambiguously refers to that pre-existing package — the new dependent Collections spec was
  renumbered to SPEC-020 to resolve the collision.

Ask before:
- Shipping the Tier-3 read-only browser (REQ-25/REQ-26) in the same release as the Timeline and
  migrate-forward ceremony — OQ-05 leaves this sequencing open.
- Changing the `SITE_SCOPE_EXEMPT_TABLES` membership (REQ-17) — this is a deliberate, disclosed
  extension of ADR-007 Decision 2, not a free implementation choice.

Never:
- Expose a `confirm()`-equivalent tool for `storage.migrate-forward` in the agent-tool catalog —
  confirm is human-only with no exception (SPEC-016 REQ-22, this spec's REQ-21).
- Give the migrate-forward ceremony a direct single-call entry point that skips
  `plan()`/`confirm()` — this collapses the safety model SPEC-016's gateway exists to provide.
- Let `describeTables()`/`readRows()` (REQ-25) return a `sensitive: true` column's value under
  any permission tier, including site-admin.
- Implement an "I attest backups exist" bypass for a `costClass: 'unavailable'` migration
  (REQ-08) — ADR-041 §2 explicitly rejects this as unenforceable.
