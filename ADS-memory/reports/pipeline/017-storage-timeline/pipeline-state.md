# Pipeline State: 017-storage-timeline

## Provider

- spec_provider: `speckit`
- provider_version_ref: `2c2fea8783f33085652b8c87e839bae84a6eb78d` (per `framework/spec-providers/speckit/provider.md`)
- provider_native_root: `specs/`
- provider_output_root: `ADS-memory/specs/017-storage-timeline/`
- provider_mode: `ai_dev_shop_compatibility_flow` (not a literal upstream `.specify/` install)

## Spec Artifact

- spec_entrypoint_path: `ADS-memory/specs/017-storage-timeline/SPEC-017-feature.spec.md`
- spec_readiness_artifact: `ADS-memory/specs/017-storage-timeline/SPEC-017-spec-dod.md`
- spec_support_paths:
  - `ADS-memory/specs/017-storage-timeline/SPEC-017-api.spec.md`
  - `ADS-memory/specs/017-storage-timeline/SPEC-017-state.spec.md`
  - `ADS-memory/specs/017-storage-timeline/SPEC-017-orchestrator.spec.md`
  - `ADS-memory/specs/017-storage-timeline/SPEC-017-ui.spec.md`
  - `ADS-memory/specs/017-storage-timeline/SPEC-017-errors.spec.md`
  - `ADS-memory/specs/017-storage-timeline/SPEC-017-behavior.spec.md`
  - `ADS-memory/specs/017-storage-timeline/SPEC-017-traceability.spec.md`
  - `ADS-memory/specs/017-storage-timeline/SPEC-017-spec-manifest.md`
- spec_naming: `prefixed`
- spec_mode: `brownfield`
- depends_on: `SPEC-016` (`ADS-memory/specs/016-content-admin-core-contract/`) — now `version 1.1.0`,
  `content_hash: sha256:02382c267da4f022f822d4e571e6c8f32e6fc818771b7bc9e49a6e6683f2ee6d` (revised
  by a separate pass to fix SPEC-016's own Red-Team findings; superseded the original
  `sha256:0d527b31e34a595a0c3c8b0715e9134c97ac1bc7389af21f4212d3f395157142` this pipeline-state
  previously recorded). This SPEC-017 revision (v1.1.0) re-verified every citation in its own
  `## Integration Contracts` section against SPEC-016 v1.1.0's current REQ/AC text — see Revision
  Note below.
- spec_hash: `sha256:bce97937e6e34ec517b57385c80b34cd9a0c7ab33360cf97e081437b438ff6a8` (recomputed 2026-07-15T07:00:00Z after the SPEC-002->SPEC-017 renumbering pass -- content-identical in substance, label-only change; historically v1.3.0,
  Red-Team round 3 fix — superseding v1.2.0's
  `sha256:d36feb11b1f57477ef4227f331571e7222505f8a24742cdcf70eb8eded37c35d`, which superseded
  v1.1.0's `sha256:f9d60a5072a2eae2aa68b26bf9d5cdb66c42a3d23a3b0cd56cb5838376066355`, which itself
  superseded the original draft's
  `sha256:3613c3f2ee450216a0296cbd06f6b19b27ea3df3d269956ba052f17d80777974`)
- spec_hash_verified_at: 2026-07-15T05:35:00Z — Coordinator Planning Preflight, confirmed via a
  fresh `validate_spec_package.py --phase preflight` run (exit 0, PASS) against
  `sha256:2f09a7f1fa6e0de45592f3829bd491dd9d89a47e3a9d0a6a8ae295ed9b85066f`; supersedes Spec Agent's
  own prior verification note (2026-07-15T00:45:00Z) as the authoritative Coordinator-level record.

## Governance / Evidence Inputs Consulted

- `ADS-memory/governance/constitution.md` — unfilled template, no ratified articles; all 8 marked
  N/A in the Constitution Compliance table with concrete justification.
- `ADS-memory/knowledge/project_memory.md` — near-empty template, no entries invented.
- `ADS-memory/knowledge/learnings.md` — near-empty template, no entries invented.
- `ADS-memory/reports/codebase-analysis/` — confirmed absent (no `ANALYSIS-*`/`MIGRATION-*`/
  `TESTABILITY-*` reports exist for this surface); proceeding directly from ADR-041 and SPEC-016's
  own direct-codebase verification.
- No `system-blueprint.md` exists for this feature — System Design was not run; proceeded with the
  compact self-check functional/NFR pass per the Spec Agent persona's steps 5-6.
- Confirmed absent before this run: `ADS-memory/specs/002-*`, `ADS-memory/reports/pipeline/002-*`.
- Spot-checked `src/infra/db/schema.ts` directly: confirmed no `storage_ledger`/`migration_runs`/
  `restore_points` tables exist yet, and that ADR-041's named sensitive tables (`users`/`api_keys`/
  `sessions`) do not yet exist under those exact names (closest existing tables: `principals`,
  `identityUsers`, `sessions`) — the concrete schema mapping is deferred to Software Architect,
  cited here per this project's Brownfield Rule 3.

## Source ADRs

- `ADS-memory/reports/architecture/ADR-041-storage-timeline.md` (Accepted 2026-07-14) — primary source
- `ADS-memory/reports/architecture/ADR-023-core-mediated-plugin-data-modules.md` §3, §4, §8 (cited by reference)
- `ADS-memory/reports/architecture/ADR-024-plugin-execution-and-trust-model.md` §4 (cited by reference)
- `ADS-memory/reports/architecture/ADR-021-identity-and-authorization.md` §9 (cited by reference)
- `ADS-memory/reports/architecture/ADR-022-content-model-entries-registry-expression-indexes.md` §3, §4a (cited by reference)
- `ADS-memory/reports/architecture/ADR-015-...` (Drizzle/migrations, RT-005) (cited by reference)
- `ADS-memory/reports/architecture/ADR-012-...` (install-dir layout) (cited by reference)
- `ADS-memory/specs/003-site-install-dir/` (pre-existing v1 spec suite — the `SERVE_SITE`
  amendment target; NOT the new dependent Collections spec, which was renumbered to SPEC-020 — see
  feature.spec.md's Numbering Disambiguation section)

## Numbering Disambiguation (repeated here for pipeline-state visibility)

ADR-041 §10 amends a spec it calls "SPEC-003." That is the pre-existing
`ADS-memory/specs/003-site-install-dir/` package. The new dependent Collections spec,
which would otherwise have collided with that label, was renumbered to SPEC-020 under
`ADS-memory/specs/020-collections/` (Coordinator decision, 2026-07-14). This package cites the
older one only by full path throughout, never by the bare label "SPEC-003," since that label now
unambiguously belongs to it.

## Dependency

- SPEC-016 (`ADS-memory/specs/016-content-admin-core-contract/`) — status: APPROVED, **version
  1.1.0**, content_hash `sha256:02382c267da4f022f822d4e571e6c8f32e6fc818771b7bc9e49a6e6683f2ee6d`
  (revised by a separate pass to fix SPEC-016's own Red-Team findings; supersedes the
  `sha256:0d527b31e34a595a0c3c8b0715e9134c97ac1bc7389af21f4212d3f395157142` this file previously
  recorded). Notable SPEC-016 changes this SPEC-017 revision re-verified against: an exact
  600-second confirmation-token TTL (was "~10 minutes"), a clarified `FORBIDDEN` code covering
  actor-class-redemption rejections (REQ-13, unchanged in substance from what SPEC-017 already
  cited), a new AC-33 for `costClass: 'expensive'`, and a new `ActorIdentityRef` entity /
  `APPEND_ACTOR_REFERENCE` action in SPEC-016's own `state.spec.md` (REQ-16 area — SPEC-017's own
  inline actor-identity fields on `StorageLedgerRow`/`MigrationRun` already match this shape; no
  SPEC-017 change was needed there beyond the TTL text). This spec's `## Integration Contracts`
  section (in `SPEC-017-feature.spec.md`) cites SPEC-016 REQ-01 – REQ-07, REQ-08 – REQ-13, REQ-14,
  REQ-15, REQ-16 – REQ-18, REQ-19 – REQ-21, and REQ-22 — every row was re-checked against SPEC-016
  v1.1.0's current text; only the REQ-14/REQ-15 row (RT-003) and the REQ-22 row (RT-007) needed a
  citation fix, both fixed in this revision — see Revision Note below. This spec also resolves
  SPEC-016 OQ-04 for the `storage.migrate-forward` instantiation (see `SPEC-017-feature.spec.md`'s
  dedicated "Resolution of SPEC-016 OQ-04" section) — the Coordinator folded that resolution back
  into SPEC-016 itself as the contract's single global answer (2026-07-14), since no
  domain-specific reason to diverge was found.

## Reserved / Not Yet Dispatched (siblings)

- SPEC-020 (Collections, ADR-043), SPEC-018 (Categories & Tags, ADR-044), and SPEC-019 (Backups/
  Recovery, ADR-045) are being dispatched in parallel by other agents. This spec's REQ-14/REQ-23
  hand-off to Recovery assumes SPEC-019 will define `recovery_restore_to`; no SPEC-019 id is cited
  here since SPEC-019 does not yet exist — see this spec's own Dependencies table for the
  sequencing risk this creates.

## Validator

- validator_command: `python3 AI-Dev-Shop/framework/spec-providers/speckit/validators/validate_spec_package.py ADS-memory/specs/017-storage-timeline --phase spec --update-hash`
- validator_result (v1.0.0 draft): PASS (exit 0) on the first invocation — no repair round was
  required. Re-ran without `--update-hash` afterward (twice, after a small post-hash cosmetic fix
  to `api.spec.md`'s error-mapping table) to confirm a clean, idempotent pass (exit 0 both times).
- validator_result (v1.1.0 Red-Team-fix revision, 2026-07-14T23:15:00Z): PASS (exit 0) on the
  first invocation of `--phase spec --update-hash` — no repair round was required. Re-ran once more
  without `--update-hash` immediately after and confirmed a clean, idempotent pass (exit 0). New
  `content_hash`: `sha256:f9d60a5072a2eae2aa68b26bf9d5cdb66c42a3d23a3b0cd56cb5838376066355`,
  propagated to every sibling file's own header (`api.spec.md`, `state.spec.md`,
  `orchestrator.spec.md`, `ui.spec.md`, `errors.spec.md`, `behavior.spec.md`,
  `traceability.spec.md`).
- validator_result (v1.2.0 Red-Team-round-2-fix revision, 2026-07-14T23:58:00Z): PASS (exit 0) on
  the first invocation of
  `python3 AI-Dev-Shop/framework/spec-providers/speckit/validators/validate_spec_package.py ADS-memory/specs/017-storage-timeline --phase spec --update-hash`
  — no repair round was required. Re-ran once more without `--update-hash` immediately after and
  confirmed a clean, idempotent pass (exit 0, no diff). New `content_hash`:
  `sha256:d36feb11b1f57477ef4227f331571e7222505f8a24742cdcf70eb8eded37c35d`, propagated to every
  sibling file's own header (`api.spec.md`, `state.spec.md`, `orchestrator.spec.md`, `ui.spec.md`,
  `errors.spec.md`, `behavior.spec.md`, `traceability.spec.md`).
- validator_result (v1.3.0 Red-Team-round-3-fix revision, 2026-07-15T00:45:00Z): PASS (exit 0) on
  the first invocation of
  `python3 AI-Dev-Shop/framework/spec-providers/speckit/validators/validate_spec_package.py ADS-memory/specs/017-storage-timeline --phase spec --update-hash`
  — no repair round was required. Re-ran once more without `--update-hash` immediately after and
  confirmed a clean, idempotent pass (exit 0, no diff — `content_hash` matched the canonical
  recomputed value). New `content_hash`:
  `sha256:2f09a7f1fa6e0de45592f3829bd491dd9d89a47e3a9d0a6a8ae295ed9b85066f`, propagated to every
  sibling file's own header (`api.spec.md`, `state.spec.md`, `orchestrator.spec.md`, `ui.spec.md`,
  `errors.spec.md`, `behavior.spec.md`, `traceability.spec.md`).
- validator_manual_waiver: N/A (`python3` available)

## Revision Note (v1.1.0, Red-Team round 1 — 2026-07-14T23:00:00Z)

Revised in direct response to `red-team-findings.md` (3 BLOCKING, 4 ADVISORY, 2 CONSTITUTION_FLAG)
and to re-sync against SPEC-016 v1.1.0. Fixes, by finding id:

- **RT-001 (BLOCKING, fixed):** `SPEC-017-ui.spec.md` §2.2 (`DriftBanner` Input Contract) and §4
  (Rendering rule) amended so `DriftBanner` never renders for `behind` in either `costClass` case —
  that scenario is exclusively `PendingMigrationBanner`'s responsibility (non-cheap, REQ-29) or
  resolves via silent boot auto-migrate (cheap, REQ-28). `feature.spec.md` REQ-02 needed no change
  (it already named only `ahead`/`diverged`); AC-02 was tightened to state the `behind` case
  explicitly so it can't be misread as leaving a gap.
- **RT-002 (BLOCKING, fixed):** `feature.spec.md` REQ-12 amended to add the `RESTORE_FAILED`
  outcome to Postgres's `APPLYING`/`VERIFYING` failure edge (discarding the abandoned green schema
  can itself fail, e.g. a lock/permission error), matching `state.spec.md`,
  `orchestrator.spec.md`, and `api.spec.md`'s `finalState` enum, all of which already treated
  `RESTORE_FAILED` as dialect-agnostic. New AC-40 added to cover the Postgres case.
- **RT-003 (BLOCKING, fixed):** The Integration Contracts row citing SPEC-016 REQ-14/REQ-15 was
  pointing at AC-09/AC-10, neither of which exercises those mechanics (confirmed against SPEC-016's
  own traceability matrix: REQ-14 → AC-21, REQ-15 → AC-22 are SPEC-016's own generic tests, not a
  domain-specific one). Two new SPEC-017 ACs were added — AC-41 (authorize-before-idempotency:
  unauthorized caller + already-redeemed token → `FORBIDDEN`, not `TOKEN_ALREADY_REDEEMED`) and
  AC-42 (agent live-delegation-intersection: delegator's grant revoked between `confirm()` and
  `execute()` → `FORBIDDEN` reflecting current state) — and the row now cites them.
- **RT-004 (ADVISORY, not fixed — out of this dispatch's scope):** SPEC-016's own OQ-02 still uses
  the bare label "SPEC-003" with no disambiguation note of its own. This dispatch's guardrails
  forbid editing SPEC-016; flagging to Coordinator as the finding itself recommends — a one-line
  disambiguation note (or pointer to SPEC-017's Numbering Disambiguation section) should be added
  to SPEC-016's OQ-02 by whichever pass next touches SPEC-016.
- **RT-005 (ADVISORY, fixed):** `feature.spec.md` Dependencies table's
  `ADS-memory/specs/003-site-install-dir/` row now carries an explicit Owner (Software
  Architect for SPEC-017) and Resolve-by (before Programmer work begins on REQ-28–REQ-30) for the
  follow-up file-edit action, matching the rigor already applied to every Open Question.
- **RT-006 (ADVISORY, fixed):** `behavior.spec.md` §1.2's "Postgres is never `'cheap'`" aside was
  internally inconsistent with its own "deferred to OQ-03" framing. Softened to "this spec does not
  commit to whether a configured Postgres site can ever report `'cheap'`," and updated the citation
  to include SPEC-016's new AC-33 (the `'expensive'`-with-configured-tooling case).
- **RT-007 (ADVISORY, fixed):** The Integration Contracts row for SPEC-016 REQ-22 was citing
  AC-25 and AC-28; AC-28 is a loose fit (it tests this domain's own REQ-23, not SPEC-016 REQ-22's
  naming/callability convention). Dropped AC-28 from the row — AC-25 alone is a clean, direct test.
- **RT-008 / RT-009 (CONSTITUTION_FLAG, unchanged):** Already stated as Architect notes in
  `red-team-findings.md` in a form ready to carry into an ADR Complexity Justification (naming the
  `CUTOVER` repoint mechanism and the disk-headroom/`CUTOVER`-path test-determinism concern
  respectively) — verified no additional content was missing; nothing to add.
- **SPEC-016 re-sync (beyond RT-003/RT-007):** the confirmation-token TTL was tightened from
  "~10 minutes" to the exact 600-second figure throughout SPEC-017 (`feature.spec.md` User
  Journey step 3, AC-08; `behavior.spec.md` §4 Limits and Bounds; `traceability.spec.md` AC-08
  row), matching SPEC-016 REQ-10's revised exact figure. Every other Integration Contracts row
  was individually re-checked against SPEC-016 v1.1.0's current REQ/AC text (REQ-01–REQ-07,
  REQ-08–REQ-13, REQ-16–REQ-18, REQ-19–REQ-21) and needed no further change — SPEC-016's new
  `ActorIdentityRef`/`APPEND_ACTOR_REFERENCE` entity and new AC-33 are compatible with what
  SPEC-017 already cites/models, not contradictions of it.
- New version: `1.1.0`. New `content_hash`:
  `sha256:f9d60a5072a2eae2aa68b26bf9d5cdb66c42a3d23a3b0cd56cb5838376066355`.

## Revision Note (v1.2.0, Red-Team round 2 — 2026-07-14T23:58:00Z)

Revised in direct response to
`ADS-memory/reports/pipeline/017-storage-timeline/red-team-findings-round2.md` (1 BLOCKING,
2 ADVISORY, 2 CONSTITUTION_FLAG carried forward unchanged). Fixes, by finding id:

- **RT2-001 (BLOCKING, fixed):** Round 1's RT-003 fix only partially resolved the original
  finding — AC-42 correctly evidences SPEC-016 REQ-15, but AC-41 did not actually exercise REQ-14's
  distinct idempotency-key/`DUPLICATE_COMMAND` mechanism (SPEC-016 `behavior.spec.md` §1.1,
  `feature.spec.md` REQ-14); it re-tested REQ-11's `authorize()`-before-token-state ordering
  (`behavior.spec.md` §2.2, `feature.spec.md` REQ-11) under REQ-14's label. Read SPEC-016's REQ-14
  and behavior.spec.md §1.1 text directly: REQ-14 is a general-purpose rule for a call carrying
  **both an idempotency key and an authorization requirement**, whose short-circuit returns a prior
  `DUPLICATE_COMMAND` result — a different mechanism and error code from REQ-11's
  token-expiry/redemption-state check. Verified no idempotency-key input or `DUPLICATE_COMMAND`
  mechanism exists anywhere in SPEC-017 (`api.spec.md` §4's `storage_execute_migrate_forward` body
  carries only `confirmationToken`, matching SPEC-016's own `GATEWAY_EXECUTE` body; `errors.spec.md`
  defines no such code) — this domain's only duplicate-suppression mechanism is the confirmation
  token's own single-use redemption, already governed by REQ-11/REQ-13. ADR-041 §3's execute()
  precondition list uses "idempotency" loosely to describe that same token-redemption-state check,
  not an independent idempotency-key mechanism. **Chose option (b)** (per the dispatch's own
  framing): corrected the Integration Contracts citation rather than inventing a mechanism that
  doesn't exist in this domain. `feature.spec.md`'s Integration Contracts table now cites AC-41
  under the REQ-08–REQ-13 row (its actual evidence target, alongside AC-06–AC-10) instead of a
  REQ-14/REQ-15 row; REQ-15 now has its own single-citation row (AC-42 only); a new "Note on
  SPEC-016 REQ-14" explicitly states why REQ-14 has no independent domain-specific instantiation
  here. AC-41's own text and its `traceability.spec.md` Section 1 row were corrected to cite REQ-11,
  not REQ-14.
- **RT2-002 (ADVISORY, fixed):** Added `behavior.spec.md` §2.4 ("Boot-sequence ordering: crash
  reconciliation vs. cost-gated auto-migrate policy"): `RECONCILE_INTERRUPTED_MIGRATION` (REQ-15)
  MUST run and resolve/block before `evaluateBootMigrationPolicy` (REQ-28/REQ-29) is ever invoked —
  a site with a non-terminal `migration_runs` row never reaches the cost-gated auto-migrate/
  `PENDING_MIGRATION` decision until Recovery has resolved it. Referenced from
  `orchestrator.spec.md`'s `onBootDriftDetected` hook description and both boot-time Action
  Contract rows (`reconcileInterruptedMigrationOnBoot`, `evaluateBootMigrationPolicy`); added as a
  new `orchestrator.spec.md` §6 invariant; added as new `feature.spec.md` INV-08 and cross-referenced
  from REQ-15's own text. `traceability.spec.md` gained a Section 2 row (INV-08) and a Section 5 row
  (§2.4 boot-sequence ordering) to keep D-10/E-04 coverage complete.
- **RT2-003 (ADVISORY, fixed):** `spec-dod.md` F-08's stale evidence note ("`1.0.0` in every file")
  corrected to state the actual current version consistently across all files (now `1.2.0` after
  this revision).
- **RT2-004 / RT2-005 (CONSTITUTION_FLAG, unchanged):** carried forward verbatim (Postgres `CUTOVER`
  repoint mechanism library-first note; `CUTOVER`-path/disk-headroom test-determinism note) — no
  revision content touched this surface, matching Red-Team round 2's own disposition.
- New version: `1.2.0`. New `content_hash`:
  `sha256:d36feb11b1f57477ef4227f331571e7222505f8a24742cdcf70eb8eded37c35d`.

## Revision Note (v1.3.0, Red-Team round 3 — 2026-07-15T00:45:00Z)

Revised in direct response to
`ADS-memory/reports/pipeline/017-storage-timeline/red-team-findings-round3.md` (1 BLOCKING,
2 ADVISORY, 2 CONSTITUTION_FLAG carried forward unchanged), driven by the mandatory re-sync against
SPEC-016's own independent v1.1.0→v1.2.0 revision. Fixes, by finding id:

- **RT3-001 (BLOCKING, fixed):** SPEC-016's round-2 Red-Team fix (RT-017) reordered `execute()`'s
  check sequence — the actor-class redemption rule (REQ-13) now runs before plan
  re-derivation/hash comparison, not after (current SPEC-016 REQ-11 text, backed by its new
  AC-38/EC-10; this reordering closes an information-disclosure gap where an actor-class-mismatched,
  hash-stale caller would otherwise learn `PLAN_STALE` before being told it was never allowed to
  redeem the token). `SPEC-017-feature.spec.md` REQ-08 still stated the old, superseded order
  ("authorize-then-token-state-then-plan-hash-then-actor-class") — corrected to
  "authorize-then-token-state-then-actor-class-then-plan-hash ordering," matching SPEC-016 REQ-11
  exactly, with an added note confirming no domain-specific instantiation is needed beyond SPEC-016's
  own AC-38/EC-10 (no `storage.migrate-forward`-specific interaction with
  `RESTORE_POINT_UNAVAILABLE` was found that would differ under either ordering).
  `SPEC-017-orchestrator.spec.md` §5's `onBeforeQuiesce` row corrected from "authorize()`/token-state/
  plan-hash/actor-class checks" to "authorize()`/token-state/actor-class/plan-hash checks" to match.
- **RT3-002 (ADVISORY, fixed):** `feature.spec.md`'s Integration Contracts table row
  `REQ-16 – REQ-18` cited `AC-35` as evidence for "REQ-28's `kind='system'` attribution" — `AC-35` is
  actually about the Tier-3 browser's ≤200 page-size cap (REQ-26), unrelated to REQ-28. Corrected the
  citation to `AC-37`, REQ-28's actual `kind='system'`-attribution AC. A pre-existing
  SPEC-017-internal mislabel unrelated to the SPEC-016 resync, caught by round 3's fresh full pass.
- **RT3-003 (ADVISORY, fixed):** AC-41 and AC-42 previously asserted only on the `FORBIDDEN` error
  code (already deterministic on its own — not the untestability problem SPEC-016's RT-013 fixed).
  For parity with SPEC-016's own tightened AC-18/AC-19 (which assert on the `details.reasonCode`
  enum SPEC-016 v1.2.0 added), both ACs' Then-clauses now also assert
  `details.reasonCode === 'AUTHORIZE_DENIED'` — both scenarios are ordinary `authorize()` denials,
  not actor-class mismatches.
- **RT3-004 / RT3-005 (CONSTITUTION_FLAG, unchanged):** carried forward verbatim (Postgres `CUTOVER`
  repoint mechanism library-first note; `CUTOVER`-path/disk-headroom test-determinism note) — no
  revision content touched this surface.
- New version: `1.3.0`. New `content_hash`:
  `sha256:2f09a7f1fa6e0de45592f3829bd491dd9d89a47e3a9d0a6a8ae295ed9b85066f`.

## Sign-Off Status

- spec-dod.md Spec Agent row: filled, revised (2026-07-15T00:45:00Z for v1.3.0; previously revised
  2026-07-14T23:58:00Z for v1.2.0, 2026-07-14T23:00:00Z for v1.1.0; originally filled
  2026-07-14T21:00:00Z)
- spec-dod.md Coordinator row: filled (Sign-Off Block, 2026-07-15T05:35:00Z; Header Metadata reviewed_by/reviewed_date fields corrected to match in this same Coordinator Planning Preflight pass)
- planning_preflight_status: PASS
- human_spec_approval: APPROVED by Leona Burime (Project Owner), 2026-07-15T06:00:00Z — approved SPEC-016/017/018/019/020 together for Software Architect dispatch; recorded in this package's spec-dod.md Sign-Off Block (Human row)
- planning_preflight_checked_at: 2026-07-15T05:35:00Z
- planning_preflight_spec_hash: sha256:bce97937e6e34ec517b57385c80b34cd9a0c7ab33360cf97e081437b438ff6a8 (v1.3.0, recomputed 2026-07-15T07:00:00Z after the SPEC-002->SPEC-017 mechanical renumbering pass; matches current spec_hash. Red-Team round 4's substantive clearance still stands against the renumbered content)
- red_team_status: `cleared_for_architect` — round 4 confirmed RT3-001, RT3-002, and RT3-003 all
  RESOLVED against v1.3.0 (independently re-derived, not taken on the revision's word). RT3-004/
  RT3-005 (CONSTITUTION_FLAG) carry forward unchanged for Software Architect awareness. Round 4
  also re-verified this package's citations hold against SPEC-016's subsequent v1.4.0 revision
  (round 5's light cross-check, dispatched after SPEC-016's own RT4-001 fix landed) — no new drift.
  One new ADVISORY surfaced (RT4-002: stale `spec-dod.md` B-02/B-06 evidence cells contradicting
  that same file's own F-08 row; does not block dispatch). 0 BLOCKING.
- red_team_completed_at: 2026-07-15T04:30:00Z (round 4, against v1.3.0 — current)
- red_team_spec_hash: sha256:bce97937e6e34ec517b57385c80b34cd9a0c7ab33360cf97e081437b438ff6a8 (recomputed after renumbering; the round-4-cleared content is unchanged in substance)
  (v1.3.0 — the hash round 4 reviewed and cleared; matches `spec_hash` above)
- red_team_artifact: `ADS-memory/reports/pipeline/017-storage-timeline/red-team-findings-round3.md`
  (fresh full adversarial pass against v1.2.0, including the mandatory SPEC-016 v1.2.0 citation
  re-sync; round 1 and round 2's original findings remain at
  `ADS-memory/reports/pipeline/017-storage-timeline/red-team-findings.md` and
  `red-team-findings-round2.md` respectively for history, not overwritten).

## Software Architect Dispatch

- software_architect_status: PRODUCED
- software_architect_dispatched_at: 2026-07-15T08:00:00Z
- software_architect_mode: Agent Direct Mode (same session as SPEC-016, Coordinator adopted the
  Software Architect persona directly rather than dispatching a subagent)
- adr_path: `ADS-memory/reports/pipeline/017-storage-timeline/adr.md` (ADR-PIPE-017)
- implementation_outline_status: PRODUCED — `ADS-memory/reports/pipeline/017-storage-timeline/implementation-outline.md`
- critical_internal_constraints_status: PRODUCED (4 designated units: U-001 dialect-conditional
  state machine, U-002 drift classification algorithm, U-003 concurrent migration-in-flight guard,
  U-004 boot-sequence ordering) —
  `ADS-memory/reports/pipeline/017-storage-timeline/critical-internal-constraints.md`
- governance_promotion: evaluated, no new promotion (gateway-reuse rule already covered by GOV-ADR-001;
  sidecar-vs-content.db placement is domain-specific reasoning, not a generalizable cross-cutting rule)
- architecture_sign_off_status: APPROVED — approved by Leona Burime, 2026-07-15, after the 2-round
  `/audit-work` external audit (see `ADS-memory/.local-artifacts/external-audit/runs/20260715T160000Z-external-audit-report.md`);
  this package's own Post-Dispatch Correction (shared-lock reconciliation with SPEC-019) is included in the audited scope

## Post-Dispatch Correction (audit-work internal verification, 2026-07-15T15:35:00Z)

`/audit-work`'s mandatory internal verification pass (run before external peer dispatch) found a validated
BLOCKER: this package's `adr.md`/`implementation-outline.md`/`critical-internal-constraints.md` (dispatched
08:00) still described a Storage-local in-flight-operation guard (CIC U-003) for the migrate-forward
`execute()` path, but SPEC-019's own Software Architect pass (ADR-PIPE-019, dispatched 10:00 — two hours
later, same session) decided this exact concern requires ONE shared primitive (`core/operation-lock.ts`,
promoted to GOV-ADR-002) between Storage and Recovery, and explicitly rejected the two-independent-locks
shape this package still had. SPEC-017 was never revisited to reconcile this. **Fixed 2026-07-15T15:35:00Z**:
all three artifacts updated to withdraw the Storage-local U-003 designation and bind `executeMigrateForward`
to SPEC-019 CIC U-001 / `core/operation-lock.ts` instead. Re-validated clean (`--phase preflight`, exit 0)
after the fix. See `critical-internal-constraints.md`'s "Prior designations consulted" header for the full
correction note.

## TDD Dispatch

- tdd_status: PRODUCED
- tasks_md_path: `ADS-memory/reports/pipeline/017-storage-timeline/tasks.md`
- test_certification_path: `ADS-memory/reports/pipeline/017-storage-timeline/test-certification.md`
- test_file_count: 8 (`src/features/storage/__tests__/unit/{state-machine,drift,migrate-forward-execute,timeline,restore-points,tier3-browser,agent-tools}.unit.test.ts`,
  `src/features/storage/__tests__/integration/boot-sequence.integration.test.ts`)
- expected_test_count: 49
- spec_hash_verified: `sha256:bce97937e6e34ec517b57385c80b34cd9a0c7ab33360cf97e081437b438ff6a8` (validator `--phase preflight`, exit 0, matches this file's `spec_hash`)
- cic_proposed_or_requested: none — U-001, U-002, U-004 encoded through observable verification surfaces; U-003's binding reference to SPEC-019 CIC U-001 was honored by testing only this package's own wiring (lock-acquired-before-gateway ordering) via a fake lock port, without re-testing or re-designating the shared primitive itself (already certified by the parallel SPEC-019 TDD dispatch at `src/core/__tests__/unit/operation-lock.unit.test.ts` and `.../integration/operation-lock.cross-domain.integration.test.ts`, read-only reference)
- coverage_gaps: 8 documented gaps, all Medium or Low risk (no High) — see `test-certification.md` Known Gaps. Highest-risk: C-104 plan-glue integration (Medium, blocked on SPEC-016 implementation), REQ-14/REQ-24 Recovery hand-off (Medium, blocked on SPEC-019 not existing at outline time — matches the outline's own stated open risk), REQ-19 Postgres CONCURRENTLY indexing (Medium, no Postgres adapter exists), ledger-row composite actor-identity shape (Medium, deferred pending Programmer's row-construction function)
- recommended_next_routing: Programmer (implement `src/features/storage/{timeline,drift,restore-points,tier3-browser,agent-tools}.ts`, `src/features/storage/migrate-forward/{state-machine,plan,execute}.ts`, `src/features/storage/boot/{reconcile-interrupted-migration,evaluate-boot-migration-policy}.ts`, `src/infra/sqlite/{storage-journal-db,storage-journal-schema}.ts`, per `tasks.md` Phase 1, honoring CIC units U-001/U-002/U-004 directly and consuming SPEC-016's `core/gated-mutations` + SPEC-019's `core/operation-lock.ts` for U-003 — do not reimplement either)
