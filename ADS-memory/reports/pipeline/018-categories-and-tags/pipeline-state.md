# Pipeline State: 018-categories-and-tags

## Provider

- spec_provider: `speckit`
- provider_version_ref: `2c2fea8783f33085652b8c87e839bae84a6eb78d` (per `framework/spec-providers/speckit/provider.md`)
- provider_native_root: `specs/`
- provider_output_root: `ADS-memory/specs/018-categories-and-tags/`
- provider_mode: `ai_dev_shop_compatibility_flow` (not a literal upstream `.specify/` install)

## Spec Artifact

- spec_entrypoint_path: `ADS-memory/specs/018-categories-and-tags/SPEC-018-feature.spec.md`
- spec_readiness_artifact: `ADS-memory/specs/018-categories-and-tags/SPEC-018-spec-dod.md`
- spec_support_paths:
  - `ADS-memory/specs/018-categories-and-tags/SPEC-018-api.spec.md`
  - `ADS-memory/specs/018-categories-and-tags/SPEC-018-state.spec.md`
  - `ADS-memory/specs/018-categories-and-tags/SPEC-018-orchestrator.spec.md`
  - `ADS-memory/specs/018-categories-and-tags/SPEC-018-ui.spec.md`
  - `ADS-memory/specs/018-categories-and-tags/SPEC-018-errors.spec.md`
  - `ADS-memory/specs/018-categories-and-tags/SPEC-018-behavior.spec.md`
  - `ADS-memory/specs/018-categories-and-tags/SPEC-018-traceability.spec.md`
  - `ADS-memory/specs/018-categories-and-tags/SPEC-018-spec-manifest.md`
- spec_naming: `prefixed`
- spec_mode: `brownfield`
- depends_on: `SPEC-016` (content-admin-core-contract) **v1.4.0**,
  content_hash `sha256:3b8d2e89900641c4f239caf574fe9757f9f57f4111e2f5b2f6a7b63fe53211fe` — bumped
  during Coordinator Planning Preflight (2026-07-15; v1.2.0→v1.4.0 only touched REQ-01/EC-01/the
  Dependencies table/`state.spec.md`'s `watermark.value` row, none of which this package cites).
  Cited by REQ/AC id in `SPEC-018-feature.spec.md`'s `## Integration Contracts` section; SPEC-016 is
  not restated. Red-Team round 3's mandatory citation re-sync (Part 2 of
  `red-team-findings-round3.md`) confirmed every REQ-id/quoted-text citation in this table remains
  accurate against SPEC-016 v1.2.0's current text — this v1.3.0 revision updates the `depends_on`
  header metadata to match what that re-sync actually verified against (previously stale at
  v1.1.0; RT-017).
- spec_hash: `sha256:0dbe6f8750aed1ea94fe94d4cfde31345207c73591cd4bbe93d52f13f3422f60` (recomputed 2026-07-15T07:00:00Z after the SPEC-004->SPEC-018 renumbering pass -- content-identical in substance, label-only change; historically v1.3.0;
  previously `sha256:5191fc93e7714f827be3d2febe5033ddaaa42e910ed803038c47797829ae4ae3` at v1.2.0,
  `sha256:6e959768c9165b5c32c73a286022103ebe6f43a4186d4ded2c323792fe317505` at v1.1.0, and
  `sha256:a800dda30d1938b0f16629b3f8afc2f6d06242b30a89820f4c8ad5f7f2e6091c` at v1.0.0)
- spec_hash_verified_at: 2026-07-15T02:05:00Z — `validate_spec_package.py --phase spec
  --update-hash` (run twice: once after the content edits, again after adding the "Revision Note
  (v1.3.0)" section, which itself changed the hash), then re-verified clean with `--phase spec`
  and no `--update-hash` — exit 0 both times.
- **Note on SPEC-016 version:** SPEC-016 is being independently revised to v1.3.0 in a parallel
  dispatch as of this writing. This package's `depends_on` field cites SPEC-016 v1.2.0
  deliberately — that is the version Red-Team round 3's citation re-sync actually verified every
  reference against, not a guess at SPEC-016's still-in-progress v1.3.0 hash. A future round should
  re-sync `depends_on` (and re-verify citation accuracy) against SPEC-016's next stable version
  once that parallel revision lands.

## Revision History

### v1.1.0 (2026-07-14T23:30:00Z) — Red-Team revision pass

Resolved all findings from `red-team-findings.md` (prior spec hash
`sha256:a800dda30d1938b0f16629b3f8afc2f6d06242b30a89820f4c8ad5f7f2e6091c`, 3 BLOCKING / 6 ADVISORY)
and re-synced every SPEC-016 citation against SPEC-016's freshly revised v1.1.0
(`sha256:02382c267da4f022f822d4e571e6c8f32e6fc818771b7bc9e49a6e6683f2ee6d`).

- **RT-001 (BLOCKING, contradiction):** Reordered the `reparentTerm`/`createTerm` hierarchy-check
  sub-order from REQ-09→REQ-10→REQ-11 to REQ-10→REQ-09→REQ-11 (`behavior.spec.md` §2.1,
  `state.spec.md`, `orchestrator.spec.md`), resolving the contradiction between §2.1's fixed
  ordering and §7's unconditional EC-04 claim for the compound cross-taxonomy +
  non-hierarchical-taxonomy case. Explicit resolution rationale recorded in `behavior.spec.md` §2.1
  and `feature.spec.md` EC-03/EC-04.
- **RT-002 (BLOCKING, missing-failure-mode):** Added REQ-15a, AC-22a, EC-06a, INV-08, and the
  `SAME_TERM_MERGE` error code (400, non-retryable) to reject `mergeTerm`'s
  `fromTermId === intoTermId` self-merge case at `planMergeTerm` time, before any overlap
  computation. Propagated to `state.spec.md`, `orchestrator.spec.md`, `api.spec.md`,
  `errors.spec.md`, `ui.spec.md`, and `traceability.spec.md`.
- **RT-003 (BLOCKING, untestable/ambiguity):** Restated REQ-22 and AC-33 functionally — no
  agent-callable tool, regardless of name, may perform the `confirm()` step for `mergeTerm` —
  matching SPEC-016 REQ-22's actual functional prohibition instead of a `taxonomy_confirm_*`
  name-pattern ban. Added a mechanism-level verification note (inspect each tool's mapped
  orchestrator action, not its name) to `feature.spec.md`, `api.spec.md` §7, and
  `traceability.spec.md`.
- **RT-004 (ADVISORY):** OQ-03 marked Resolved (count-only disclosure, mirroring SPEC-016 OQ-04's
  resolved format).
- **RT-005 (ADVISORY):** AC-08 restated as a mechanism-level call-count assertion (verified by
  architectural/Code Review, not a live-state behavioral test, since ADR-043 §4 makes the
  divergent scenario unconstructable).
- **RT-006 (ADVISORY):** Added an explicit Scope statement: `status='deprecated'` is
  display/filtering-only in v1, no write-time enforcement.
- **RT-007 (ADVISORY):** Added EC-05a (self-parent) and EC-05b (3-node cycle) as their own edge
  cases with their own traceability rows.
- **RT-008 (ADVISORY):** EC-09 now commits to the idempotent-no-op-only behavior; dropped the
  ambiguous "or fails with a conflict" branch.
- **RT-009 (ADVISORY):** Added an explicit Out-of-Scope statement that `entryTerm.position`
  reordering is not a v1 capability.

`spec_hash` moved from `sha256:a800dda30d1938b0f16629b3f8afc2f6d06242b30a89820f4c8ad5f7f2e6091c`
(v1.0.0) to `sha256:6e959768c9165b5c32c73a286022103ebe6f43a4186d4ded2c323792fe317505` (v1.1.0). The
new hash was propagated to every sibling package file's own header (`api`, `state`, `orchestrator`,
`ui`, `errors`, `behavior`, `traceability` spec files).

### v1.3.0 (2026-07-15T02:05:00Z) — Red-Team round 3 revision pass

Resolved Red-Team round 3's finding (`red-team-findings-round3.md`, prior spec hash
`sha256:5191fc93e7714f827be3d2febe5033ddaaa42e910ed803038c47797829ae4ae3`, 1 BLOCKING / 3
ADVISORY). Round 3 also independently re-confirmed all 4 round-2 findings (RT-010–RT-013)
genuinely resolved and re-verified every SPEC-016 citation in this package accurate against
SPEC-016 v1.2.0 — see `red-team-findings-round3.md` Parts 1–2 for that verification detail; it did
not require any further edit in this package.

- **RT-014 (BLOCKING, contradiction/citation drift):** `state.spec.md`'s `EXECUTE_MERGE_TERM`
  Precondition column restated SPEC-016 REQ-11–REQ-13's check order as "authorize() → token
  validity → plan-hash match → actor-class rule" — SPEC-016's superseded v1.1.0 order. SPEC-016
  v1.2.0 corrected this order (actor-class rule before plan-hash comparison, per its own AC-38) to
  close a live-state information leak to unauthorized callers; `state.spec.md`'s restatement had
  drifted out of sync with that fix, directly contradicting `behavior.spec.md` §2.1's own citation
  of SPEC-016 `behavior.spec.md` §2.2 as the ordering authority. Corrected the Precondition column
  to state the checks in the current, correct order and cite SPEC-016 REQ-11/REQ-13/
  `behavior.spec.md` §2.2 explicitly as the ordering authority, rather than let the restatement
  imply it was itself authoritative.
- **RT-015 (ADVISORY, untestable):** AC-25 (REQ-17) presupposed a concrete `idempotencyKey`
  request field on `renameTerm` that no domain endpoint actually defines anywhere in
  `api.spec.md`'s Request Contracts or `state.spec.md`'s Action Catalog. Reworded AC-25 to test
  only the concretely observable `authorize()`-first ordering property (rejection before any other
  side effect), dropping the idempotency-specific framing, and updated `traceability.spec.md`'s
  AC-25 row to match.
- **RT-016 (ADVISORY, hash-propagation defect):** `feature.spec.md`'s `content_hash` correctly read
  the v1.2.0 canonical hash, but all 7 sibling package files' own header hash fields still read the
  stale v1.1.0 hash — the sibling-propagation step this project's own convention requires was
  dropped during the 1.1.0→1.2.0 bump. Propagated the new v1.3.0 canonical hash to all 7 sibling
  files (`api`, `state`, `orchestrator`, `ui`, `errors`, `behavior`, `traceability`), verified by
  grep, and corrected `spec-dod.md` B-02/B-06/F-08's evidence cells, which had also gone stale.
- **RT-017 (ADVISORY, stale dependency-version header):** `feature.spec.md`'s and
  `spec-manifest.md`'s `depends_on` fields still cited SPEC-016 v1.1.0. Updated both to SPEC-016
  v1.2.0 (`sha256:a43a9b33d3b37ed1003ba8294cb01b96b8ec470642986d3fa10a407990050981`) — the version
  round 3's mandatory citation re-sync actually verified every reference against.

`spec_hash` moved from `sha256:5191fc93e7714f827be3d2febe5033ddaaa42e910ed803038c47797829ae4ae3`
(v1.2.0) to `sha256:03ad39e3a209e0edc282424ec8c37023760f16abe71008ff8bdb5d8284ba9f81` (v1.3.0). The
new hash was propagated to every sibling package file's own header (`api`, `state`, `orchestrator`,
`ui`, `errors`, `behavior`, `traceability` spec files) — verified this time by grep across all 7
files, closing the exact gap RT-016 identified.

## Governance / Evidence Inputs Consulted

- `ADS-memory/governance/constitution.md` — unfilled template, no ratified articles; all 8 marked
  N/A in the Constitution Compliance table with concrete justification (same basis SPEC-016 used).
- `ADS-memory/knowledge/project_memory.md` — near-empty template, no entries invented.
- `ADS-memory/knowledge/learnings.md` — near-empty template, no entries invented.
- `ADS-memory/reports/codebase-analysis/` — confirmed absent (no `ANALYSIS-*`/`MIGRATION-*`/
  `TESTABILITY-*` reports exist for this surface); proceeding directly from the Accepted ADR-044
  and the live codebase (`src/features/post/post.ts`, `src/infra/db/schema.ts`).
- No `system-blueprint.md` exists for this feature — System Design was not run; proceeded with the
  compact self-check functional/NFR pass per the Spec Agent persona's steps 5-6.
- Confirmed absent before this run: `ADS-memory/specs/004-*`, `ADS-memory/reports/pipeline/004-*`.
- `ADS-memory/specs/016-content-admin-core-contract/SPEC-016-feature.spec.md` and
  `SPEC-016-traceability.spec.md` read in full before drafting, per the Coordinator's directive —
  every REQ/AC id cited in this spec's Integration Contracts section was copied verbatim from
  SPEC-016's own files, not invented or approximated.
- v1.1.0 revision: re-read all of SPEC-016 v1.1.0 (`SPEC-016-feature.spec.md`,
  `SPEC-016-traceability.spec.md`, `SPEC-016-state.spec.md`, `SPEC-016-errors.spec.md`) in full
  against the current `content_hash sha256:02382c267da4f022f822d4e571e6c8f32e6fc818771b7bc9e49a6e6683f2ee6d`
  and re-verified every citation in this spec's Integration Contracts table; corrected the one
  drifted citation (REQ-10's TTL) and the REQ-22 functional-vs-name-pattern wording (Red-Team
  RT-003).

## Source ADRs

- `ADS-memory/reports/architecture/ADR-044-categories-and-tags.md` (Accepted 2026-07-14) — primary source
- `ADS-memory/reports/architecture/ADR-043-collections.md` §4 (Accepted 2026-07-14, cited for the `content_types` reserved-key dependency)
- `ADS-memory/reports/architecture/ADR-021-identity-and-authorization.md` (cited by reference)
- `ADS-memory/reports/architecture/ADR-022-content-model-entries-registry-expression-indexes.md` §4a (cited by reference — the revisioning rule this spec narrows for `entry_terms`)

## Reserved / Not Yet Dispatched

- SPEC-017 (Storage/Timeline, ADR-041), SPEC-020 (Collections, ADR-043), and SPEC-019
  (Backups/Recovery, ADR-045) are sibling dependent specs being dispatched in parallel by other
  agents. This run did not touch their numbers or folders.

## Validator

- validator_command (v1.0.0 initial pass): `python3 AI-Dev-Shop/framework/spec-providers/speckit/validators/validate_spec_package.py ADS-memory/specs/018-categories-and-tags --phase spec --update-hash`
- validator_command (v1.1.0 revision pass): same command, re-run after the Red-Team revision
- validator_command (v1.3.0 revision pass): same command, run twice — once after the RT-014/
  RT-015/RT-017 content edits and version bump, again after adding the "Revision Note (v1.3.0)"
  section (which itself changes the hash) — then re-run with `--phase spec` and no `--update-hash`
  to confirm a clean idempotent pass
- validator_result: PASS (exit 0) for all passes. The v1.1.0 revision's `--update-hash` run
  produced `sha256:6e959768c9165b5c32c73a286022103ebe6f43a4186d4ded2c323792fe317505`. The v1.3.0
  revision's final `--update-hash` run produced
  `sha256:03ad39e3a209e0edc282424ec8c37023760f16abe71008ff8bdb5d8284ba9f81`, and a follow-up run
  with `--phase spec` and no `--update-hash` exited 0 cleanly, confirming an idempotent pass
  against the new hash.
- validator_manual_waiver: N/A (`python3` available directly)

## Sign-Off Status

- spec-dod.md Spec Agent row: filled (2026-07-14T21:00:00Z initial; re-signed 2026-07-14T23:30:00Z
  for the v1.1.0 revision; re-signed 2026-07-15T02:00:00Z for the v1.3.0 revision)
- spec-dod.md Coordinator row: filled (Sign-Off Block, 2026-07-15T05:35:00Z; Header Metadata reviewed_by/reviewed_date fields corrected to match in this same Coordinator Planning Preflight pass)
- planning_preflight_status: PASS
- human_spec_approval: APPROVED by Leona Burime (Project Owner), 2026-07-15T06:00:00Z — approved SPEC-016/017/018/019/020 together for Software Architect dispatch; recorded in this package's spec-dod.md Sign-Off Block (Human row)
- planning_preflight_checked_at: 2026-07-15T05:35:00Z
- planning_preflight_spec_hash: sha256:0dbe6f8750aed1ea94fe94d4cfde31345207c73591cd4bbe93d52f13f3422f60 (v1.3.0, recomputed 2026-07-15T07:00:00Z after the SPEC-004->SPEC-018 mechanical renumbering pass; matches current spec_hash. Red-Team round 4's substantive clearance still stands against the renumbered content)
- red_team_status: `cleared_for_architect` — round 4 confirmed RT-014 (BLOCKING) and RT-015/RT-016/
  RT-017 (ADVISORY) all RESOLVED against v1.3.0, including independently re-grepping the RT-016
  hash-propagation fix across all 8 files. Round 4's mandatory re-sync against SPEC-016 found no
  citation-content drift. One new ADVISORY surfaced (RT4-003: EC-09's concurrency justification
  borrows now-stale SQLite-only phrasing from SPEC-016's pre-RT-019 EC-01 — the underlying
  behavioral guarantee still holds, wording only; does not block dispatch). 0 BLOCKING. (Historical
  detail on round 3's findings retained below.)
- red_team_status (round 3 detail, historical): round 3 (fresh full pass against v1.2.0, plus the
  mandatory SPEC-016 v1.1.0→v1.2.0 citation re-sync) confirmed RT-010/RT-011/RT-012/RT-013 (round 2's
  findings) are genuinely resolved — RT-010 was independently re-derived field-by-field against
  SPEC-016's actual `ActorIdentityRef` shape and cross-checked against SPEC-020's cited AC-47/AC-48,
  not taken on the Coordinator's or the stalled agent's word. Every SPEC-016 REQ-id/quoted-text
  citation in SPEC-018's Integration Contracts table was re-verified accurate against SPEC-016's
  current v1.2.0 text. However, round 3 found **1 new BLOCKING finding (RT-014)**: SPEC-018's own
  `state.spec.md` restates `executeMergeTerm`'s SPEC-016 REQ-11–13 check order as "plan-hash match,
  actor-class rule" — SPEC-016 v1.1.0's now-superseded order (flagged as a non-disclosure-principle
  violation by SPEC-016's own round-2 RT-017) — instead of SPEC-016 v1.2.0's corrected order
  (actor-class rule *before* plan-hash comparison, per SPEC-016's new AC-38). Plus 3 new ADVISORY
  findings: RT-015 (AC-25's idempotency-precedence claim is untestable — no domain endpoint defines
  an `idempotencyKey` field anywhere in `api.spec.md`), RT-016 (7 of 8 sibling package files still
  carry the stale v1.1.0 `content_hash` header value instead of the current v1.2.0 hash; not caught
  by the validator, which only checks `feature.spec.md`'s own hash; `spec-dod.md` G-07's claim that
  all files carry the same value is currently false), and RT-017 (the `depends_on` header in
  `feature.spec.md`/`spec-manifest.md` still cites SPEC-016 v1.1.0 instead of v1.2.0 — metadata-only,
  substance unaffected per the Part 2 citation re-sync). **Route back to Spec Agent for a v1.3.0
  revision** — round 4 must re-run against the next hash.
- red_team_completed_at: 2026-07-15T01:30:00Z (round 3, against v1.2.0)
- red_team_completed_at (round 2, v1.1.0): 2026-07-14T23:59:00Z
- red_team_completed_at (prior run, v1.0.0): 2026-07-14T22:30:00Z
- red_team_spec_hash (prior run, v1.0.0): sha256:a800dda30d1938b0f16629b3f8afc2f6d06242b30a89820f4c8ad5f7f2e6091c
- red_team_spec_hash (round 2, v1.1.0): sha256:6e959768c9165b5c32c73a286022103ebe6f43a4186d4ded2c323792fe317505
  (verified directly from `SPEC-018-feature.spec.md`'s current `content_hash` header field, and
  mechanically confirmed via `validate_spec_package.py --phase spec` with no `--update-hash`
  needed — exit 0, see `red-team-findings-round2.md` "Hash Verification")
- red_team_spec_hash (round 3, v1.2.0): sha256:5191fc93e7714f827be3d2febe5033ddaaa42e910ed803038c47797829ae4ae3
  (verified directly from `SPEC-018-feature.spec.md`'s current `content_hash` header field, and
  mechanically confirmed via `validate_spec_package.py --phase spec` with no `--update-hash`
  needed — exit 0, see `red-team-findings-round3.md` "Hash Verification")
- red_team_artifact: `ADS-memory/reports/pipeline/018-categories-and-tags/red-team-findings.md`
  (round 1, findings RT-001–RT-009, filed against v1.0.0; per-finding resolution re-verified fresh
  in round 2, recorded in `red-team-findings-round2.md` Part 1)
- red_team_artifact (round 2): `ADS-memory/reports/pipeline/018-categories-and-tags/red-team-findings-round2.md`
  (fresh full pass against v1.1.0; RT-010 BLOCKING, RT-011/RT-012/RT-013 ADVISORY)
- red_team_artifact (round 3): `ADS-memory/reports/pipeline/018-categories-and-tags/red-team-findings-round3.md`
  (fresh full pass against v1.2.0 plus mandatory SPEC-016 v1.2.0 citation re-sync; RT-014 BLOCKING,
  RT-015/RT-016/RT-017 ADVISORY; RT-010–RT-013 confirmed genuinely resolved)

## Software Architect Dispatch

- software_architect_status: PRODUCED
- software_architect_dispatched_at: 2026-07-15T09:00:00Z
- software_architect_mode: Agent Direct Mode (same session as SPEC-016/017, Coordinator adopted the
  Software Architect persona directly rather than dispatching a subagent)
- adr_path: `ADS-memory/reports/pipeline/018-categories-and-tags/adr.md` (ADR-PIPE-018)
- implementation_outline_status: PRODUCED — `ADS-memory/reports/pipeline/018-categories-and-tags/implementation-outline.md`
- critical_internal_constraints_status: PRODUCED (2 designated units: U-001 fixed validation-chain
  ordering, U-002 cycle-detection algorithm) —
  `ADS-memory/reports/pipeline/018-categories-and-tags/critical-internal-constraints.md`
- governance_promotion: evaluated, no new promotion (gateway-reuse rule already covered by GOV-ADR-001;
  ADR-043 injectivity dependency is a two-party domain-specific contract, not a generalizable rule)
- architecture_sign_off_status: APPROVED — approved by Leona Burime, 2026-07-15, after the 2-round
  `/audit-work` external audit (see `ADS-memory/.local-artifacts/external-audit/runs/20260715T160000Z-external-audit-report.md`)

## TDD Dispatch

- tdd_status: PRODUCED
- tasks_md_path: `ADS-memory/reports/pipeline/018-categories-and-tags/tasks.md`
- test_certification_path: `ADS-memory/reports/pipeline/018-categories-and-tags/test-certification.md`
- test_file_count: 5 (`src/features/taxonomy/__tests__/unit/{validation-chain,cycle-detection,write-service,merge-term}.unit.test.ts`,
  `src/features/taxonomy/__tests__/integration/content-deletion-cleanup.integration.test.ts`)
- expected_test_count: 37
- spec_hash_verified: `sha256:0dbe6f8750aed1ea94fe94d4cfde31345207c73591cd4bbe93d52f13f3422f60` (validator `--phase preflight`, exit 0, matches this file's `spec_hash`)
- cic_proposed_or_requested: none — U-001 (all 3 historical Red-Team regressions RT-001/RT-011/RT-012 replayed as first-class tests) and U-002 (full recursive-walk property test across depths 1-10, both positive and negative) both encoded through observable verification surfaces
- coverage_gaps: 6 documented gaps, all Medium or Low risk (no High) — see `test-certification.md` Known Gaps. Highest-risk: AC-05 query-plan assertion (Medium, needs real SQLite adapter), C-207 real cross-domain gateway wiring (Medium, needs SPEC-016 implementation), AC-15a/AC-15b composite actor-identity on revision rows (Medium, deferred pending Programmer's exact revision-row construction), EC-06/EC-06a merge dedup mechanics (Medium, needs real executeMergeTerm)
- naming_convention_note: same as SPEC-016/017 — `ADS-memory/knowledge/project_memory.md`'s 2026-07-15 entry
- recommended_next_routing: Programmer (implement `src/features/taxonomy/{validation-chain,write-service,merge-term,repo.memory,repo.sqlite}.ts` per `tasks.md` Phase 1, honoring CIC units U-001/U-002 directly; add `taxonomies`/`terms`/`entry_terms`/`taxonomy_revisions` tables to `src/infra/db/schema.ts`; consume SPEC-016's `core/gated-mutations` for `mergeTerm` only, and `core/commands/executeCommand` for ordinary mutations per the outline's Module Map — do not reimplement either gateway)
