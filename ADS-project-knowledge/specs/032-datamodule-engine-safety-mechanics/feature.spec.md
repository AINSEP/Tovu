# Feature Spec: dataModule Engine Safety Mechanics — T1-T8 (ADR-023)

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-032 |
| version | 1.0.0 |
| status | APPROVED |
| feature_name | FEAT-032-datamodule-engine-safety-mechanics |
| last_edited | 2026-07-16T00:00:00Z |
| owner | Leon Aburime |
| spec_agent | Spec Agent (in-session, direct — Claude Code host) |
| spec_mode | brownfield |

## Scope Note (disclosed — why this exists and why now)

`src/features/plugins/data-module.ts` implements the core-mediated plugin dataModule engine
ADR-023 describes. ADR-023 was ACCEPTED 2026-07-11 after a 3-round external audit whose findings
(T1-T8) were folded into the ADR as normative, required text. Investigation for this spec found
that **zero of those eight findings were ever reflected in code** — the file remained the
pre-acceptance spike (its own header still said "ADR-023 is PROPOSED, not accepted"), while
`src/newsletter/data-module-manifest.ts` had already made it load-bearing for 5 real production
tables, and the store plugin spike used the same unguarded path.

ADR-023 §12 says v1 should ship SEAMS only and reject every `dataModule` declaration until the
engine is built "against a concrete demand plugin." Newsletter's real production need is exactly
that concrete demand — this spec is the v-next engine build §12 itself anticipates, not a
reinterpretation of the ADR's decision.

## Problem Statement

**Current state (before this spec):** `declareDataModule()` validated input, snapshotted the db,
and ran DDL in one transaction — correct for the SAME-PROCESS, JS-catchable failure case (SQLite's
own transaction rollback already handles that), but with none of T1-T8's crash/concurrency/
resource/identity safety mechanics: no exclusive lock, no phase journal, no boot-time crash
recovery, no disk-headroom check, no tier gating, no namespace-identity guard, and no restore
function existed anywhere in the codebase at all.

**Desired state:** every T1-T8 finding is reflected in code, verified by a dedicated test file per
mechanic plus the existing end-to-end `data-module.test.ts`/Newsletter T010 gate updated to match,
plus a new real-seam integration test proving boot-time recovery runs through `openContentDb()`
exactly as `index.ts`'s real boot path invokes it.

## Requirements

- REQ-01 (T6): `DataModuleDecl` gains a required `pluginTier: "tier-1" | "tier-2" | "tier-3"`
  field; `validate()` rejects `tier-1` with `TIER1_NOT_ALLOWED`.
- REQ-02 (T4): a disk-headroom preflight (`disk-headroom.ts`) runs before any snapshot; fails
  closed with `INSUFFICIENT_DISK_HEADROOM` when free space is below `1.5 × (db size + WAL size)`.
  A measurement failure (platform lacking `fs.statfsSync`) is disclosed as a distinct,
  non-blocking case — logged, not failed closed (see `disk-headroom.ts`'s header for why).
- REQ-03 (T5): `DataModuleDecl` gains a required `provenance: { sourceUrl, publisher, signature? }`
  field. A namespace-adoption guard (`plugin-identity.ts`) mints a permanent identity record on
  first sight and applies the two-track rule on every subsequent declare: automatic on unchanged
  or verified-same-signature provenance, refused (`IDENTITY_ADOPTION_REQUIRES_CONSENT`) otherwise.
- REQ-04 (T2): an exclusive lock (`PRAGMA locking_mode=EXCLUSIVE`, forced to take effect
  immediately) is held from just before the phase journal opens through commit or rollback.
- REQ-05 (T3): a durable, checkpoint-forced phase-marker journal
  (`PREPARED_SNAPSHOT → DDL_IN_PROGRESS → VERIFYING → COMMITTED/ROLLED_BACK`) records every
  declare attempt (`migration-journal.ts`).
- REQ-06 (T3, boot recovery): `migration-recovery.ts` scans for non-terminal journal entries and
  restores each from its snapshot — mandatory, run before the app's long-lived connection opens.
  Wired into `openContentDb()` via a new optional, backward-compatible `recover` parameter
  (dependency inversion, not a direct `infra→features` import — see Implementation Record).
- REQ-07 (T8): `restore.ts`'s restore step clears the `-wal`/`-shm` sidecars left by the crashed
  attempt before returning.
- REQ-08 (T1/T2 scope honesty): `restore.ts` and `data-module.ts` both document, in code, why a
  live (mid-process) exclusive cross-process lock is not needed for the restore step specifically
  in this codebase's actual single-process/single-connection deployment topology, and what would
  need to change if that topology ever changes.
- REQ-09: `NEWSLETTER_DATA_MODULE` and `STORE_MANIFEST` (the two real production callers) and
  `COMMENTS_DATA_MODULE` (a design sketch, not yet a real caller) are updated with concrete
  `pluginTier`/`provenance` values; Newsletter's file header, which explicitly warned this engine
  was pre-acceptance spike-quality, is corrected.

## Acceptance Criteria

- AC-01 (REQ-01) [P1]: a `tier-1` declaration is rejected before any I/O.
- AC-02 (REQ-02) [P1]: `checkDiskHeadroom()`'s required-bytes formula is proven against real file
  sizes; the "insufficient" fail-closed shape is proven structurally (see `disk-headroom.test.ts`'s
  own disclosed limitation on fully simulating a real low-disk condition without mocking `fs`).
- AC-03 (REQ-03) [P1]: all 4 adoption-decision branches (first-mint, unchanged, verified-signature,
  consent-required) are covered, including the "signature on only one side" and
  "publisher-only-match" sub-cases of consent-required.
- AC-04 (REQ-05/REQ-06/REQ-07) [P1] — the crash-recovery core: a simulated crash (a journal entry
  left at `DDL_IN_PROGRESS`, live db diverged from its snapshot, WAL/SHM sidecars present) is fully
  reverted by `recoverIncompleteDataModuleMigrations()` — content table gone, pre-existing content
  intact, sidecars cleared — proven both standalone (`migration-recovery.test.ts`) and through the
  real `openContentDb()` seam (`content-db-recovery.integration.test.ts`).
- AC-05 [P1]: the full pre-existing test suite (`data-module.test.ts`,
  `data-module-manifest.failure-rollback.test.ts` / T010, `store-plugin.test.ts`) passes with the
  new required fields added to their fixtures and one assertion updated to account for the new
  always-created infra tables (`_plugin_migration_journal`, `_plugin_identity`,
  `sqlite_sequence` — the latter an unavoidable SQLite-internal side effect of the former's
  `AUTOINCREMENT` column, not something this engine could suppress).
- AC-06 [P1]: a live smoke test (`npx tsx src/index.ts`, real SQLite) installs Newsletter's 5 real
  tables through the hardened engine; a second clean boot against the same file is idempotent (one
  journal row, `COMMITTED`; identity table unchanged, no duplicate rows).

## Non-Goals

- Building Comments (ADR-031) itself — `COMMENTS_DATA_MODULE` is updated only so it continues to
  typecheck against the widened `DataModuleDecl`; Comments has no real caller of this engine yet.
- The store plugin's own connection-opening path (`bootstrapStore()` opens a SEPARATE raw
  connection to the same `content.db` file, not through `openContentDb()`) is NOT wired to the
  boot-time recovery hook — a pre-existing architectural quirk (two connections to one file) this
  spec does not fix. Acceptable because the store plugin is explicitly a non-production spike
  (`capability-inventory.ts`'s own entry: "never intended as a production capability").
- Real cryptographic signature verification — `plugin-identity.ts`'s "verified-signature" track is
  a same-string comparison, matching ADR-023 §6's own honest disclosure that no signing
  infrastructure exists anywhere in this codebase yet; track (b)'s explicit-consent path is
  correctly the load-bearing one today.
- A consent-prompt UI for track (b) — no such UI exists anywhere in this codebase; the guard
  surfaces a typed refusal (`IDENTITY_ADOPTION_REQUIRES_CONSENT`) a future caller can act on.
- Graceful `SIGTERM`-triggered lock release — not applicable; the exclusive lock's whole window is
  bounded by one synchronous `declareDataModule()` call, never held across an `await` that could be
  interrupted by a signal mid-hold in a way this codebase's process model needs to handle specially.

## Constitution Compliance

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | No new dependency; `fs.statfsSync` is Node built-in. |
| II — Test-First | COMPLIES | 5 new dedicated test files (journal, disk-headroom, identity, recovery, real-seam integration) plus 3 pre-existing files updated; 3 real bugs/gaps caught during this pass (the live-connection-file-swap hazard in an early `migration-recovery.ts` draft, the pointless post-restore journal-mark attempt, and the integration test's own concurrent-connection mistake) — all fixed before finalizing. |
| III — Simplicity Gate | COMPLIES | No generic topological dependency resolver for the 2-phase-before-transaction sequencing (array/call order already encodes it); T5's adoption guard is the minimum two-track shape the ADR specifies, not a speculative broader identity system. |
| IV — Anti-Abstraction Gate | COMPLIES | `ContentDbRecoveryHook` mirrors the EXISTING `seed` parameter's dependency-inversion shape on `openContentDb` (ADR-042 item 3's own established precedent) — not a new abstraction, the same one reused. |
| V — Integration-First Testing | COMPLIES | AC-04/AC-06 are real-file, real-seam tests, not mocks. |
| VI — Security-by-Default | COMPLIES | Fail-closed disk-headroom and namespace-adoption checks; §0's advisory-until-Rung-2 access-control caveat is unchanged and still accurately documented in this file's own header. |
| VII — Spec Integrity | COMPLIES | This spec is the reference for the implementation it accompanies. |
| VIII — Observability | COMPLIES | Structured error codes for every new fail-closed path (`TIER1_NOT_ALLOWED`, `INSUFFICIENT_DISK_HEADROOM`, `IDENTITY_ADOPTION_REQUIRES_CONSENT`); the journal itself is a durable, queryable audit trail. |

## Implementation Record

- `src/features/plugins/migration-journal.ts`, `disk-headroom.ts`, `plugin-identity.ts`,
  `restore.ts`, `migration-recovery.ts` (all new).
- `src/features/plugins/data-module.ts`: rewritten to orchestrate all of the above; `DataModuleDecl`
  widened with `pluginTier`/`provenance`.
- `src/infra/sqlite/content-db.ts`: `openContentDb()` gains an optional `recover` parameter
  (dependency inversion — this file does NOT import `features/plugins/*` directly, avoiding the
  exact `infra`-reaching-into-`features` layering violation ADR-042 item 3 already fixed once for
  a different case; the composition root wires the concrete function).
- `src/server/deps.ts`: passes `recoverIncompleteDataModuleMigrations` to `openContentDb()`.
- `src/newsletter/data-module-manifest.ts`, `src/features/plugins/store/store-plugin.ts`,
  `src/comments/types.ts`: updated with concrete `pluginTier`/`provenance`.
- Tests: `migration-journal.test.ts` (4), `disk-headroom.test.ts` (3), `plugin-identity.test.ts`
  (7), `migration-recovery.test.ts` (4), `content-db-recovery.integration.test.ts` (2) — all new.
  `data-module.test.ts`, `data-module-manifest.failure-rollback.test.ts`,
  `store-plugin.test.ts` — fixtures updated.
- Full suite: 1611/1611 (1607 passing, same 4 pre-existing, disclosed, unrelated failures carried
  since before this slice). Typecheck clean. Live smoke test (real SQLite, two clean boots)
  confirmed idempotent Newsletter installation with correct journal/identity state.

## Handoff Contract

- **Inputs used:** ADR-023's full text (all 8 findings' exact wording), direct inspection of
  `data-module.ts`/`snapshot.ts`'s pre-existing code, `content-db.ts`'s `seed` parameter as the
  dependency-inversion precedent to mirror, the real Newsletter/store call sites.
- **Output summary:** the dataModule engine now matches what ADR-023 was actually ACCEPTED on the
  strength of. Newsletter's 5 production tables and the store spike's 2 tables are protected by
  crash recovery, disk-headroom preflight, and a real (if honestly-scoped) identity guard.
- **Risks:** the store plugin's separate-connection quirk (Non-Goals) means IT specifically is not
  covered by boot-time recovery — disclosed, low-stakes (non-production spike, toy data).
- **Suggested next assignee:** Coordinator, for ADR-031 (Comments) — its own round-3 fold named
  this engine's absence as a blocking dependency; that blocker is now closed. Comments itself still
  needs everything beyond `ports.ts`/`types.ts` built (ingress/spam policy, both repo adapters,
  moderation write-service, routes, hooks, and the ADR-025-gated widget).
