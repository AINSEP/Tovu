# Pipeline State: 019-backups-recovery

| Field | Value |
|---|---|
| feature | FEAT-019-backups-recovery |
| spec_id | SPEC-019 |
| spec_provider | speckit |
| provider_native_root | specs/ |
| provider_output_root | ADS-memory/specs/019-backups-recovery/ |
| spec_entrypoint_path | ADS-memory/specs/019-backups-recovery/SPEC-019-feature.spec.md |
| spec_readiness_artifact | ADS-memory/specs/019-backups-recovery/SPEC-019-spec-dod.md |
| spec_support_paths | ADS-memory/specs/019-backups-recovery/SPEC-019-{api,state,orchestrator,ui,errors,behavior,traceability,spec-manifest}.spec.md |
| spec_hash | sha256:eb0588d10723af1981dbad16975255bc05681df346246287a9c546514c854f4d (recomputed 2026-07-15T07:00:00Z after the SPEC-005->SPEC-019 renumbering pass -- content-identical in substance, label-only change) |
| spec_naming | prefixed |
| provider_mode | strict spec-system package (AI Dev Shop Speckit compatibility profile, not a literal upstream `.specify/` install) |
| spec_mode | brownfield |
| depends_on | SPEC-016 (content-admin-core-contract) — cites SPEC-016 REQ-01–REQ-22 by id in `## Integration Contracts`; does not redefine any of them. Content citations were re-verified accurate against SPEC-016 v1.2.0 in round 3 (this header field itself was left at the stale v1.1.0 pin at that time — a metadata-only bookkeeping gap of the same shape as other packages' RT-017/RT-018 findings, not a content defect). SPEC-016 has since moved to v1.4.0 (`content_hash: sha256:3b8d2e89900641c4f239caf574fe9757f9f57f4111e2f5b2f6a7b63fe53211fe`, self-defining the Postgres-backed watermark mechanism per RT4-001/round 5 — SPEC-019 does not cite REQ-01's engine-specific language directly, so this does not reopen SPEC-019's own content; corrected here as part of Coordinator Planning Preflight, 2026-07-15T05:35:00Z) — this field now correctly pins v1.4.0, `sha256:3b8d2e89900641c4f239caf574fe9757f9f57f4111e2f5b2f6a7b63fe53211fe`. |
| system_blueprint_path | none — no `system-blueprint.md` exists for this feature; Spec Agent ran the compact functional/NFR self-check per persona steps 5–6 |
| system_blueprint_status | N/A |
| codebase_analysis_reports | none found — `ADS-memory/reports/codebase-analysis/` does not exist; confirmed absent before this run |
| reverse_spec_artifacts | none — this is not a reverse-spec-derived feature |
| planning_preflight_status | PASS |
| human_spec_approval | APPROVED by Leona Burime (Project Owner), 2026-07-15T06:00:00Z — approved SPEC-016/017/018/019/020 together for Software Architect dispatch; recorded in this package's spec-dod.md Sign-Off Block (Human row) |
| planning_preflight_checked_at | 2026-07-15T05:35:00Z |
| planning_preflight_spec_hash | sha256:eb0588d10723af1981dbad16975255bc05681df346246287a9c546514c854f4d (recomputed 2026-07-15T07:00:00Z after the SPEC-005->SPEC-019 mechanical renumbering pass; matches current spec_hash. Red-Team round 3's substantive clearance still stands against the renumbered content) |
| validator_result | PASS — `python3 AI-Dev-Shop/framework/spec-providers/speckit/validators/validate_spec_package.py ADS-memory/specs/019-backups-recovery --phase spec --update-hash` exited 0; re-run without `--update-hash` also exited 0 (idempotent hash). `--phase preflight` correctly fails only on the reserved Coordinator sign-off row (expected — that row is Coordinator-owned, not Spec Agent-owned). |
| validator_manual_waiver | N/A — `python3` was available and used directly |
| red_team_status | cleared_for_architect (round 3 — citation-sync re-review against SPEC-016 v1.2.0; SPEC-019's own content unchanged and re-confirmed clean) |
| red_team_completed_at | 2026-07-15T00:30:00Z (round 3 — citation-sync re-review triggered by SPEC-016 moving v1.1.0 → v1.2.0; supersedes round 2's 2026-07-14T23:59:00Z completion as the last-reviewed status, though round 2's own content verdicts still stand since SPEC-019 was not revised) |
| red_team_spec_hash | sha256:eb0588d10723af1981dbad16975255bc05681df346246287a9c546514c854f4d (recomputed after renumbering; the round-3-cleared content is unchanged in substance. SPEC-019's own hash — mechanically re-verified unchanged from round 2, identical across all 8 hash-bearing files in the package: feature/api/state/orchestrator/ui/errors/behavior/traceability. Only SPEC-016's hash changed this round, from sha256:02382c267da4f022f822d4e571e6c8f32e6fc818771b7bc9e49a6e6683f2ee6d (v1.1.0) to sha256:a43a9b33d3b37ed1003ba8294cb01b96b8ec470642986d3fa10a407990050981 (v1.2.0) — see red-team-findings-round3.md Part 1/Part 2 for the itemized re-verification.) |
| red_team_artifact | ADS-memory/reports/pipeline/019-backups-recovery/red-team-findings-round3.md (round 2: red-team-findings-round2.md; round 1: red-team-findings.md — both preserved, superseded) |
| red_team_finding_counts | Round 1 (v1.0.0): 4 BLOCKING, 4 ADVISORY, 1 CONSTITUTION_FLAG — all 4 BLOCKING RESOLVED, 3 of 4 ADVISORY RESOLVED (RT-006 PARTIALLY RESOLVED — ownership reassigned to SPEC-016, underlying REQ/EC addition not yet landed there), CONSTITUTION_FLAG carried forward. Round 2 (v1.1.0): 0 new BLOCKING, 1 new ADVISORY (RT-010 — AC-06 cost/disk-acknowledgment phrasing ambiguity), 0 new CONSTITUTION_FLAG. Round 3 (v1.1.0, citation-sync vs. SPEC-016 v1.2.0): 0 new BLOCKING (every Integration Contracts citation re-verified accurate against SPEC-016's current text — SPEC-016's RT-012–RT-018 changes were additive/clarifying within already-cited REQ ranges, none contradicted a SPEC-019 assumption); RT-006 re-confirmed still PARTIALLY RESOLVED (SPEC-016 v1.2.0 did not address the authorize()-when-content.db-unreadable gap); 3 new ADVISORY (RT-011 — stale re-sync-note/depends_on provenance metadata still citing SPEC-016 v1.1.0; RT-012 — REQ-02/AC-34 "name every watermark-stamping chokepoint" audit never affirmatively states Recovery has zero; RT-013 — no SPEC-019 edge case mirrors SPEC-016's new EC-10/AC-38 actor-class-vs-stale-plan combined scenario); 0 new CONSTITUTION_FLAG (RT-009 carried forward unchanged). |

## Revision Note (2026-07-14T23:30:00Z) — Spec Agent, RT-001 through RT-008 fold-in

This revision (v1.0.0 → v1.1.0, hash `sha256:7011b971...` → `sha256:d55aa197...`) addresses every finding
in `red-team-findings.md`:

- **RT-001 (BLOCKING, hash propagation defect):** Every secondary file (`api`/`state`/`orchestrator`/`ui`/
  `errors`/`behavior`/`traceability`) previously carried the literal placeholder
  `sha256:0000...0000` instead of `feature.spec.md`'s real hash. Recomputed the canonical hash via the
  validator (`--update-hash`), then manually propagated `sha256:d55aa197ea90f04182d3c23f2bbdc177463327d5f88b7cb7ab2896e803e53de1`
  into all 7 sibling files by hand and verified each one by direct `grep` inspection (not just the
  mechanical recompute, since RT-001 showed the recompute step alone doesn't touch sibling files).
  `SPEC-019-spec-dod.md` item G-07's evidence text was also corrected — it previously asserted
  cross-file hash consistency as an assumed fact rather than a verified one.
- **RT-002 (BLOCKING, miscitation):** Removed the incorrect `AC-06` citation from the Watermark/
  disclosure Integration Contracts paragraph; `AC-06` is a `db-ops`-capability-surface concern (SPEC-016
  REQ-19 territory), not a watermark concern, and remains correctly cited only in that paragraph.
- **RT-003 (BLOCKING, unsupported citation / possible missing field):** Judgment call — corrected the
  citation rather than adding a new field. Per ADR-041 §4, composite actor identity is a documented
  property of the append-only `storage_ledger`/`migration_runs` rows, not of the `restore_points` artifact
  table Recovery's `RestorePointSummary`/`RestorePointRow` renders (ADR-041's round-1 audit fold commits
  `restore_points` only to `watermarkAtCapture`, never an actor column); ADR-045 §3's row description also
  carries no actor column. The restore-execution ledger row genuinely does need SPEC-016 REQ-16–18's
  composite identity (already correctly noted in `orchestrator.spec.md`'s `executeRestore` action), but no
  AC in this package renders or tests that field today, so citing AC-08/AC-29 against it was simply wrong.
  Rewrote the Integration Contracts paragraph accordingly and stated this reasoning inline.
- **RT-004 (BLOCKING, OQ vs. hard-coded fact contradiction):** Resolved OQ-04 now rather than making the
  P1 ACs provisional — `backup.read` is confirmed as final (consistent with `backup.create`/
  `backup.restore`'s existing `backup.` prefix per ADR-021 §3), since the package was already fully
  committed to that string in every P1 AC/auth-profile/agent-tool field. OQ-04 is marked Resolved with
  reasoning; no P1 AC text needed to change.
- **RT-005 (ADVISORY):** Added a clarifying sentence to REQ-09 stating `coveredCategories` is sourced from
  a versioned constant this spec owns, not an external write-path-registry capability (none exists in
  SPEC-016; SPEC-016 REQ-02 already places the naming obligation on each dependent spec).
- **RT-006 (ADVISORY):** Reassigned OQ-03's Owner from "Software Architect for SPEC-019" to "SPEC-016, not
  SPEC-019 alone," since the `content.db`-unreadable/`authorize()` gap affects SPEC-017 identically.
- **RT-007 (ADVISORY):** Added a testable substring requirement (`"planned downtime"`) to REQ-19/AC-29 and
  a matching `ui.spec.md` §5 accessibility rule for `DegradedStateBanner`'s `migration-interrupted` kind.
- **RT-008 (ADVISORY):** Split the Gated-mutation-gateway Integration Contracts sentence — `AC-23`–`AC-25`
  (progress-panel refresh-safety) are now attributed to the ADR-041 sidecar ops journal, not to SPEC-016
  REQ-08–REQ-15/REQ-22.
- **RT-009 (CONSTITUTION_FLAG):** Folded directly into the Constitution Compliance table's Article III row
  as a structured note (the four composed machinery pieces + owning REQs), so Software Architect can carry
  it into an ADR Complexity Justification without needing to separately open `red-team-findings.md`.

**Re-sync against SPEC-016 v1.1.0:** Every Integration Contracts citation was re-derived against SPEC-016's
current content (not spot-checked). REQ-01–REQ-22 numbering was unchanged; the material re-sync fold-ins
were: SPEC-016's new `AC-33` (`costClass: 'expensive'`) added to the `db-ops` capability-surface citation
range (SPEC-019's own AC-06 tests that exact case); the TTL default in `SPEC-019-behavior.spec.md` §4
updated from "~10 minutes" to "exactly 600 seconds (10 minutes), no jitter" to match SPEC-016's now-exact
value; and the RT-003 rewrite above additionally incorporates SPEC-016's named `ActorIdentityRef` entity
and `APPEND_ACTOR_REFERENCE` action.

## Notes

- This spec was written directly against ADR-045 (Backups/Recovery admin screen) and ADR-041 (Storage/
  Timeline, extended by ADR-045), plus SPEC-016's already-validated core contract
  (`ADS-memory/specs/016-content-admin-core-contract/`).
- SPEC-017 (Storage/Timeline), SPEC-020 (Collections), and SPEC-018 (Categories & Tags) are sibling
  dependent specs being dispatched in parallel by other agents; this run did not touch their folders or
  feature numbers.
- Zero `[NEEDS CLARIFICATION]` markers were required. Four non-blocking Open Questions (OQ-01 – OQ-04) are
  recorded in `SPEC-019-feature.spec.md`, each with an owner and a resolve-by target — none of them blocks
  Software Architect dispatch per the Spec Agent persona's own rule that only `BLOCKING` unknowns gate a
  stage.
- **Superseded by Red-Team (2026-07-14T22:30:00Z):** the note above's claim that OQ-04 is non-blocking was
  contradicted by Red-Team finding RT-004 — `backup.read` is already hard-coded as settled fact in
  multiple P1 acceptance criteria and every contract file, while OQ-04 marked that same string as still
  open for the Software Architect to decide.
- **Superseded again by this revision (2026-07-14T23:30:00Z):** OQ-04 is now Resolved (see the Revision
  Note above) — `backup.read` is confirmed final, not merely non-blocking-but-undecided. All 4 BLOCKING and
  4 ADVISORY findings from `red-team-findings.md` are addressed; `red_team_status` is
  `revised_pending_re_review`, awaiting Red-Team's re-review of the new `spec_hash` before this package can
  be considered cleared for Software Architect dispatch.

## Software Architect Dispatch

- software_architect_status: PRODUCED
- software_architect_dispatched_at: 2026-07-15T10:00:00Z
- software_architect_mode: Agent Direct Mode (same session as SPEC-016/017/018, Coordinator adopted the
  Software Architect persona directly rather than dispatching a subagent)
- adr_path: `ADS-memory/reports/pipeline/019-backups-recovery/adr.md` (ADR-PIPE-019)
- implementation_outline_status: PRODUCED — `ADS-memory/reports/pipeline/019-backups-recovery/implementation-outline.md`
- critical_internal_constraints_status: PRODUCED (3 designated units: U-001 shared cross-domain
  in-flight lock [also binding on SPEC-017's own implementation], U-002 disclosure-acknowledgment gate,
  U-003 fresh costClass re-check) —
  `ADS-memory/reports/pipeline/019-backups-recovery/critical-internal-constraints.md`
- constitution_flag_resolution: RT-009's CONSTITUTION_FLAG addressed — Complexity Justification entry
  filled in adr.md naming all 4 composed pieces of machinery and why each is needed
- governance_promotion: PROMOTED — `ADS-memory/governance/adrs/GOV-ADR-002-shared-operation-in-flight-lock.md`,
  `ADR-INDEX.md` updated
- unresolved_cross_spec_gap: OQ-03 (authorize() behavior when content.db is unreadable) was reassigned to
  SPEC-016 by Red-Team RT-006 but SPEC-016's current spec/ADR (v1.4.0 / ADR-PIPE-016) does not contain a
  resolution — flagged explicitly in adr.md Consequences; Coordinator should route a SPEC-016 amendment
  before this domain's TDD dispatch
- architecture_sign_off_status: APPROVED — approved by Leona Burime, 2026-07-15, after the 2-round
  `/audit-work` external audit (see `ADS-memory/.local-artifacts/external-audit/runs/20260715T160000Z-external-audit-report.md`).
  Approval does NOT resolve the still-open OQ-03 routing gap noted above (SPEC-016 amendment owed
  before this domain's own TDD dispatch) — that was disclosed, out of the audit's frozen scope, and
  remains a separate blocking item for TDD, not for architecture sign-off itself.

## TDD Dispatch

- tdd_status: PRODUCED
- tdd_dispatched_at: 2026-07-15T18:00:00Z
- tdd_mode: Agent Direct Mode (general-purpose agent adopting the TDD Agent persona per Coordinator dispatch)
- spec_hash_verified_at_tdd: 2026-07-15T18:00:00Z — `validate_spec_package.py --phase preflight` re-run, exit 0, matches `spec_hash` above
- tasks_md_path: `ADS-memory/reports/pipeline/019-backups-recovery/tasks.md`
- test_certification_path: `ADS-memory/reports/pipeline/019-backups-recovery/test-certification.md`
- test_file_count: 13 files, 56 runnable test cases (once implemented) — full inventory with sha256 in the certification record's Test File Inventory table
- cic_conformance: All 3 designated units (U-001, U-002, U-003) encoded through observable verification surfaces per the certification's Contract Tests / Property-Based Tests tables. U-001's cross-domain concurrent-acquire property test is flagged in this package's own CIC as "the highest-priority integration test in this entire 4-domain set" — written first, in `src/core/__tests__/integration/operation-lock.cross-domain.integration.test.ts`.
- cic_escalations: none — no `[CIC_REQUESTED]` or `[CIC_PROPOSED]` raised. Test design confirmed U-002-B1's exact audit-corrected composite predicate (disclosureAcknowledged flag AND planId provenance via the injected gateway, not an invented server-tracked acknowledgment record) and encoded it precisely, per the CIC's own explicit warning against inventing that record.
- coverage_gaps: 5 gaps recorded in the certification's Known Gaps table, all Low or Medium risk, none blocking — 3 are UI-component-contract concerns deferred to the React Component Testing Policy once the relevant `.tsx` components exist (AC-07, AC-18, AC-24/AC-25), 1 is a restore-points list-projection contract not separately outlined (AC-08/AC-09), 1 is a cross-package follow-up pending SPEC-017's sidecar journal implementation (AC-23).
- unresolved_cross_spec_gap_carried_forward: OQ-03 (authorize() behavior when content.db is unreadable) remains unresolved in SPEC-016 as of this TDD dispatch — this run proceeded per explicit Coordinator dispatch instruction, but this gap was NOT independently re-verified or resolved by TDD. No test in this suite exercises the content.db-unreadable-during-authorize() scenario, since its expected behavior is genuinely undefined pending the SPEC-016 amendment `pipeline-state.md`'s own Software Architect Dispatch section already flagged as owed "before this domain's TDD dispatch." Recorded here as an explicit escalation for Coordinator: this is a real, disclosed pre-existing gap, not a new one introduced by this TDD pass.
- recommended_next_routing: Programmer (per Coordinator scheduling) — implementation may proceed against the certified red-phase test suite. Recommend Coordinator resolve the OQ-03 SPEC-016 amendment before or in parallel with Programmer dispatch for this domain's `execute()`/`authorize()` boundary, since that gap directly affects `execute()`'s first-step behavior.
