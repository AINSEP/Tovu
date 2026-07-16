# Behavior Rules Spec: storage-timeline

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/behavior.spec.md -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-017 |
| feature_name | FEAT-017-storage-timeline |
| version | 1.3.0 |
| content_hash | sha256:bce97937e6e34ec517b57385c80b34cd9a0c7ab33360cf97e081437b438ff6a8 |
| last_edited | 2026-07-15T00:45:00Z |

**Purpose:** Captures the deterministic, rule-based behavior of the migrate-forward ceremony and
the boot-time cost-gated policy that is not fully expressed by the acceptance criteria alone — the
drift-classification precedence, the dialect-conditional state-machine ordering, the boot
auto-migrate vs. `PENDING_MIGRATION` decision, and the residual quiesce-integrity disclosure.

---

## EARS Syntax Guide

All behavior rules below use EARS (Easy Approach to Requirements Syntax) format.

---

## 1. Precedence Rules

### 1.1 Drift classification: tag identity vs. version index

**Situation:** The drift check must classify a site's schema state relative to the runtime.

**Sources in precedence order (highest to lowest):**
1. `schemaTag` identity comparison — always decisive; a tag mismatch at an equal index means
   `'diverged'`, never `'in-sync'`.
2. `schemaVersion` index comparison — used only to determine `'ahead'` vs. `'behind'` once tag
   identity has already confirmed the lineages are compatible.

**Example:**
- Scenario: two runtime builds both bundle 12 migrations (`schemaVersion = 12`) but the twelfth
  migration differs between builds (different `schemaTag`).
- Input: site's stamped `schemaTag` = `"a1b2"`, runtime's bundled `schemaTag` = `"c3d4"`, both at
  index 12.
- Result: the site is classified `'diverged'`, and the drift banner appears (REQ-02, REQ-03) —
  the equal index alone would have wrongly suggested `'in-sync'`.

**Test requirement:** The TDD Agent must write a test proving two runtimes with an equal
`schemaVersion` index but different `schemaTag` values are classified `'diverged'`, not
`'in-sync'`.

### 1.2 Boot policy: cost-gated auto-migrate vs. `PENDING_MIGRATION`

**Situation:** At boot, the site is found behind the runtime.

**Sources in precedence order (highest to lowest):**
1. `db-ops.getCapabilities().restorePoint.costClass` at boot time — the sole input to the branch
   decision.
2. Nothing else (no operator preference, no prior boot's decision) overrides this per-boot,
   per-current-`costClass` evaluation.

**Example:**
- Scenario: a Postgres site was in `PENDING_MIGRATION` on its last boot because `costClass` was
  `'unavailable'`; the operator has since configured `pg_dump`/blue-green tooling.
- Input: this boot's `costClass` = `'cheap'`... **not applicable to Postgres in this scenario: this
  spec does not commit to whether a configured Postgres site can ever report `'cheap'` — that
  classification is entirely a `db-ops` adapter decision, per OQ-03. SPEC-016 AC-29 commits only to
  the `'unavailable'`-with-no-tooling case, and SPEC-016 AC-33 commits only to the
  `'expensive'`-with-configured-tooling case; neither commits Postgres to `'cheap'`, nor rules it
  out.** For the SQLite case: input `costClass` = `'cheap'` (always true for SQLite whole-file
  snapshot, SPEC-016 AC-28).
- Result: this boot's evaluation runs fresh — a prior boot's `PENDING_MIGRATION` state does not
  persist as an override once `costClass` allows auto-migration (EC-07).

**Test requirement:** The TDD Agent must write a test proving that a site's boot-migration
decision is re-evaluated from the current boot's `costClass`, never cached from a prior boot.

---

## 2. Ordering Rules

### 2.1 Migrate-forward state machine step ordering (SQLite)

**Sequence:** `IDLE→PLANNED→CONFIRMED→QUIESCING→SNAPSHOTTING→APPLYING→VERIFYING→JOURNALING→DONE`
on success. `QUIESCING` MUST complete (and record `revisionSeqAtQuiesce`) before `SNAPSHOTTING`
begins. `SNAPSHOTTING` MUST complete before `APPLYING` begins.

**Stability:** Absolute — no step may be skipped or reordered on the success path.

**When overridden:** Never on the success path. Failure paths (§2.3) are the only sanctioned
deviation, and they are themselves fully specified, not ad hoc.

**Invariant:** A `DONE` terminal state observed without a preceding `JOURNALING` state for that
same `migrationRunId` is a system integrity violation.

### 2.2 Migrate-forward state machine step ordering (Postgres)

**Sequence:**
`IDLE→PLANNED→CONFIRMED→QUIESCING→SNAPSHOTTING→APPLYING→VERIFYING→CUTOVER→JOURNALING→DONE` on
success. `APPLYING` builds the target schema on a green target while blue continues serving —
blue is never touched until `CUTOVER`.

**Stability:** Absolute on the success path, matching §2.1.

**When overridden:** Never. `CUTOVER` is the only phase where blue is affected at all, and it is a
single atomic repoint, not a gradual cutover.

**Invariant:** Blue must remain the serving schema for every state up to and including
`VERIFYING` — a request served from green before `CUTOVER` completes is a system integrity
violation.

### 2.3 Failure-edge ordering

**Order:** A failure in `SNAPSHOTTING` transitions to `ABORTED_SAFE` directly (REQ-13) — no
restore is attempted because nothing was applied yet. A failure in `APPLYING` or `VERIFYING`
transitions to `RESTORING` (REQ-14), which then routes to the Recovery surface, never executing
the restore within this domain's own orchestrator. A failure in Postgres's `CUTOVER` (only
reachable after `VERIFYING` has already succeeded) transitions to `CUTOVER_FAILED→
ROLLBACK_TO_BLUE` — a distinct edge from the `APPLYING`/`VERIFYING` edge, because a validated
green schema already exists and is retained for forensics rather than discarded via a snapshot
restore.

**Tie-break:** Not applicable — these are mutually exclusive failure points in a linear sequence,
not competing candidates.

**Invariant:** `ROLLBACK_TO_BLUE` is reachable only from `CUTOVER_FAILED`, never from an
`APPLYING`/`VERIFYING` failure — the two failure shapes must never share a terminal state.

### 2.4 Boot-sequence ordering: crash reconciliation vs. cost-gated auto-migrate policy

**Situation:** At boot, two independent decisions exist before the site accepts public traffic:
`reconcileInterruptedMigrationOnBoot` (REQ-15, converts a non-terminal `migration_runs` row into a
`migration.interrupted` ledger row and blocks normal site-open until Recovery resolves it) and
`evaluateBootMigrationPolicy` (REQ-28/REQ-29, the cost-gated auto-migrate vs. `PENDING_MIGRATION`
decision).

**Order:** `RECONCILE_INTERRUPTED_MIGRATION` MUST run and resolve or block before
`evaluateBootMigrationPolicy` is ever invoked. A site with a non-terminal `migration_runs` row
found at boot MUST NOT reach the cost-gated auto-migrate/`PENDING_MIGRATION` decision — normal
site-open stays blocked (admin reachable, public serving refused) until Recovery resolves the
interrupted migration; only once no non-terminal row remains does `evaluateBootMigrationPolicy`
run.

**Tie-break:** Not applicable — these are two sequential boot-time gate checks, not competing
candidates; `evaluateBootMigrationPolicy` is unreachable, not merely deprioritized, while a
non-terminal `migration_runs` row exists.

**Invariant:** `evaluateBootMigrationPolicy` (and therefore `AUTO_MIGRATE_ON_BOOT` or
`ENTER_PENDING_MIGRATION`) must never run while a non-terminal `migration_runs` row exists for the
site — running the cost-gated policy on top of an already-crashed, unresolved migration is a
system integrity violation, not an acceptable race.

**Test requirement:** The TDD Agent must write a test proving that when boot finds a non-terminal
`migration_runs` row, `evaluateBootMigrationPolicy` is never invoked until
`reconcileInterruptedMigrationOnBoot` has completed and the interrupted migration has been
resolved via Recovery — including a check that the two are not dispatched as independent parallel
boot-time tasks.

---

## 3. Default Values

| Field | Scope | Default Value | Why |
|-------|-------|---------------|-----|
| `migrationRun.quiesceIntegrity` | new `migration_runs` row | `null` (full integrity) | Most sites have no Tier-3 plugin enabled; `null` means "quiesce covered every writer," the common and safest-to-assume case, only overridden to `'chokepoint-only'` when a Tier-3 plugin is actually enabled (REQ-27). |
| `MigratePlan.details.costEstimate` | `plan()` response | `null` unless `costClass === 'expensive'` | A cost estimate is only meaningful, and only required to be acknowledged, for the `'expensive'` case (REQ-06); forcing a populated-but-meaningless estimate for `'cheap'`/`'unavailable'` sites would invite a confirmer to acknowledge a number that means nothing. |
| `site.servingStatus` | new site, or after a successful migrate/boot reconciliation | `SERVING` | The common case is a healthy, in-sync site; `PENDING_MIGRATION` is an explicit degraded state entered only by REQ-29, never a default anyone starts in. |
| Tier-3 browser feature flag | new site | `false` (disabled) | ADR-041 §1/§8 states the Tier-3 browser is "off by default" as a deliberate hardening choice beyond ADR-023 §8's own floor. |

---

## 4. Limits and Bounds

| Constraint | Value | Enforcement | Notes |
|------------|-------|-------------|-------|
| Tier-3 `readRows()` page size | `≤ 200` | API (`STORAGE_TIER3_READ_ROWS`) | REQ-26; matches ADR-041 §8's stated row cap. |
| Disk-headroom preflight before any snapshot | `1.5 × (current DB size + WAL size)` | `db-ops` snapshot step (dependency on ADR-023 §3) | This spec depends on, but does not redefine, ADR-023 §3's preflight — cited here only so the migrate-forward ceremony's own failure mode (a refused snapshot) is traceable to its source. |
| Confirmation token TTL for migrate-forward `confirm()` | exactly `600` seconds (10 minutes, no jitter) | SPEC-016's gateway, instantiated here | Not a domain-specific value — reused from SPEC-016 REQ-10/behavior.spec.md §3, not redefined. |
| Concurrent migrations per site | exactly `1` in flight at a time | `executeMigrateForward` orchestrator action | A second `execute()` attempt while one `migrationRunId` is non-terminal is rejected with `MIGRATION_ALREADY_IN_FLIGHT`, distinct from `TOKEN_ALREADY_REDEEMED` (which is about the token, not the run). |

---

## 5. Deduplication Rules

A concurrent second `execute()` call for the *same site* while a `migrationRunId` is non-terminal
is rejected as a duplicate in-flight operation (`MIGRATION_ALREADY_IN_FLIGHT`), regardless of
whether it carries the same or a different confirmation token. This is a site-level concurrency
guard, layered on top of — not a replacement for — SPEC-016 INV-03's per-token single-redemption
rule: two *different* tokens for the same site could otherwise both attempt to redeem
concurrently, which this dedup rule specifically closes.

---

## 6. Tie-Break Logic

N/A — this domain has no scenario where multiple ledger rows, restore points, or migration runs
compete for the same role at the same time. The state-machine ordering (§2) and the deduplication
rule (§5) already make "which one wins" a non-question: only one `migrationRunId` may be
non-terminal per site at a time.

---

## 7. Edge Case Handling

| Edge Case | Expected Behavior | Test Required? |
|-----------|-------------------|----------------|
| A migration is confirmed but the site drifts to `'diverged'` before `execute()` runs | `execute()`'s recomputed plan hash mismatches; rejects `PLAN_STALE` (SPEC-016 REQ-12); operator is routed to re-plan (EC-01) | Yes |
| A Tier-3 plugin writes directly to `content.db` during `QUIESCING` | `quiesceIntegrity` is recorded `'chokepoint-only'` on that run; the write is not blocked at the storage layer — a disclosed residual, not a defect (EC-02) | Yes |
| Postgres `CUTOVER` fails after a validated green schema | `CUTOVER_FAILED→ROLLBACK_TO_BLUE`; green is retained for forensics, not deleted (EC-03) | Yes |
| A restore-point capture is requested when `costClass === 'unavailable'` | Refused outright — no in-product attestation override exists (EC-04) | Yes |
| A Tier-3 `readRows()` `where`-clause references a `sensitive: true` column | The column is silently excluded from the returned row shape — no error, no partial leak (EC-05) | Yes |
| Boot occurs, `content.db` opens, but the sidecar journal's `migration_runs` table is missing/unreadable | Treated as "no non-terminal row found" for crash reconciliation; the SPEC-016 watermark-mirror reconciliation proceeds independently (EC-06) | Yes |
| `costClass` improves from `'unavailable'`/`'expensive'` to `'cheap'` between two boots | The very next boot re-evaluates fresh and may auto-migrate; no boot's decision is cached or treated as sticky (EC-07) | Yes |
| A Tier-3 plugin is later disabled after a migration ran while it was enabled | The historical `migration_runs` row keeps `quiesceIntegrity='chokepoint-only'` — never retroactively rewritten to `null` (EC-08) | Yes |
