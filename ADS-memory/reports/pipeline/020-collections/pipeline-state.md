# Pipeline State: 020-collections

| Field | Value |
|-------|-------|
| feature | 020-collections |
| feat_id | FEAT-020-collections |
| spec_id | SPEC-020 |
| depends_on | SPEC-016 v1.4.0 (`content_hash: sha256:3b8d2e89900641c4f239caf574fe9757f9f57f4111e2f5b2f6a7b63fe53211fe`) — bumped during Coordinator Planning Preflight (2026-07-15); v1.2.0 was the version round 3's re-sync actually verified against, and v1.2.0→v1.4.0 only touched REQ-01/EC-01/the Dependencies table/state.spec.md's watermark.value row, none of which this package cites, so no citation re-verification was reopened; see Revision Note below |
| spec_provider | speckit |
| provider_native_root | specs/ |
| provider_output_root | ADS-memory/specs/020-collections/ |
| spec_entrypoint_path | ADS-memory/specs/020-collections/SPEC-020-feature.spec.md |
| spec_readiness_artifact | ADS-memory/specs/020-collections/SPEC-020-spec-dod.md |
| spec_support_paths | SPEC-020-api.spec.md, SPEC-020-state.spec.md, SPEC-020-orchestrator.spec.md, SPEC-020-ui.spec.md, SPEC-020-errors.spec.md, SPEC-020-behavior.spec.md, SPEC-020-traceability.spec.md, SPEC-020-spec-manifest.md |
| spec_naming | prefixed |
| spec_mode | brownfield |
| provider_mode | ai-dev-shop-speckit-compatibility |
| spec_hash | sha256:c678a2a9bae047245654e4998089e4905fe52aaa6e80389ec7dadb122028efff (recomputed 2026-07-15T07:00:00Z after the SPEC-006->SPEC-020 renumbering pass -- content-identical in substance, label-only change) |
| spec_hash_verified_at | 2026-07-15T03:30:00Z |
| validator_result | PASS (`--phase spec --update-hash`, then re-verified clean/idempotent with `--phase spec` and no `--update-hash`) |
| validator_manual_waiver | N/A |
| planning_preflight_status | PASS |
| human_spec_approval | APPROVED by Leona Burime (Project Owner), 2026-07-15T06:00:00Z — approved SPEC-016/017/018/019/020 together for Software Architect dispatch; recorded in this package's spec-dod.md Sign-Off Block (Human row) |
| planning_preflight_checked_at | 2026-07-15T05:35:00Z |
| planning_preflight_spec_hash | sha256:c678a2a9bae047245654e4998089e4905fe52aaa6e80389ec7dadb122028efff (v1.3.0, recomputed 2026-07-15T07:00:00Z after the SPEC-006->SPEC-020 mechanical renumbering pass; matches current spec_hash. Red-Team round 4's substantive clearance still stands against the renumbered content) |
| red_team_status | cleared_for_architect — round 4 confirmed RT-015 (BLOCKING, new REQ-30/AC-54/AC-55/EC-18/EC-19), RT-016, RT-017, and RT-018 (ADVISORY) all RESOLVED against v1.3.0 with concrete new content, not restatements. Round 4's mandatory re-sync against SPEC-016 found no new drift. One new ADVISORY surfaced (RT4-004: stale `spec-dod.md` B-04/B-06 evidence cells, same pattern as SPEC-017's RT4-002; does not block dispatch). 0 BLOCKING. |
| red_team_completed_at | 2026-07-15T04:30:00Z (round 4, against v1.3.0 — current) |
| red_team_spec_hash | sha256:c678a2a9bae047245654e4998089e4905fe52aaa6e80389ec7dadb122028efff (recomputed after renumbering; v1.3.0 — the hash round 4 reviewed and cleared; matches `spec_hash` above) |
| red_team_artifact | ADS-memory/reports/pipeline/020-collections/red-team-findings-round4.md (round 4, current gate; supersedes round 3 — rounds 1-3 retained on disk for history) |
| codebase_analysis_reports | none — `ADS-memory/reports/codebase-analysis/` confirmed absent before this run |
| system_blueprint_path | none — no blueprint was run for this feature; compact self-check per Spec Agent persona steps 5-6 was applied directly |
| system_blueprint_status | N/A |

## Notes

SPEC-020 (Collections) is the first of four dependent domain specs (SPEC-017 Storage/Timeline,
SPEC-020 Collections, SPEC-018 Categories & Tags, SPEC-019 Backups/Recovery) dispatched against the
shared core contract SPEC-016 (`content-admin-core-contract`). SPEC-017, SPEC-018, and SPEC-019 are
being dispatched in parallel by other agents; this run did not touch those feature numbers or
folders.

This spec cites SPEC-016 REQ-01, REQ-02, REQ-08 through REQ-19, and REQ-22 by id in its own
`## Integration Contracts` section (`SPEC-020-feature.spec.md`) rather than restating their
behavior. It does not cite SPEC-016 REQ-03–REQ-07 (Storage/Recovery-owned disclosure mechanics) or
REQ-20/REQ-21 (restore-point capture mechanics), which this domain does not call.

Verified before this run: `ADS-memory/specs/003-*` and `ADS-memory/reports/pipeline/003-*` were both
absent.

## Revision Note (v1.0.0 → v1.1.0, 2026-07-14T23:00:00Z)

This revision was dispatched to fix the 5 BLOCKING / 5 ADVISORY / 1 CONSTITUTION_FLAG findings in
`red-team-findings.md` (raised against v1.0.0, `spec_hash`
`sha256:e206a5c22ae6fb7c66d7b397eb69698ee5f22e1c30d09333642af5ae646af882`), and to re-sync every
`## Integration Contracts` citation against SPEC-016's own v1.1.0 revision (which landed in the same
session and changed SPEC-016's REQ numbering/content: exact 600s token TTL, `FORBIDDEN` now also
covering actor-class-redemption rejections at REQ-13, new AC-33 for `costClass: 'expensive'`, and a
new formal `ActorIdentityRef` entity + `APPEND_ACTOR_REFERENCE` action in SPEC-016's own
`state.spec.md`/`orchestrator.spec.md`).

**BLOCKING fixes:**
- RT-001 — `CONTENT_TYPE_UPDATE_FIELDS.fields` was undefined as full-replace vs. merge-by-name.
  **Decision: full-replace.** New REQ-26 states this explicitly; the queryable cap (REQ-05) is now
  checked against the submitted array alone; field removal is full-replace omission — no separate
  `removeFields` mechanism was added, since Red-Team's own analysis named full-replace omission as
  "the only stated mechanism by which REQ-15's scenario could ever occur." New AC-41/AC-42.
- RT-002 — update/publish/unpublish against a non-`active` content type had no stated behavior.
  **Decision: blocked only for `tombstone`, permitted for `deprecated`** (matches REQ-10's existing
  "deprecated blocks only new creation" posture, and closes the exact risk Red-Team named — a fresh
  `entry.published` outbox event firing for a type the spec elsewhere treats as retired). New
  REQ-28, AC-44/AC-45/AC-46; failure-code lists and `api.spec.md` error mapping updated.
- RT-003 — a `kind` change on a field that stays `queryable` had no reindex requirement. New REQ-27
  requires teardown+re-provision in the same transaction; new AC-43; new INV-09.
- RT-004 — `ContentTypeRevision`/`EntryRevision` lacked SPEC-016 REQ-16's
  `delegatedByWorkspaceId`/`delegatedById` fields despite `agent` principals being permitted on
  every mutating route. Both entities in `state.spec.md` §2 now carry these fields, referencing
  SPEC-016's new `ActorIdentityRef` shape directly; REQ-08/REQ-16 amended; new AC-47/AC-48.
- RT-005 — `behavior.spec.md` §7 claimed kind-conformance checking was "part of REQ-14" but REQ-14's
  text didn't cover it. REQ-14 amended to state the kind-conformance clause explicitly (and, folding
  in RT-008, the `{ext.site}` envelope-shape clause too); new AC-49/AC-50.

**ADVISORY fixes folded in:** RT-006 (User Journey step 2 reordered to match REQ-24), RT-007 (AC-38
rewritten for grammar), RT-008 (folded into REQ-14/AC-50 above; `FieldsJsonEnvelope` formalized in
`api.spec.md`), RT-009 (OQ-04 updated to reflect SPEC-016's own OQ-04 is now Resolved — no remaining
owner/resolve-by), RT-010 (Integration Contracts now states `content_type_revisions`/
`entry_revisions` share `content.db` with `principals`, so REQ-17's physical-boundary clause doesn't
itself apply here — cited only for its general soft-reference posture).

**CONSTITUTION_FLAG (RT-011):** left as-is — already phrased in `feature.spec.md`'s Constitution
Compliance table as a forward-looking Architect note for the ADR Complexity Justification (why the
fixed `kind→CAST` lookup table is hand-rolled rather than routed through Drizzle's typed-column API,
ADR-015). No spec-level change was needed; Software Architect should carry this into ADR-043's (or a
successor ADR's) Complexity Justification section.

New `content_hash`: `sha256:26782f655075384c4f743e04d9fe6224e3eb121bafd7fba49e69ed26776f40d8`,
propagated to every sibling file's own header. Validator re-run confirmed idempotent (no further
hash drift on a second `--phase spec` run without `--update-hash`).

## Round 2 Red-Team Note (2026-07-14T23:45:00Z, against v1.1.0)

A fresh, full adversarial pass (not a checklist re-verification) against v1.1.0 confirmed all 5 prior
BLOCKING and 5 prior ADVISORY findings RESOLVED, and RT-011 (CONSTITUTION_FLAG) correctly carried
forward unchanged. It also found **1 new BLOCKING finding**: RT-012 — `CONTENT_TYPE_UPDATE_FIELDS`'s
full-replace `fields` array has no stated floor (no `minItems`, no REQ addressing an empty-array
submission), unlike `CONTENT_TYPE_CREATE`'s `minItems: 1`; a `fields: []` submission would, per
REQ-26's literal text, silently reduce a content type to zero fields with no explicit accept/reject
decision on record. Plus 2 new ADVISORY findings: RT-013 (the pre-existing "ordinary `queryable`-flag
flip on update triggers index provisioning/teardown" behavior has no REQ/INV anchor, unlike the new
REQ-27/INV-09 given to the kind-change case) and RT-014 (`spec-dod.md` B-02's Notes cell still says
`"1.0.0"` against the file's own `1.1.0` header — stale self-reference).

Full detail: `ADS-memory/reports/pipeline/020-collections/red-team-findings-round2.md`.

**This spec is not yet cleared for Software Architect dispatch** — RT-012 must be resolved (a narrow,
single-issue fix, not a full revision cycle) and the package re-validated before `/plan`.

## Revision Note (v1.1.0 → v1.2.0, 2026-07-15T00:30:00Z)

This revision was dispatched to fix the 1 BLOCKING and fold in the 2 ADVISORY findings from Red-Team
round 2 (`red-team-findings-round2.md`, raised against v1.1.0, `spec_hash`
`sha256:26782f655075384c4f743e04d9fe6224e3eb121bafd7fba49e69ed26776f40d8`).

**BLOCKING fix:**
- RT-012 — `CONTENT_TYPE_UPDATE_FIELDS`'s `fields` array had no stated floor: a present-but-empty
  `fields: []` submission would, per REQ-26's literal text, silently reduce a content type to zero
  fields, with no explicit accept/reject decision on record and no distinct error path for silently
  dropping a `required` field. **Decision: reject it.** A submitted `fields` array, when present,
  must now contain at least 1 entry (`minItems: 1` in `api.spec.md`, symmetric with
  `CONTENT_TYPE_CREATE`'s own `fields.minItems: 1`); a `fields: []` submission is rejected with
  `VALIDATION_ERROR` (`details.reason='fields_empty'`) before any other guard runs, and the content
  type's existing field set is left completely unchanged. This reading was chosen over the
  alternative (permit `fields: []` as a deliberate full-clear) because REQ-26's original intent was
  that full-replacement semantics govern *which* fields exist after a call, never whether the
  content type may be left fieldless, and because this spec's disable→tombstone→cleanup lifecycle
  establishes a project-wide pattern that destructive/degenerate states are reached only through
  their own explicit, deliberate step — never as an incidental side effect of an otherwise-ordinary
  field-update call. This is also the option Red-Team's own finding named as "recommended." REQ-26
  amended with the explicit floor statement; new AC-51; new EC-16; `api.spec.md`,
  `state.spec.md`, `orchestrator.spec.md`, and `errors.spec.md` (new `VALIDATION_ERROR
  (details.reason='fields_empty')` details shape and ownership row) all updated to match.

**ADVISORY fixes folded in:**
- RT-013 — the pre-existing "ordinary `queryable`-flag flip on update triggers index
  provisioning/teardown" behavior had no REQ/INV anchor, unlike the kind-change case which got
  REQ-27/INV-09 in v1.1.0. New REQ-29 and INV-10 mirror that same treatment; new AC-52/AC-53 and
  EC-17 anchor it to testable criteria; `state.spec.md`/`orchestrator.spec.md` now cite REQ-29
  explicitly wherever they previously described this behavior with no REQ number attached.
- RT-014 — `spec-dod.md` item B-02's Notes cell read `"1.0.0"` against the file's own (then `1.1.0`,
  now `1.2.0`) header — a stale self-reference from the original v1.0.0 DoD pass. Corrected to match
  the current version. While updating adjacent DoD rows for the new REQ-29/AC-51-53/INV-10/EC-16-17
  counts, a second pre-existing stale count was also found and corrected as the same class of
  self-consistency defect: G-05's "34 P1 ACs" note did not match B-21's already-correct P1 count
  (44 as of v1.1.0, now 47) — both now read 47.

Zero new `[NEEDS CLARIFICATION]` markers were introduced. RT-012 required a genuine Spec Agent
judgment call between two textually-permitted readings of REQ-26 (documented above and in REQ-26's
own text), not an open question, since Red-Team's own suggested resolution named the recommended
answer.

New `content_hash`: `sha256:eba25e6e95a82b7c4fe847d16f414f265d768c958d0757088b24d2a0865c9efe`,
propagated to every sibling file's own header (the two historical hash citations in
`spec-manifest.md`'s Validation Notes, which deliberately reference the superseded v1.1.0 hash, were
left untouched). Validator re-run confirmed idempotent (`--phase spec`, no further hash drift on a
second run without `--update-hash`).

**This spec is not yet cleared for Software Architect dispatch** — it awaits Red-Team round 3
re-review of this v1.2.0 revision before `/plan`.

## Round 3 Red-Team Note (2026-07-15T02:00:00Z, against v1.2.0)

A fresh, full adversarial pass (not a checklist re-verification) against v1.2.0, plus the mandatory
re-sync of every `## Integration Contracts` citation against SPEC-016's now-current v1.2.0 text
(`content_hash: sha256:a43a9b33d3b37ed1003ba8294cb01b96b8ec470642986d3fa10a407990050981`), confirmed
all 3 prior findings RESOLVED for the exact scenarios they named: RT-012 (BLOCKING — empty `fields: []`
now correctly rejected with no residual gap in that scenario), RT-013 and RT-014 (ADVISORY). RT-011
(CONSTITUTION_FLAG) correctly carried forward unchanged.

It also found **1 new BLOCKING finding**: RT-015 — REQ-27 and REQ-29 are each written as mutually
exclusive cases (kind-changes-while-queryable-stays-constant vs. queryable-changes-while-kind-stays-
constant) that together leave two reachable scenarios uncovered by any REQ/AC: a brand-new field added
via `UPDATE_CONTENT_TYPE_FIELDS` with `queryable=true` from the start (not a "resubmission of an
existing field," REQ-29's own wording), and a single field whose `kind` and `queryable` both change in
the same call. `state.spec.md`'s descriptive prose claims REQ-29 covers the "newly added" case, but
REQ-29's own normative text does not establish that — the same defect shape round 1's RT-005 found
BLOCKING. Plus 3 new ADVISORY findings: RT-016 (ambiguous ordering between the fields_empty rejection
and the `expectedVersion` optimistic-concurrency check — `state.spec.md` and `orchestrator.spec.md`
give different signals and no AC covers the combined-failure case), RT-017 (SPEC-016 v1.2.0's REQ-18
text was newly narrowed to name `entry_terms` as the polymorphic-content-reference flavor's only
concrete instance, creating a fresh citation-scope ambiguity for SPEC-020's `entries.type` reference
that did not exist against v1.1.0's shorter text), and RT-018 (`spec-manifest.md` and this file's own
`depends_on` field still pin `SPEC-016 v1.1.0` even though SPEC-016 was bumped to v1.2.0 before this
spec's own v1.2.0 revision was authored — stale bookkeeping, same class as RT-009/RT-014).

Full detail: `ADS-memory/reports/pipeline/020-collections/red-team-findings-round3.md`.

**This spec is not yet cleared for Software Architect dispatch** — RT-015 must be resolved (a narrow,
single-issue fix extending REQ-27/REQ-29 or adding a new REQ, plus matching AC/EC) and the package
re-validated before `/plan`. RT-016 through RT-018 (ADVISORY) should be folded into the same revision
pass but do not themselves block dispatch.

## Revision Note (v1.2.0 → v1.3.0, 2026-07-15T03:30:00Z)

This revision was dispatched to fix the 1 BLOCKING finding (RT-015) and fold in the 3 ADVISORY
findings (RT-016, RT-017, RT-018) from Red-Team round 3 (`red-team-findings-round3.md`, raised
against v1.2.0, `spec_hash sha256:eba25e6e95a82b7c4fe847d16f414f265d768c958d0757088b24d2a0865c9efe`).

**BLOCKING fix:**
- RT-015 — REQ-27 and REQ-29 are each written as mutually exclusive cases (kind-changes-while-
  queryable-stays-constant vs. queryable-changes-while-kind-stays-constant), leaving two reachable
  scenarios ungoverned by any REQ/AC: a brand-new field added via `UPDATE_CONTENT_TYPE_FIELDS` with
  `queryable=true` from the start, and a single field whose `kind` and `queryable` both change in
  the same call. **Decision: add new REQ-30** rather than broaden REQ-27/REQ-29's own text, so their
  existing wording and every AC/EC that already cites them for their own narrower cases is left
  undisturbed. New AC-54/AC-55 and EC-18/EC-19 anchor REQ-30 to testable criteria for each of the
  two scenarios; `state.spec.md`'s `UPDATE_CONTENT_TYPE_FIELDS` row (which previously misattributed
  the "newly added" case's coverage to REQ-29) now correctly cites REQ-30 for that case;
  `orchestrator.spec.md` and `api.spec.md` updated to match; INV-09/INV-10 amended to also cite
  REQ-30; `behavior.spec.md` §7 gained three matching edge-case rows.

**ADVISORY fixes folded in:**
- RT-016 — ambiguous ordering between the fields_empty rejection and the `expectedVersion`
  optimistic-concurrency check. **Decision: `expectedVersion` is checked first** (conventional
  optimistic-concurrency ordering). REQ-26 amended with an explicit ordering sentence;
  `state.spec.md`, `orchestrator.spec.md`, and `api.spec.md` now state the same order explicitly;
  new AC-56 covers the combined stale-`expectedVersion`-plus-empty-`fields` scenario.
- RT-017 — SPEC-016 v1.2.0's REQ-18 text narrowed its polymorphic-content-reference example to name
  `entry_terms` as its only concrete instance, leaving ambiguous whether `entries.type`'s soft
  reference (neither of REQ-18's two named flavors) is still covered. **Decision (SPEC-020-side
  only):** `feature.spec.md`'s `## Integration Contracts` citation now states explicitly that
  `entries.type` instantiates REQ-18's general opening rule directly, independent of either named
  example flavor. No behavioral obligation changed.
- RT-018 — this file's and `spec-manifest.md`'s `depends_on` field still pinned `SPEC-016 v1.1.0`
  even though SPEC-016 was bumped to v1.2.0 before this spec's own v1.2.0 revision was authored.
  Both now read `SPEC-016 v1.2.0` (`content_hash: sha256:a43a9b33d3b37ed1003ba8294cb01b96b8ec470642986d3fa10a407990050981`)
  — the version round 3's re-sync actually verified against. SPEC-016 is being independently bumped
  to v1.3.0 in a parallel dispatch; this pin deliberately does not guess at that future hash.

Zero new `[NEEDS CLARIFICATION]` markers were introduced. RT-015's REQ-30-vs-broadened-REQ-27/29
choice was a genuine Spec Agent judgment call (documented above and in `spec-manifest.md`'s
Validation Notes), not an open question — Red-Team's own suggested resolution named both options as
acceptable and the "add a new REQ" branch best preserves the existing REQ-27/REQ-29 citations
elsewhere in this package.

New `content_hash`: `sha256:e56cbf6ff00e3d75746fcf71b521f11a18d0f1fa4cb8a53eb3f786ec77a26dec`, computed
by the validator's `--update-hash` pass and propagated to every sibling file's own header (the
historical hash citations inside `spec-manifest.md`'s "Prior v1.2.0 Validation Notes" and "Prior
Revision Notes" sections, which deliberately reference superseded hashes, were left untouched).
Validator re-run confirmed idempotent (`--phase spec`, no further hash drift on a second run
without `--update-hash`).

**This spec is not yet cleared for Software Architect dispatch** — it awaits a fresh Red-Team pass

## Software Architect Dispatch

- software_architect_status: PRODUCED
- software_architect_dispatched_at: 2026-07-15T11:00:00Z
- software_architect_mode: Agent Direct Mode (same session as SPEC-016/017/018/019, Coordinator adopted
  the Software Architect persona directly rather than dispatching a subagent)
- adr_path: `ADS-memory/reports/pipeline/020-collections/adr.md` (ADR-PIPE-020)
- implementation_outline_status: PRODUCED — `ADS-memory/reports/pipeline/020-collections/implementation-outline.md`
- critical_internal_constraints_status: PRODUCED (4 designated units: U-001 fixed kind->CAST lookup
  table [DDL-injection prevention, highest security severity in the pipeline], U-002 fixed
  definition-time guard order, U-003 field-update index-provisioning composition, U-004
  expectedVersion-checked-first ordering) —
  `ADS-memory/reports/pipeline/020-collections/critical-internal-constraints.md`
- governance_promotion: PROMOTED — `ADS-memory/governance/adrs/GOV-ADR-003-ddl-generation-never-interpolates-operator-input.md`,
  `ADR-INDEX.md` updated
- architecture_sign_off_status: APPROVED — approved by Leona Burime, 2026-07-15, after the 2-round
  `/audit-work` external audit (see `ADS-memory/.local-artifacts/external-audit/runs/20260715T160000Z-external-audit-report.md`);
  this package carried both round-1 blockers (VERSION_CONFLICT, DDL field-name safety) and most of
  round 2's residual findings, all fixed and re-validated

Note above ("This spec is not yet cleared for Software Architect dispatch") is stale, superseded text
from an earlier revision entry preserved for history — the current `red_team_status` row
(`cleared_for_architect`, round 4, 0 BLOCKING) at the top of this file is the authoritative,
current status this Software Architect dispatch proceeded against.
(round 4) against this v1.3.0 revision before `/plan`.

## `/audit-work` Fix Revision (v1.3.0 → v1.4.0, 2026-07-15T16:00:00Z)

Three independent auditors (Fable/Claude same-family, Codex GPT-5.6-terra, Gemini 3.1 Pro via `agy`),
plus a mandatory internal verification pass, reviewed the full spec package and all 3 Software
Architect deliverables under `TM-ADR-PIPE-016-020`. Full report:
`ADS-memory/reports/external-audit/runs/20260715-spec-016-020-external-audit-report.md` (or
`.local-artifacts` path if not retained — see the report itself for its actual saved location).

Two validated blockers, both fixed this revision:
1. **Missing `VERSION_CONFLICT` error code** (Fable, independently verified by Coordinator) — REQ-26/AC-56
   and several sibling files described rejecting a stale `expectedVersion` with "a version-conflict
   error," but no such code existed in `errors.spec.md`. Fixed: code registered in `errors.spec.md`
   §2.1/§3, all prose references updated to the concrete code name.
2. **DDL field-name safety gap** (all 3 auditors independently converged; Codex and Gemini rated it a
   blocker outright, Fable rated it high) — `GOV-ADR-003`'s Rule demanded routing field *names*
   (an unbounded, operator-chosen set) through a "fixed, closed lookup table," which is structurally
   impossible; SPEC-020's own CIC U-001 designated only the `kind`→CAST mechanism, leaving field-name
   DDL-safety undesignated anywhere even though REQ-03's grammar gate already made the actual behavior
   safe. Fixed: GOV-ADR-003 rewritten as a two-track rule (closed lookup for `kind`; strict grammar gate
   + identifier-position-only usage for names); CIC U-001 gained a new Binding constraint (U-001-B2) and
   a Required Ordering Constraint (U-001-ORD1) explicitly tying REQ-03's grammar check to DDL safety.

`content_hash` recomputed (`sha256:5d6a931b381091ca04fddf55e9918227aed20fe895bb1f5a64cc50f33f44f4b6`)
and propagated to every sibling file; re-validated clean (`--phase preflight`, exit 0). Version bumped
`1.3.0` → `1.4.0`. See `SPEC-020-feature.spec.md`'s own Revision Note for the spec-level detail.

## TDD Dispatch

- tdd_status: PRODUCED
- tdd_dispatched_at: 2026-07-15T18:00:00Z
- tdd_mode: Agent Direct Mode (general-purpose agent adopting the TDD Agent persona per Coordinator dispatch)
- spec_hash_verified_at_tdd: 2026-07-15T18:00:00Z — `validate_spec_package.py --phase preflight` re-run against v1.4.0, exit 0, matches `spec_hash` above; confirmed this is the current version (post-`VERSION_CONFLICT`-registration audit fix), not a stale cached read, per the dispatch directive.
- tasks_md_path: `ADS-memory/reports/pipeline/020-collections/tasks.md`
- test_certification_path: `ADS-memory/reports/pipeline/020-collections/test-certification.md`
- test_file_count: 13 files, 76 runnable test cases (once implemented) — full inventory with sha256 in the certification record's Test File Inventory table
- cic_conformance: All 4 designated units (U-001, U-002, U-003, U-004) encoded through observable verification surfaces. U-001 (DDL-injection prevention — this entire 5-package pipeline's single highest-security-severity unit) received the most extensive adversarial/property-test treatment: `src/features/content-types/__tests__/unit/index-provisioning.ddl-safety.unit.test.ts` covers all 3 Binding constraints (B1 fixed kind→CAST table, B2 field-name grammar-gate + position restriction, B3 delimiter-injectivity) including the exact adversarial payloads named in the CIC text (`"text'); DROP TABLE entries;--"`, `name"; DROP TABLE entries;--`). U-003's exhaustive 4-combination-class property test (`index-provisioning.composition.unit.test.ts`) includes a full 5×5×2×2 (100-combination) exhaustive matrix proof that `resolveFieldIndexTransition` never throws and always resolves from post-call state.
- cic_escalations: none — no `[CIC_REQUESTED]` or `[CIC_PROPOSED]` raised. The Trigger Decision Matrix already evaluated every candidate unit and no undesignated load-bearing constraint was surfaced during test design.
- coverage_gaps: 7 gaps recorded in the certification's Known Gaps table (AC-15/16, AC-18, AC-25, AC-28, AC-37, AC-39/40, entries' own agent-tool catalog C-412), all Medium or Low risk, none blocking. None touch a CIC-designated unit — all 4 designated units are fully certified.
- recommended_next_routing: Programmer (per Coordinator scheduling) — implementation may proceed against the certified red-phase test suite. The 7 documented gaps are recommended for a TDD gap-fill pass either before or in parallel with Programmer work; none are High-risk or block dispatch.
