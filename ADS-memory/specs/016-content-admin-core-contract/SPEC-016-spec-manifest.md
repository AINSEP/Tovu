# Spec Manifest: content-admin-core-contract

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/spec-manifest.md -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-016 |
| feature_name | FEAT-016-content-admin-core-contract |
| version | 1.4.0 |
| last_edited | 2026-07-15T05:00:00Z |
| spec_naming | prefixed |
| spec_root | ADS-memory/specs/016-content-admin-core-contract/ |
| spec_entrypoint | SPEC-016-feature.spec.md |
| spec_readiness_artifact | SPEC-016-spec-dod.md |

**Purpose:** This manifest is the package index for the strict Speckit compatibility flow. SPEC-016
is the shared core contract that SPEC-017 (Storage/Timeline), SPEC-020 (Collections), SPEC-018
(Categories & Tags), and SPEC-019 (Backups/Recovery) will each cite by REQ/AC/INV id from their own
`## Integration Contracts` sections once they are dispatched.

---

## Package Applicability Matrix

| Logical File | Status (`PRESENT|OMITTED`) | Actual Filename | Why Present / Why Omitted |
|---|---|---|---|
| `feature.spec.md` | PRESENT | `SPEC-016-feature.spec.md` | Canonical primary requirements spec for the shared core contract |
| `api.spec.md` | PRESENT | `SPEC-016-api.spec.md` | This contract exposes a real callable surface (the gated-mutation gateway's HTTP routes and agent-tool catalog) that dependent domain specs instantiate |
| `state.spec.md` | PRESENT | `SPEC-016-state.spec.md` | This contract owns durable state directly: the watermark counter/mirror and the confirmation-token lifecycle |
| `orchestrator.spec.md` | PRESENT | `SPEC-016-orchestrator.spec.md` | The `plan → confirm → execute` sequencing is itself an orchestration contract dependent domains implement against |
| `ui.spec.md` | OMITTED | `—` | This core contract has no independent user-facing screen; every UI surface (Storage Timeline, Recovery screen, Collections/Taxonomy admin screens) is owned by its own dependent domain spec's `ui.spec.md` |
| `errors.spec.md` | PRESENT | `SPEC-016-errors.spec.md` | The gateway/watermark contract defines its own error codes (`PLAN_STALE`, `TOKEN_EXPIRED`, `TOKEN_ALREADY_REDEEMED`, `WATERMARK_BASELINE_UNAVAILABLE`, etc.) that dependent specs must reuse rather than redefine |
| `behavior.spec.md` | PRESENT | `SPEC-016-behavior.spec.md` | Real precedence (authorize-before-idempotency), ordering (the non-negotiable plan/confirm/execute sequence), default (token TTL), and limit (redemption count) rules exist and are load-bearing |
| `traceability.spec.md` | PRESENT | `SPEC-016-traceability.spec.md` | Seeds REQ/AC/INV/EC coverage mapping before TDD |
| `spec-manifest.md` | PRESENT | `SPEC-016-spec-manifest.md` | Required package index for downstream stages |
| `spec-dod.md` | PRESENT | `SPEC-016-spec-dod.md` | Readiness gate and quality proof |

---

## Stage Read Set

| Stage | Must Read |
|---|---|
| `architect` | `SPEC-016-feature.spec.md`, `SPEC-016-api.spec.md`, `SPEC-016-state.spec.md`, `SPEC-016-orchestrator.spec.md`, `SPEC-016-errors.spec.md`, `SPEC-016-behavior.spec.md`, `SPEC-016-traceability.spec.md`, `SPEC-016-spec-dod.md` |
| `tdd` | `SPEC-016-feature.spec.md`, `SPEC-016-traceability.spec.md`, `SPEC-016-spec-dod.md`, plus the dependent domain spec (SPEC-017/018/019/020) and its own ADR that instantiates this contract |
| `programmer` | `SPEC-016-feature.spec.md`, `SPEC-016-traceability.spec.md`, all `PRESENT` contract files listed above, plus the dependent domain spec's own contract files and certified tests |

Note: SPEC-016 is not expected to be independently dispatched to Software Architect on its own —
it is realized through whichever of SPEC-017/018/019/020 is dispatched first and every subsequent
one cites it. This Stage Read Set documents what each stage must read of *this* package; the
dependent domain spec's own `spec-manifest.md` is authoritative for what else that stage must read.

---

## Brownfield / Reverse-Spec References

This feature is `brownfield` — it extends a running application (per the Coordinator's directive)
even though no prior code implements this exact contract yet; the four ADRs it derives from were
each written directly against the live `src/infra/db/schema.ts` and its surrounding write paths.

| Evidence / Touchpoint | Type | Why It Matters |
|---|---|---|
| `ADS-memory/reports/architecture/ADR-041-storage-timeline.md` | source touchpoint | Origin of the watermark contract, the `plan→confirm→execute` gateway, the composite actor-identity/soft-reference pattern, and the `db-ops` port shape |
| `ADS-memory/reports/architecture/ADR-043-collections.md` §4 | source touchpoint | Independently commits Collections to the same-transaction watermark-stamping obligation this contract defines (REQ-02) |
| `ADS-memory/reports/architecture/ADR-044-categories-and-tags.md` §4, Wiring section | source touchpoint | Independently commits Taxonomy to the same watermark-stamping obligation and reuses ADR-041's soft cross-boundary reference pattern for `entry_terms` |
| `ADS-memory/reports/architecture/ADR-045-backups-recovery-screen.md` §2/§3 | source touchpoint | Consumes this contract's disclosure-computation rule and `db-ops` restore-point shape for the Recovery screen's Step 2 |
| `ADS-memory/reports/architecture/ADR-021-identity-and-authorization.md` §§2, 4, 6, 9 | source touchpoint | Origin of `authorize()`, the composite `(workspace_id, id)` FK convention, agent delegation semantics, and permission-string house style this contract cites by reference, not restatement |
| `ADS-memory/reports/architecture/ADR-022-content-model-entries-registry-expression-indexes.md` | source touchpoint | Origin of the append-only-revision/write-chokepoint discipline each dependent domain's own write-service follows; cited by reference only, per this project's Brownfield Rule 3 |
| No `ANALYSIS-*` / `MIGRATION-*` / `TESTABILITY-*` reports exist in `ADS-memory/reports/codebase-analysis/` | codebase-analysis | Directory was confirmed absent before this run; no CodeBase Analyzer output exists yet for the storage/gateway/auth surface — this spec proceeds directly from the Accepted ADRs' own direct-codebase verification instead |

---

## Validation Notes

- Validator last run: 2026-07-15T05:05:00Z (v1.4.0 revision)
- Validator result: PASS (`--phase spec --update-hash`, then re-verified clean with `--phase spec` and no `--update-hash`)
- Validator manual waiver: N/A — `python3` was available and used directly
- Canonical hash verified at: 2026-07-15T05:05:00Z — `sha256:3b8d2e89900641c4f239caf574fe9757f9f57f4111e2f5b2f6a7b63fe53211fe`
- Revision notes (v1.4.0, 2026-07-15T05:00:00Z): Spec Agent revised this package to resolve
  Red-Team round-4 finding RT4-001 (BLOCKING) against spec hash
  `sha256:901082ad5bc9bc60c7a298b40b2649bbf55ce579e79cc8b05a316e4e8583a466` (v1.3.0) — see
  `ADS-memory/reports/pipeline/016-content-admin-core-contract/pipeline-state.md` for the full
  revision note and
  `ADS-memory/reports/pipeline/017-storage-timeline/red-team-findings-round4.md` (search "RT4-001")
  for the original finding, dispatched as a cross-package review:
  - RT4-001 (BLOCKING): v1.3.0's own RT-019 fix closed the SQLite-only watermark-scoping gap by
    delegation — REQ-01, EC-01, and the Dependencies table stated the Postgres-backed watermark
    storage type/atomicity mechanism/concurrency argument "is owned and defined entirely by
    SPEC-017." But SPEC-017's own Out-of-Scope section explicitly disclaims that exact obligation
    ("the `storage_write_watermark` counter's own definition... all owned by SPEC-016... never
    restated"), and no package in the five-spec pipeline (SPEC-016 through SPEC-019) actually
    defines the Postgres-side mechanism anywhere — a live, textual contradiction, not a silent gap,
    and the same "SQLite-only description, no stated Postgres equivalent" defect shape that has now
    recurred across rounds 1, 2, 3, and 4 (RT-003, RT-004/RT-012/RT-014, RT-019, RT4-001). Resolved
    per the project owner's chosen option — RT-019's originally-noted option (b): SPEC-016
    withdraws the delegation and self-defines the Postgres-backed mechanism directly, matching how
    REQ-19–REQ-21 already state both engines' rules inside this contract with no cross-spec
    dependency. This ends the delegate-and-contradict pattern rather than moving the same open
    question to a different file.
    - REQ-01 now states the Postgres-backed mechanism directly: `storage_write_watermark` is stored
      as a `BIGINT` column (Drizzle's shared-schema Postgres mapping, per ADR-015, for the same
      64-bit signed range SQLite's `INTEGER` affinity provides), incremented within the same ACID
      transaction as the write it stamps; concurrent writers are serialized by Postgres's normal
      MVCC/row-locking semantics on the counter row, not the SQLite single-writer WAL model.
    - EC-01's Postgres-backed expected-behavior branch now states the same MVCC/row-locking
      serialization argument directly instead of pointing to SPEC-017.
    - The Dependencies table's "owned/defined by SPEC-017" row was replaced with a
      "Postgres MVCC/row-locking transaction runtime" row, parallel in shape to the existing SQLite
      row, with its own Failure Mode/Fallback columns.
    - `state.spec.md`'s `watermark.value` State Shape row (touched by v1.3.0's comprehensive sweep)
      received the same self-defining fix — the Postgres-backed cell now states the `BIGINT` column
      type directly instead of assigning it to SPEC-017.
    - `traceability.spec.md`'s REQ-01 and EC-01 rows were reworded to say both engines are
      self-defined here, not delegated. Two new ACs were added for testability: AC-39 (REQ-01,
      Postgres-backed atomic stamping) and AC-40 (REQ-01, Postgres-backed concurrent-writer
      serialization) — both traced in `traceability.spec.md`.
    - No SPEC-017 file was touched — SPEC-017's Out-of-Scope disclaimer is accurate again now that
      SPEC-016 self-defines the mechanism it disclaims owning.
  - Version bumped `1.3.0` → `1.4.0`; `content_hash` recomputed via the provider-local validator and
    propagated to every sibling file that mirrors it in its own header (`api.spec.md`,
    `state.spec.md`, `orchestrator.spec.md`, `errors.spec.md`, `behavior.spec.md`,
    `traceability.spec.md`).
  - `red_team_status` reset below to `revised_pending_re_review` — Red-Team must re-run (round 5)
    against the new hash before Software Architect dispatch. This revision does not itself
    constitute Red-Team clearance.
- Revision notes (v1.3.0, 2026-07-15T02:15:00Z): Spec Agent revised this package to resolve
  Red-Team round-3 findings RT-019 (BLOCKING), RT-020 (ADVISORY), and RT-021 (ADVISORY) against spec
  hash `sha256:a43a9b33d3b37ed1003ba8294cb01b96b8ec470642986d3fa10a407990050981` (v1.2.0) — see
  `ADS-memory/reports/pipeline/016-content-admin-core-contract/pipeline-state.md` for the full
  revision note and
  `ADS-memory/reports/pipeline/016-content-admin-core-contract/red-team-findings-round3.md` for the
  original findings:
  - RT-019 (BLOCKING): REQ-01, EC-01, and the Dependencies-table `SQLite / better-sqlite3 WAL
    transaction runtime` row described `storage_write_watermark`'s stored type and atomicity
    guarantee exclusively in SQLite-specific terms, with no stated equivalent for a Postgres-backed
    `content.db` even though REQ-19/REQ-21 establish Postgres-backed sites as squarely in scope.
    Fixed by option (a) from the finding, mirroring how RT-014's fix handled the
    polymorphic-content-reference flavor: REQ-01 and EC-01 now explicitly scope their SQLite-specific
    language to SQLite-backed sites only and state that the equivalent watermark storage type,
    same-transaction atomicity mechanism, and concurrency-safety argument for a Postgres-backed
    `content.db` (post-migrate-forward) is owned and defined entirely by SPEC-017. The Dependencies
    table's SQLite row is now explicitly scoped to "SQLite-backed sites only," and a new sibling row
    was added naming SPEC-017 as the owner of the Postgres-backed equivalent.
  - Coordinator-mandated comprehensive SQLite-only sweep: because this exact defect shape was
    BLOCKING three rounds running (round 1's RT-003, round 2's RT-012, round 3's RT-019), Spec Agent
    grepped all 9 package files for SQLite-specific terms (`SQLite`, `WAL`, `better-sqlite3`, type
    affinity, single-writer semantics) with no stated scope. One additional instance was found beyond
    RT-019's own three locations: `state.spec.md` §1's State Shape table described `watermark.value`'s
    type as `integer (64-bit signed, matches SQLite INTEGER affinity)` with no Postgres-backed
    equivalent stated. Fixed with the same pattern — the type description is now explicitly scoped to
    SQLite-backed sites, with the Postgres-backed column type and atomicity mechanism assigned to
    SPEC-017. All other SQLite/Postgres mentions in the package (REQ-19–REQ-21 and their ACs, the
    Dependencies table's `pg_dump`/blue-green row, `traceability.spec.md`'s REQ-20/REQ-21 rows) were
    already correctly engine-branched with a stated equivalent for both engines — no further changes
    were needed there.
  - RT-020 (ADVISORY): REQ-14's RT-016-era text ("any mutating call site — gated or ordinary — in
    this contract or in any dependent domain") reached beyond this spec's own stated gated-mutation-
    gateway scope and risked duplicating an `authorize()`-ordering rule ADR-021 already owns. Rather
    than narrowing the rule's breadth (which would reopen RT-016's original testability gap — this
    contract's own gateway endpoints have no idempotency-key field to test the rule against), Spec
    Agent kept the cross-cutting breadth and added one clarifying sentence to REQ-14 and to
    `api.spec.md`'s Purpose note stating this is a restatement of an ADR-021-owned `authorize()`-
    ordering property surfaced here for convenience, not a rule this spec originates or owns
    independently of ADR-021.
  - RT-021 (ADVISORY): REQ-03's "refreshed after every `content.db` commit that changes it" read as a
    synchronous, commit-triggered guarantee, while AC-04 and `state.spec.md`'s `RECONCILE_MIRROR`
    action only ever commit to "the next reconciliation opportunity" (boot, or a periodic tick,
    interval unstated) — an untestable, inconsistent-guarantee gap. Chose the lower-risk fix per the
    finding's own suggested resolution: softened REQ-03's language to explicitly match
    `RECONCILE_MIRROR`'s actual boot-and-periodic-tick-only triggers and state the guarantee is
    bounded-eventual, not synchronous, rather than inventing an unbenchmarked exact tick interval.
    AC-04 was already worded consistently with this weaker guarantee and needed no content change;
    its `traceability.spec.md` description row was reworded to match REQ-03's new phrasing.
  - Version bumped `1.2.0` → `1.3.0`; `content_hash` recomputed via the provider-local validator and
    propagated to every sibling file that mirrors it in its own header (`api.spec.md`,
    `state.spec.md`, `orchestrator.spec.md`, `errors.spec.md`, `behavior.spec.md`,
    `traceability.spec.md`).
  - `red_team_status` reset below to `revised_pending_re_review` — Red-Team must re-run (round 4)
    against the new hash before Software Architect dispatch. This revision does not itself
    constitute Red-Team clearance.
- Notes (v1.0.0 draft, superseded): This is the first draft of SPEC-016. No prior version exists. Zero
  `[NEEDS CLARIFICATION]` markers were required — every mechanism in scope was already fully
  decided by the four Accepted ADRs (see feature.spec.md's Open Questions for the non-blocking
  items that remain). One validator repair round was needed: this package's own route-
  parameterization notation originally used angle brackets around words like "domain" and
  "action," one of which collided with a banned template-placeholder marker (an artifact of the
  unfilled-template AC-format example). All such tokens were converted to curly-brace notation
  throughout every file in this package, which does not collide with any banned marker.
- Revision notes (v1.1.0, 2026-07-14T22:00:00Z): Spec Agent revised this package to resolve
  Red-Team findings RT-001 through RT-010 (4 BLOCKING, 6 ADVISORY) and confirmed RT-011
  (CONSTITUTION_FLAG) required no further content change — see
  `ADS-memory/reports/pipeline/016-content-admin-core-contract/pipeline-state.md` for the full
  revision note and `ADS-memory/reports/pipeline/016-content-admin-core-contract/red-team-findings.md`
  for the original findings. Hash was recomputed against `feature.spec.md` and propagated to every
  sibling file that mirrors `content_hash` in its own header. Validator repair rounds needed for
  this revision: none — the package passed `--phase spec --update-hash` cleanly on the first run
  after the content edits.
- Revision notes (v1.2.0, 2026-07-14T23:45:00Z): Spec Agent revised this package to resolve
  Red-Team round-2 findings RT-012 through RT-018 (2 BLOCKING, 5 ADVISORY) against spec hash
  `sha256:02382c267da4f022f822d4e571e6c8f32e6fc818771b7bc9e49a6e6683f2ee6d` (v1.1.0) — see
  `ADS-memory/reports/pipeline/016-content-admin-core-contract/pipeline-state.md` for the full
  revision note and
  `ADS-memory/reports/pipeline/016-content-admin-core-contract/red-team-findings-round2.md` for the
  original findings:
  - RT-012 (BLOCKING): Gave `restorePoint.kind: 'external'` a concrete trigger condition in REQ-19
    (an externally-managed PITR/backup mechanism the `db-ops` adapter cannot itself execute, per
    ADR-041 §2's PITR marker), paired with `costClass: 'unavailable'`, plus new AC-37. Chosen over
    deleting the enum value because ADR-041 §2 already establishes a real, in-scope trigger for it.
  - RT-013 (BLOCKING): Added a closed `FORBIDDEN.details.reasonCode` enum
    (`AUTHORIZE_DENIED`/`ACTOR_CLASS_MISMATCH`) in `errors.spec.md` §3/§4 as the deterministic
    discriminator between `FORBIDDEN`'s two producers; `details.reason` remains free-text/
    illustrative only. AC-18/AC-19 now assert on `details.reasonCode` exactly instead of the word
    "identifying."
  - RT-014 (ADVISORY): Added an explicit statement to REQ-18 and `state.spec.md`'s Purpose that the
    polymorphic-content-reference flavor of the soft cross-boundary reference rule is owned and
    instantiated entirely by the dependent domain spec that defines the concrete table (e.g.
    `entry_terms`), while this core contract directly instantiates only the composite
    actor-identity flavor it itself owns — no generic placeholder entity was added.
  - RT-015 (ADVISORY): REQ-19 now states "working" is a static configuration-presence check (binary
    path/credentials/target parameters present and structurally valid) performed at
    `getCapabilities()` call time, never a live health probe, and that configured-but-broken
    tooling also reports `'unavailable'` (new AC-36), not a silently-wrong `'expensive'`.
  - RT-016 (ADVISORY): REQ-14 and `api.spec.md`'s Purpose now state explicitly that the
    idempotency-vs-authorize precedence rule is a generic cross-cutting rule for any mutating call
    site; this file's own three gateway endpoints do not themselves accept an idempotency-key field
    (`GATEWAY_EXECUTE`'s single-use token already provides equivalent replay protection).
  - RT-017 (ADVISORY): Reordered `execute()`'s check sequence so the actor-class redemption rule
    (REQ-13) runs before plan re-derivation/hash comparison, not after — matching REQ-11/REQ-14's
    non-disclosure principle. Updated `behavior.spec.md` §2.2, `orchestrator.spec.md`'s Lifecycle
    Hooks (new `onActorClassCheck` hook), `state.spec.md`'s `REDEEM_TOKEN` precondition order, and
    added EC-10/AC-38 to cover the tie case.
  - RT-018 (ADVISORY): Corrected the two-hour timestamp discrepancy in `spec-dod.md`'s B-06 Notes
    and Sign-Off Block (`20:00:00Z` → `22:00:00Z` at the time; both now read the current
    `last_edited` value for this revision).
  - Version bumped `1.1.0` → `1.2.0`; `content_hash` recomputed via the provider-local validator and
    propagated to every sibling file that mirrors it in its own header (`api.spec.md`,
    `state.spec.md`, `orchestrator.spec.md`, `errors.spec.md`, `behavior.spec.md`,
    `traceability.spec.md`).
  - `red_team_status` reset below to `revised_pending_re_review` — Red-Team must re-run (round 3)
    against the new hash before Software Architect dispatch. This revision does not itself
    constitute Red-Team clearance.
