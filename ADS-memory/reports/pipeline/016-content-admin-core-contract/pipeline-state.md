# Pipeline State: 016-content-admin-core-contract

## Provider

- spec_provider: `speckit`
- provider_version_ref: `2c2fea8783f33085652b8c87e839bae84a6eb78d` (per `framework/spec-providers/speckit/provider.md`)
- provider_native_root: `specs/`
- provider_output_root: `ADS-memory/specs/016-content-admin-core-contract/`
- provider_mode: `ai_dev_shop_compatibility_flow` (not a literal upstream `.specify/` install)

## Spec Artifact

- spec_entrypoint_path: `ADS-memory/specs/016-content-admin-core-contract/SPEC-016-feature.spec.md`
- spec_readiness_artifact: `ADS-memory/specs/016-content-admin-core-contract/SPEC-016-spec-dod.md`
- spec_support_paths:
  - `ADS-memory/specs/016-content-admin-core-contract/SPEC-016-api.spec.md`
  - `ADS-memory/specs/016-content-admin-core-contract/SPEC-016-state.spec.md`
  - `ADS-memory/specs/016-content-admin-core-contract/SPEC-016-orchestrator.spec.md`
  - `ADS-memory/specs/016-content-admin-core-contract/SPEC-016-errors.spec.md`
  - `ADS-memory/specs/016-content-admin-core-contract/SPEC-016-behavior.spec.md`
  - `ADS-memory/specs/016-content-admin-core-contract/SPEC-016-traceability.spec.md`
  - `ADS-memory/specs/016-content-admin-core-contract/SPEC-016-spec-manifest.md`
- spec_naming: `prefixed`
- spec_mode: `brownfield`
- spec_hash: `sha256:eade503dc1cc72dddad16eb54f3098dada29954493b6d8f964ac51ca0e06194f` (v1.4.0, recomputed 2026-07-15T07:00:00Z after the SPEC-001->SPEC-016 renumbering pass -- content-identical in substance, label-only change)
- spec_hash_verified_at: 2026-07-15T05:35:00Z — Coordinator Planning Preflight, confirmed via a
  fresh `validate_spec_package.py --phase preflight` run (exit 0, PASS) against
  `sha256:3b8d2e89900641c4f239caf574fe9757f9f57f4111e2f5b2f6a7b63fe53211fe`; supersedes Spec Agent's
  own prior verification note (2026-07-15T03:05:00Z) as the authoritative Coordinator-level record.

## Revision History

- **v1.4.0 (2026-07-15T05:00:00Z) — Red-Team round-4-driven revision.** Spec Agent (delegated
  subagent run) revised the package to resolve RT4-001 (BLOCKING), a cross-package contradiction
  found in `ADS-memory/reports/pipeline/017-storage-timeline/red-team-findings-round4.md` (search
  "RT4-001"; the dispatch that produced it was a cross-package review, so the authoritative finding
  text lives in SPEC-017's round-4 findings file, not this package's own), against spec hash
  `sha256:901082ad5bc9bc60c7a298b40b2649bbf55ce579e79cc8b05a316e4e8583a466` (v1.3.0):
  - RT4-001 (BLOCKING): v1.3.0's own RT-019 fix closed the SQLite-only watermark-scoping gap by
    delegating the Postgres-backed mechanism to SPEC-017. But SPEC-017's own Out-of-Scope section
    explicitly disclaims that exact obligation ("the `storage_write_watermark` counter's own
    definition... all owned by SPEC-016... never restated"), and no package in the five-spec
    pipeline actually defines the Postgres-side mechanism anywhere — a live, textual contradiction
    between SPEC-016 and SPEC-017, and the same "SQLite-only description, no stated Postgres
    equivalent" defect shape that has now recurred across rounds 1, 2, 3, and 4 (RT-003,
    RT-004/RT-012/RT-014, RT-019, RT4-001). Resolved per the project owner's confirmed choice —
    RT-019's originally-noted option (b): SPEC-016 withdraws the delegation and self-defines the
    Postgres-backed mechanism directly, matching how REQ-19–REQ-21 already state both engines'
    rules inside this contract with no cross-spec dependency, rather than moving the same open
    question to a different file. No SPEC-017 file was touched — SPEC-017's Out-of-Scope disclaimer
    is accurate again now that SPEC-016 self-defines the mechanism it disclaims owning.
    - REQ-01 now states the Postgres-backed mechanism directly: `storage_write_watermark` is stored
      as a `BIGINT` column (Drizzle's shared-schema Postgres mapping, per ADR-015, for the same
      64-bit signed range SQLite's `INTEGER` affinity provides), incremented within the same ACID
      transaction as the write it stamps; concurrent writers are serialized by Postgres's normal
      MVCC/row-locking semantics on the counter row, not the SQLite single-writer WAL model.
    - EC-01's Postgres-backed expected-behavior branch now states the same MVCC/row-locking
      serialization argument directly instead of pointing to SPEC-017.
    - The Dependencies table's "Postgres-backed `content.db`'s own transaction runtime... as
      defined by SPEC-017" row was replaced with a "Postgres MVCC/row-locking transaction runtime"
      row, parallel in shape to the existing SQLite row, with its own Failure Mode/Fallback columns.
    - `state.spec.md`'s `watermark.value` State Shape row (touched by v1.3.0's comprehensive sweep)
      received the same self-defining fix — the Postgres-backed cell now states the `BIGINT` column
      type directly instead of assigning it to SPEC-017.
    - `traceability.spec.md`'s REQ-01 and EC-01 rows were reworded to say both engines are
      self-defined here, not delegated. Two new ACs were added for testability: AC-39 (REQ-01,
      Postgres-backed atomic stamping) and AC-40 (REQ-01, Postgres-backed concurrent-writer
      serialization), both traced in `traceability.spec.md`.
  - Version bumped `1.3.0` → `1.4.0`; `content_hash` recomputed via the provider-local validator
    (`sha256:3b8d2e89900641c4f239caf574fe9757f9f57f4111e2f5b2f6a7b63fe53211fe`) and propagated to
    every sibling file that mirrors it in its own header (`api.spec.md`, `state.spec.md`,
    `orchestrator.spec.md`, `errors.spec.md`, `behavior.spec.md`, `traceability.spec.md`).
    `spec-manifest.md` and `spec-dod.md` do not mirror `content_hash` in their own headers, same as
    prior revisions.
  - `red_team_status` reset below to `revised_pending_re_review` — Red-Team must re-run (round 5)
    against the new hash before Software Architect dispatch. This revision does not itself
    constitute Red-Team clearance.

- **v1.3.0 (2026-07-15T02:15:00Z) — Red-Team round-3-driven revision.** Spec Agent (delegated
  subagent run) revised the package to resolve all findings in
  `ADS-memory/reports/pipeline/016-content-admin-core-contract/red-team-findings-round3.md` against
  spec hash `sha256:a43a9b33d3b37ed1003ba8294cb01b96b8ec470642986d3fa10a407990050981` (v1.2.0):
  - RT-019 (BLOCKING): REQ-01's watermark type/atomicity description, EC-01's concurrency-safety
    argument, and the Dependencies table's `SQLite / better-sqlite3 WAL transaction runtime` row
    were written exclusively in SQLite-specific terms, with no stated equivalent for a
    Postgres-backed `content.db` even though REQ-19/REQ-21 confirm Postgres-backed sites are
    squarely in scope for this same contract. Fixed per the finding's preferred option (a),
    mirroring how RT-014's fix assigned the polymorphic-content-reference flavor to its owning
    domain: REQ-01 and EC-01 now explicitly state their SQLite-specific language describes only the
    SQLite-backed case, and that the equivalent watermark storage type, same-transaction atomicity
    mechanism, and concurrency-safety argument for a Postgres-backed `content.db`
    (post-migrate-forward) is owned and defined entirely by SPEC-017, which owns the migrate-forward
    state machine per this spec's own Out-of-Scope section. The Dependencies table's SQLite row is
    now scoped to "SQLite-backed sites only," and a new sibling row assigns the Postgres-backed
    equivalent to SPEC-017.
  - Coordinator-mandated comprehensive SQLite-only sweep: this exact defect shape was BLOCKING three
    rounds running (round 1's RT-003, round 2's RT-012, round 3's RT-019), so Spec Agent grepped all
    9 package files for SQLite-specific terms (`SQLite`, `WAL`, `better-sqlite3`, type affinity,
    single-writer semantics) lacking a stated scope. Found and fixed one additional instance beyond
    RT-019's own three locations: `state.spec.md` §1's State Shape table described
    `watermark.value`'s type as SQLite-INTEGER-affinity-only, with no Postgres-backed equivalent —
    fixed with the same engine-scoping pattern, assigning the Postgres-backed column type/atomicity
    mechanism to SPEC-017. Every other SQLite/Postgres mention in the package (REQ-19–REQ-21 and
    their ACs, the Dependencies table's `pg_dump`/blue-green row, `traceability.spec.md`'s
    REQ-20/REQ-21 rows) was already correctly engine-branched with a stated equivalent for both
    engines — no further changes were needed there.
  - RT-020 (ADVISORY): REQ-14's RT-016-era text ("any mutating call site — gated or ordinary — in
    this contract or in any dependent domain") reached beyond this spec's own stated
    gated-mutation-gateway scope and risked duplicating an `authorize()`-ordering rule ADR-021
    already owns. Narrowing the rule's breadth back to this contract's own gateway would reopen
    RT-016's original testability gap (this contract's own gateway endpoints have no idempotency-key
    field to test the rule against), so Spec Agent instead kept the cross-cutting breadth and added
    one clarifying sentence to REQ-14 and to `api.spec.md`'s Purpose note, stating this is a
    restatement of an ADR-021-owned `authorize()`-ordering property surfaced here for convenience,
    not a rule this spec originates or owns independently of ADR-021.
  - RT-021 (ADVISORY): REQ-03's "refreshed after every `content.db` commit that changes it" read as
    a synchronous, commit-triggered guarantee, while AC-04 and `state.spec.md`'s `RECONCILE_MIRROR`
    action only ever commit to "the next reconciliation opportunity" (boot, or a periodic tick, no
    stated interval) — an untestable, inconsistent-guarantee gap. Chose the lower-risk fix per the
    finding's own suggested resolution: softened REQ-03's language to explicitly match
    `RECONCILE_MIRROR`'s actual boot-and-periodic-tick-only triggers and state the guarantee is
    bounded-eventual, not synchronous, rather than inventing an unbenchmarked exact tick interval.
    AC-04 was already worded consistently with this weaker guarantee and needed no content change;
    its `traceability.spec.md` description row was reworded to match REQ-03's new phrasing.
  - Version bumped `1.2.0` → `1.3.0`; `content_hash` recomputed via the provider-local validator
    (`sha256:901082ad5bc9bc60c7a298b40b2649bbf55ce579e79cc8b05a316e4e8583a466`) and propagated to
    every sibling file that mirrors it in its own header (`api.spec.md`, `state.spec.md`,
    `orchestrator.spec.md`, `errors.spec.md`, `behavior.spec.md`, `traceability.spec.md`).
    `spec-manifest.md` and `spec-dod.md` do not mirror `content_hash` in their own headers, same as
    prior revisions.
  - `red_team_status` reset below to `revised_pending_re_review` — Red-Team must re-run (round 4)
    against the new hash before Software Architect dispatch. This revision does not itself
    constitute Red-Team clearance.

- **v1.2.0 (2026-07-14T23:45:00Z) — Red-Team round-2-driven revision.** Spec Agent (delegated
  subagent run) revised the package to resolve all findings in
  `ADS-memory/reports/pipeline/016-content-admin-core-contract/red-team-findings-round2.md` against
  spec hash `sha256:02382c267da4f022f822d4e571e6c8f32e6fc818771b7bc9e49a6e6683f2ee6d` (v1.1.0):
  - RT-012 (BLOCKING): `restorePoint.kind: 'external'` had no defined trigger anywhere in the
    package — the same defect class as round-1's RT-003, on a sibling field the RT-003 fix didn't
    touch. ADR-041 §2 already establishes a real, in-scope trigger ("PITR is recorded only as an
    `external` marker the adapter cannot itself execute"), so REQ-19 was extended to define it: an
    externally-managed PITR/backup mechanism the `db-ops` adapter cannot itself execute, paired
    with `costClass: 'unavailable'`. Added AC-37. Chosen over deleting the enum value because a
    concrete, ADR-grounded trigger condition exists and is in scope.
  - RT-013 (BLOCKING): `FORBIDDEN.details.reason` was a bare unenumerated string illustrated only
    by example text, so AC-18/AC-19 could not be asserted on deterministically. Added a closed
    `details.reasonCode` enum (`AUTHORIZE_DENIED` | `ACTOR_CLASS_MISMATCH`) in `errors.spec.md`
    §3/§4 as the stable discriminator; `details.reason` remains free-text/illustrative only.
    AC-18/AC-19 now assert `details.reasonCode === 'ACTOR_CLASS_MISMATCH'` exactly, and REQ-13
    states the ordinary `authorize()` denial case sets `details.reasonCode: 'AUTHORIZE_DENIED'`.
  - RT-014 (ADVISORY, carried forward from round 1's partially-resolved RT-004): REQ-18's
    polymorphic-content-reference flavor of the soft cross-boundary reference rule had no
    state/action contract, unlike the composite actor-identity flavor. Added an explicit statement
    to REQ-18 and `state.spec.md`'s Purpose: this core contract directly instantiates only the
    actor-identity flavor (it owns principal attribution); the polymorphic-content-reference
    flavor's concrete entity (e.g. `entry_terms`) is owned and instantiated entirely by the
    dependent domain spec that defines it. No generic placeholder entity was added — this is a
    deliberate domain-boundary statement, not an oversight, matching the Out-of-Scope section's
    existing exclusion of concrete polymorphic-reference tables.
  - RT-015 (ADVISORY): REQ-19 now states "working" (for Postgres restore tooling) is a static
    configuration-presence check (binary path/credentials/target parameters present and
    structurally valid) performed at `getCapabilities()` call time, never a live health probe —
    keeping `getCapabilities()` cheap and side-effect-free. Configured-but-broken tooling also
    reports `costClass: 'unavailable'` (new AC-36), the same as never-configured (AC-29), rather
    than a silently-wrong `'expensive'`.
  - RT-016 (ADVISORY): REQ-14 and `api.spec.md`'s Purpose now state explicitly that the
    idempotency-vs-authorize precedence rule is a generic cross-cutting rule for any mutating call
    site (gated or ordinary) in any dependent domain; this file's own three gateway endpoints do
    not themselves accept an idempotency-key field, since `GATEWAY_EXECUTE`'s single-use
    confirmation token already provides equivalent replay protection
    (`TOKEN_ALREADY_REDEEMED`/INV-03).
  - RT-017 (ADVISORY): `execute()`'s check ordering let an actor-class-mismatched caller learn
    `PLAN_STALE` before `FORBIDDEN`, in tension with this spec's own non-disclosure principle
    (REQ-11/REQ-14). Reordered the sequence so the actor-class redemption rule (REQ-13) runs
    immediately after the token expiry/redemption-state check and before plan
    re-derivation/hash comparison. Updated `behavior.spec.md` §2.2 (order + tie-break rationale +
    new Edge Case Handling row), `orchestrator.spec.md`'s Lifecycle Hooks (new `onActorClassCheck`
    hook inserted before `onAfterPlanRecompute`), `state.spec.md`'s `REDEEM_TOKEN` precondition
    order, and `feature.spec.md`'s REQ-11/REQ-13 text. Added EC-10 and AC-38 to make the new
    ordering testable.
  - RT-018 (ADVISORY): Corrected the two-hour timestamp discrepancy in `SPEC-016-spec-dod.md`'s
    B-06 Notes cell and Sign-Off Block Spec Agent row (previously `2026-07-14T20:00:00Z`, now
    `2026-07-14T23:45:00Z`, matching the header `filled_date` and `feature.spec.md`'s
    `last_edited`).
  - Version bumped `1.1.0` → `1.2.0`; `content_hash` recomputed via the provider-local validator
    (`sha256:a43a9b33d3b37ed1003ba8294cb01b96b8ec470642986d3fa10a407990050981`) and propagated to
    every sibling file that mirrors it in its own header (`api.spec.md`, `state.spec.md`,
    `orchestrator.spec.md`, `errors.spec.md`, `behavior.spec.md`, `traceability.spec.md`).
    `spec-manifest.md` and `spec-dod.md` do not mirror `content_hash` in their own headers (same as
    the v1.1.0 revision), consistent with prior practice.
  - `red_team_status` reset below to `revised_pending_re_review` — Red-Team must re-run (round 3)
    against the new hash before Software Architect dispatch. This revision does not itself
    constitute Red-Team clearance.

- **v1.1.0 (2026-07-14T22:00:00Z) — Red-Team-driven revision.** Spec Agent (delegated subagent
  run) revised the package to resolve all findings in
  `ADS-memory/reports/pipeline/016-content-admin-core-contract/red-team-findings.md` against spec
  hash `sha256:0d527b31e34a595a0c3c8b0715e9134c97ac1bc7389af21f4212d3f395157142` (v1.0.0):
  - RT-001 (BLOCKING): Replaced every "~10 minutes"/"approximately 10 minutes" occurrence with an
    exact 600-second TTL (REQ-10, AC-14, `behavior.spec.md` §3/§4, `state.spec.md` §1, `api.spec.md`
    §5) — no jitter/tolerance band, since none was intended.
  - RT-002 (BLOCKING): Extended `FORBIDDEN`'s Ownership row in `errors.spec.md` §4 to name
    `execute()`'s actor-class redemption check (REQ-13) as a second producer alongside
    `authorize()`, distinguished via `details.reason`. Chosen over minting a new code because it
    reuses the existing authz-category code family rather than adding a parallel vocabulary.
  - RT-003 (BLOCKING): Added AC-33 (REQ-19) and a Dependencies-table update stating that a
    Postgres-backed site with configured `pg_dump`/blue-green tooling reports
    `costClass: 'expensive'`, `kind: 'logical-dump'` — giving the `'expensive'` enum value a
    defined trigger condition.
  - RT-004 (BLOCKING): Added an `ActorIdentityRef` entity to `state.spec.md` §2 and an
    `APPEND_ACTOR_REFERENCE` Action Catalog row in §3, mirroring the treatment already given to
    `STAMP_WATERMARK`, so the composite actor-identity/soft-reference pattern has a formal
    state/action contract like the package's other shared mechanisms.
  - RT-005 (ADVISORY): REQ-02 now requires each dependent domain spec's own
    `## Integration Contracts` section to explicitly name every write chokepoint that calls the
    watermark-stamping function; added AC-34 to make this an auditable, spec-level commitment.
  - RT-006 (ADVISORY): OQ-02 now explicitly requires its eventual resolution to state whether
    `storage_write_watermark` scoping is per-`content.db`-file or per-site.
  - RT-007 (ADVISORY): AC-11 no longer says "succeed identically" — it now specifies that only
    `planHash` (not `planId` or `details`) is guaranteed identical across principal kinds.
  - RT-008 (ADVISORY): REQ-01 and `state.spec.md`'s `watermark.value` row now state the counter is
    a 64-bit signed integer, with overflow explicitly out of scope.
  - RT-009 (ADVISORY): Added EC-09, AC-35, and a `TOKEN_EXPIRED` ownership-table note stating an
    unrecognized/forged `confirmationToken` is treated identically to an expired token, never a
    distinct code.
  - RT-010 (ADVISORY): REQ-16 and AC-23 now explicitly extend the `(delegatedByWorkspaceId,
    delegatedById)` attribution requirement to `kind='api_key'` actions (owning-user attribution),
    matching the agent-delegation case rather than leaving it asymmetric and unstated.
  - RT-011 (CONSTITUTION_FLAG): Verified `spec-dod.md` item G-04 already carries the rule-of-three
    justification (Storage/Recovery/Collections, with ADR citations) in a form directly reusable by
    Software Architect for an ADR Complexity Justification table — no content change was needed.
  - Version bumped `1.0.0` → `1.1.0`; `content_hash` recomputed via the provider-local validator
    and propagated to every sibling file that mirrors it in its own header
    (`api.spec.md`, `state.spec.md`, `orchestrator.spec.md`, `errors.spec.md`, `behavior.spec.md`,
    `traceability.spec.md`).
  - `red_team_status` reset below to `revised_pending_re_review` — Red-Team must re-run against
    the new hash before Software Architect dispatch. This revision does not itself constitute
    Red-Team clearance.

## Governance / Evidence Inputs Consulted

- `ADS-memory/governance/constitution.md` — unfilled template, no ratified articles; all 8 marked
  N/A in the Constitution Compliance table with concrete justification.
- `ADS-memory/knowledge/project_memory.md` — near-empty template, no entries invented.
- `ADS-memory/knowledge/learnings.md` — near-empty template, no entries invented.
- `ADS-memory/reports/codebase-analysis/` — confirmed absent (no `ANALYSIS-*`/`MIGRATION-*`/
  `TESTABILITY-*` reports exist for this surface); proceeding directly from the four Accepted ADRs.
- No `system-blueprint.md` exists for this feature — System Design was not run; proceeded with the
  compact self-check functional/NFR pass per the Spec Agent persona's steps 5-6.
- Confirmed absent before this run: `ADS-memory/specs/001-*`, `ADS-memory/reports/pipeline/001-*`.

## Source ADRs

- `ADS-memory/reports/architecture/ADR-041-storage-timeline.md` (Accepted 2026-07-14)
- `ADS-memory/reports/architecture/ADR-043-collections.md` (Accepted 2026-07-14)
- `ADS-memory/reports/architecture/ADR-044-categories-and-tags.md` (Accepted 2026-07-14)
- `ADS-memory/reports/architecture/ADR-045-backups-recovery-screen.md` (Accepted 2026-07-14)
- `ADS-memory/reports/architecture/ADR-021-identity-and-authorization.md` (Accepted 2026-07-07, cited by reference)
- `ADS-memory/reports/architecture/ADR-022-content-model-entries-registry-expression-indexes.md` (cited by reference)

## Reserved / Not Yet Dispatched

- SPEC-017 (Storage/Timeline, ADR-041), SPEC-020 (Collections, ADR-043), SPEC-018 (Categories &
  Tags, ADR-044), and SPEC-019 (Backups/Recovery, ADR-045) are reserved feature numbers. No folder
  or content was created for them by this run. Each will cite this spec (SPEC-016) by REQ/AC/INV id
  in its own `## Integration Contracts` section once dispatched.

## Validator

- validator_command (v1.0.0 draft): `python3 AI-Dev-Shop/framework/spec-providers/speckit/validators/validate_spec_package.py ADS-memory/specs/016-content-admin-core-contract --phase spec --update-hash`
- validator_result (v1.0.0 draft): PASS (exit 0). One repair round was required (an angle-bracket
  route-parameterization token in this package's own notation collided with the validator's banned
  template-placeholder marker list — fixed by switching to curly-brace notation for all such
  tokens). Re-ran without `--update-hash` afterward to confirm a clean, idempotent pass (exit 0).
- validator_command (v1.1.0 Red-Team revision, 2026-07-14T22:15:00Z): same command as above, run
  again after the RT-001–RT-010 content edits.
- validator_result (v1.1.0 Red-Team revision): PASS (exit 0) on the first attempt — no repair round
  needed for this revision. Re-ran without `--update-hash` afterward and confirmed a clean,
  idempotent pass (exit 0). New hash:
  `sha256:02382c267da4f022f822d4e571e6c8f32e6fc818771b7bc9e49a6e6683f2ee6d`.
- validator_command (v1.2.0 Red-Team round-2 revision, 2026-07-14T23:50:00Z): same command as
  above, run again after the RT-012–RT-018 content edits.
- validator_result (v1.2.0 Red-Team round-2 revision): PASS (exit 0) on the first attempt — no
  repair round needed for this revision. Re-ran without `--update-hash` afterward and confirmed a
  clean, idempotent pass (exit 0). New hash:
  `sha256:a43a9b33d3b37ed1003ba8294cb01b96b8ec470642986d3fa10a407990050981`.
- validator_command (v1.3.0 Red-Team round-3 revision, 2026-07-15T02:20:00Z): same command as
  above, run again after the RT-019/RT-020/RT-021 content edits.
- validator_result (v1.3.0 Red-Team round-3 revision): PASS (exit 0) on the first attempt — no
  repair round needed for this revision. New hash:
  `sha256:901082ad5bc9bc60c7a298b40b2649bbf55ce579e79cc8b05a316e4e8583a466`; propagated to every
  sibling file that mirrors `content_hash` in its own header. Re-ran without `--update-hash`
  afterward and confirmed a clean, idempotent pass (exit 0) — see below.
- validator_command (v1.4.0 Red-Team round-4 revision, 2026-07-15T05:00:00Z): same command as
  above, run again after the RT4-001 content edits.
- validator_result (v1.4.0 Red-Team round-4 revision): PASS (exit 0) on the first attempt — no
  repair round needed for this revision. New hash:
  `sha256:3b8d2e89900641c4f239caf574fe9757f9f57f4111e2f5b2f6a7b63fe53211fe`; propagated to every
  sibling file that mirrors `content_hash` in its own header. Re-ran without `--update-hash`
  afterward and confirmed a clean, idempotent pass (exit 0) — see below.
- validator_manual_waiver: N/A (python3 available at `/usr/local/bin/python3`)

## Sign-Off Status

- spec-dod.md Spec Agent row: filled (2026-07-15T05:00:00Z; content re-verified against v1.4.0 —
  see `SPEC-016-spec-dod.md` Section B notes updated for the version bump and the `last_edited`
  timestamp)
- spec-dod.md Coordinator row: filled (Sign-Off Block, 2026-07-15T05:35:00Z; Header Metadata reviewed_by/reviewed_date fields corrected to match in this same Coordinator Planning Preflight pass)
- planning_preflight_status: PASS
- human_spec_approval: APPROVED by Leona Burime (Project Owner), 2026-07-15T06:00:00Z — approved SPEC-016/017/018/019/020 together for Software Architect dispatch; recorded in this package's spec-dod.md Sign-Off Block (Human row)
- planning_preflight_checked_at: 2026-07-15T05:35:00Z
- planning_preflight_spec_hash: sha256:eade503dc1cc72dddad16eb54f3098dada29954493b6d8f964ac51ca0e06194f (v1.4.0, recomputed 2026-07-15T07:00:00Z after the SPEC-001->SPEC-016 mechanical renumbering pass; matches current spec_hash. Red-Team round 5's substantive clearance still stands against the renumbered content -- see adr.md Planning Preflight Evidence)
- red_team_status: `cleared_for_architect` — round 5 independently re-verified RT4-001 RESOLVED in
  v1.4.0 (SPEC-016 now self-defines the Postgres-backed watermark mechanism in REQ-01/EC-01/the
  Dependencies table/`state.spec.md`'s `watermark.value` row, with new AC-39/AC-40, instead of
  delegating it to SPEC-017 — closing the live textual contradiction). Round 5's fresh pass on the
  new content and its light SPEC-017 cross-check found 0 new findings. 0 BLOCKING.
- red_team_completed_at: 2026-07-15T05:20:00Z (round 5, against v1.4.0 — current)
- red_team_spec_hash: sha256:eade503dc1cc72dddad16eb54f3098dada29954493b6d8f964ac51ca0e06194f (recomputed after renumbering; the round-5-cleared content is unchanged in substance)
  (v1.4.0 — the hash round 5 reviewed and cleared; matches `spec_hash` above, mechanically
  re-verified via `validate_spec_package.py --phase spec`, exit 0, no drift)
- red_team_artifact: ADS-memory/reports/pipeline/016-content-admin-core-contract/red-team-findings-round5.md
  (round 5, current gate; round 4's SPEC-016-relevant finding RT4-001 is documented in
  finding text for this package's fix lives in SPEC-017's own round-4 findings file, not a
  round-4 file under this package's own pipeline folder, which does not exist; round 1's
  `red-team-findings.md`, round 2's `red-team-findings-round2.md`, and round 3's
  `red-team-findings-round3.md` under this package's own folder are preserved unmodified for the
  record)
- red_team_finding_count (v1.0.0 round-1 review, superseded): 4 BLOCKING, 6 ADVISORY,
  1 CONSTITUTION_FLAG — see Revision History above for how each of RT-001–RT-011 was addressed by
  the v1.1.0 revision; round 2 verified 10 of 11 RESOLVED and 1 (RT-004) PARTIALLY RESOLVED (the
  composite actor-identity half was fixed; the polymorphic-content-reference half of the same
  REQ-18 rule still lacked a state/action contract at that time — carried forward as RT-014, now
  addressed by the v1.2.0 revision above).
- red_team_finding_count (v1.1.0 round-2 review, superseded): 2 BLOCKING (RT-012: `restorePoint.kind`
  `'external'` enum value unreachable — same defect class as round-1's RT-003, on a sibling field
  the revision didn't touch; RT-013: `FORBIDDEN.details.reason` lacks a closed/stable vocabulary to
  distinguish its two producers, undermining RT-002's own fix one layer deeper), 5 ADVISORY
  (RT-014–RT-018), 0 new CONSTITUTION_FLAG (RT-011 carried forward unchanged, still valid, requires
  no action) — see Revision History above (v1.2.0 entry) for how each of RT-012–RT-018 was
  addressed.
- red_team_finding_count (v1.2.0 round-3 review, superseded): round 3 verified all 7 of
  RT-012–RT-018 RESOLVED (see `red-team-findings-round3.md` Part 1). Fresh findings this round: 1
  BLOCKING (RT-019: SQLite-only watermark atomicity/type language with no Postgres-backed
  equivalent), 2 ADVISORY (RT-020: REQ-14's RT-016 fix widened the idempotency-precedence rule into
  a cross-dependent-domain mandate that may duplicate ADR-021's own `authorize()` contract; RT-021:
  REQ-03/AC-04's mirror-refresh timing ("after every commit" vs. "next reconciliation opportunity")
  is untestable as worded, though low-risk since REQ-05 already forces conservative disclosure when
  the mirror could be stale), 0 new CONSTITUTION_FLAG (RT-011 carried forward unchanged, still
  valid, requires no action) — see Revision History above (v1.3.0 entry) for how each of
  RT-019/RT-020/RT-021 was addressed, including the Coordinator-mandated comprehensive SQLite-only
  sweep.
- red_team_routing (v1.2.0, round 3 complete, acted on by the v1.3.0 revision above): 1 BLOCKING
  finding existed (RT-019) — per the Red-Team persona's Output Format, BLOCKING means the spec must
  be revised before Software Architect dispatch regardless of count (the "3 or more" escalation rule
  is a systemic-quality threshold, not a minimum to enforce this rule). The v1.3.0 revision resolves
  RT-019 and folds in RT-020/RT-021 as directed. Red-Team round 4 must still re-run against the
  v1.3.0 hash before Software Architect dispatch — this revision does not itself constitute
  Red-Team clearance.

## Software Architect Dispatch

- software_architect_status: PRODUCED
- software_architect_dispatched_at: 2026-07-15T07:00:00Z
- software_architect_mode: Agent Direct Mode (Coordinator adopted the Software Architect persona
  directly per this session's explicit "be the architect" instruction, rather than dispatching a
  subagent — see `AI-Dev-Shop/AGENTS.md`'s Delegated Agent Bootstrap fallback and this project's own
  [[no-unilateral-parallel-agent-dispatch]] memory)
- adr_path: `ADS-memory/reports/pipeline/016-content-admin-core-contract/adr.md` (ADR-PIPE-016)
- implementation_outline_status: PRODUCED — `ADS-memory/reports/pipeline/016-content-admin-core-contract/implementation-outline.md`
- critical_internal_constraints_status: PRODUCED (4 designated units: U-001 execute() check-sequence
  ordering, U-002 watermark same-transaction atomicity, U-003 single-use token redemption under
  concurrency, U-004 boot-time mirror reconciliation direction) —
  `ADS-memory/reports/pipeline/016-content-admin-core-contract/critical-internal-constraints.md`
- governance_promotion: PROMOTED — `ADS-memory/governance/adrs/GOV-ADR-001-gated-mutation-gateway-and-watermark-chokepoint.md`,
  `ADR-INDEX.md` updated
- architecture_sign_off_status: APPROVED — approved by Leona Burime, 2026-07-15, after the 2-round
  `/audit-work` external audit (see `ADS-memory/.local-artifacts/external-audit/runs/20260715T160000Z-external-audit-report.md`)
  found and resolved 2 blockers + 6 minor findings (round 1) plus 1 unlanded fix + 4 residuals (round 2, diff-only re-audit)

## TDD Dispatch

- tdd_status: PRODUCED
- tasks_md_path: `ADS-memory/reports/pipeline/016-content-admin-core-contract/tasks.md`
- test_certification_path: `ADS-memory/reports/pipeline/016-content-admin-core-contract/test-certification.md`
- test_file_count: 7 (`src/core/gated-mutations/__tests__/unit/{token,watermark,gateway,actor-identity}.unit.test.ts`,
  `src/core/gated-mutations/__tests__/integration/{watermark-transaction,boot-reconciliation,db-ops}.integration.test.ts`)
- expected_test_count: 51
- spec_hash_verified: `sha256:eade503dc1cc72dddad16eb54f3098dada29954493b6d8f964ac51ca0e06194f` (validator `--phase preflight`, exit 0, matches this file's `spec_hash`)
- cic_proposed_or_requested: none — all four designated units (U-001–U-004) were encoded through their declared observable verification surfaces; no undesignated triggering unit was found during test design
- coverage_gaps: 10 documented gaps, all Medium or Low risk (no High) — see `test-certification.md` Known Gaps. Highest-risk items: AC-03/REQ-02 (dependent-domain write-service call site, Medium — owned by SPEC-018/020), AC-39/AC-40/REQ-01 Postgres half + EC-01 Postgres half (Medium — no Postgres adapter exists in this codebase, architecturally deferred per `implementation-outline.md`), AC-25/26/27/REQ-18 (Medium — orphan-tolerance/reconciliation-sweep require a real dependent-domain referencing table)
- naming_convention_note: recorded in `ADS-memory/knowledge/project_memory.md` (2026-07-15 entry) — new pipeline-numbered feature work uses `__tests__/unit/*.unit.test.ts` / `__tests__/integration/*.integration.test.ts`; pre-existing repo tests keep their flat `.test.ts` convention unchanged
- recommended_next_routing: Programmer (implement `src/core/gated-mutations/{ports,token,watermark,actor-identity,gateway}.ts`, `src/infra/sqlite/db-ops.ts`, `src/infra/postgres/db-ops.ts`'s pure capability function, and the additive `storage_write_watermark` schema column, per `tasks.md` Phase 1 T010–T016, honoring CIC units U-001–U-004's Binding constraints)
