# Spec Manifest: collections

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/spec-manifest.md -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-020 |
| feature_name | FEAT-020-collections |
| version | 1.4.0 |
| last_edited | 2026-07-15T03:30:00Z |
| spec_naming | prefixed |
| spec_root | ADS-memory/specs/020-collections/ |
| spec_entrypoint | SPEC-020-feature.spec.md |
| spec_readiness_artifact | SPEC-020-spec-dod.md |

**Purpose:** This manifest is the package index for the strict Speckit compatibility flow. SPEC-020
is the Collections domain spec — the first of the four dependent domain specs (SPEC-017 through
SPEC-019) dispatched against SPEC-016's shared core contract (`content-admin-core-contract`).
`depends_on: SPEC-016 v1.4.0` (`content_hash: sha256:c678a2a9bae047245654e4998089e4905fe52aaa6e80389ec7dadb122028efff`)
— bumped during Coordinator Planning Preflight (2026-07-15); v1.2.0 was the version this round's
`## Integration Contracts` re-sync in `SPEC-020-feature.spec.md` was actually verified against (see
Validation Notes below), and v1.2.0→v1.4.0 only touched REQ-01/EC-01/the Dependencies table/
`state.spec.md`'s `watermark.value` row — none of which this package cites — so no citation
re-verification was reopened. This `depends_on` pin previously intentionally
cites the v1.2.0 text this round verified, not SPEC-016's in-flight v1.3.0 hash.

---

## Package Applicability Matrix

| Logical File | Status (`PRESENT|OMITTED`) | Actual Filename | Why Present / Why Omitted |
|---|---|---|---|
| `feature.spec.md` | PRESENT | `SPEC-020-feature.spec.md` | Canonical primary requirements spec for Collections |
| `api.spec.md` | PRESENT | `SPEC-020-api.spec.md` | Collections exposes a real callable surface: content-type/entry CRUD routes, a field-bag validate-only route, and the cleanup gateway routes instantiating SPEC-016's generic gateway shape |
| `state.spec.md` | PRESENT | `SPEC-020-state.spec.md` | Collections owns durable state directly: the `content_types`/`content_type_revisions` registry and the `entries`/`entry_revisions` table |
| `orchestrator.spec.md` | PRESENT | `SPEC-020-orchestrator.spec.md` | Two ordinary write chokepoints (`ContentTypeWriteService`, `EntryWriteService`) plus one instantiation of SPEC-016's gated-mutation gateway are real orchestration contracts |
| `ui.spec.md` | PRESENT | `SPEC-020-ui.spec.md` | Collections has its own admin screen (`apps/admin/src/sections/Collections.tsx`, per ADR-043 §4/§5) with real component/event/rendering contracts |
| `errors.spec.md` | PRESENT | `SPEC-020-errors.spec.md` | Collections defines its own error codes (`RESERVED_CONTENT_TYPE_KEY`, `INVALID_FIELD_KIND`, `CLEANUP_NOT_ELIGIBLE`, etc.) in addition to reusing SPEC-016's gateway codes |
| `behavior.spec.md` | PRESENT | `SPEC-020-behavior.spec.md` | Real ordering (fixed definition-time guard order, lifecycle transition ordering), default (queryable cap, retention window), limit, and deduplication rules exist and are load-bearing |
| `traceability.spec.md` | PRESENT | `SPEC-020-traceability.spec.md` | Seeds REQ/AC/INV/EC/error-code/behavior-rule coverage mapping before TDD |
| `spec-manifest.md` | PRESENT | `SPEC-020-spec-manifest.md` | Required package index for downstream stages |
| `spec-dod.md` | PRESENT | `SPEC-020-spec-dod.md` | Readiness gate and quality proof |

---

## Stage Read Set

| Stage | Must Read |
|---|---|
| `architect` | `SPEC-020-feature.spec.md`, `SPEC-020-api.spec.md`, `SPEC-020-state.spec.md`, `SPEC-020-orchestrator.spec.md`, `SPEC-020-ui.spec.md`, `SPEC-020-errors.spec.md`, `SPEC-020-behavior.spec.md`, `SPEC-020-traceability.spec.md`, `SPEC-020-spec-dod.md`, plus SPEC-016's full package (this spec `depends_on: SPEC-016` and cites its REQ/AC/INV ids throughout, particularly in `feature.spec.md`'s `## Integration Contracts` section) |
| `tdd` | `SPEC-020-feature.spec.md`, `SPEC-020-traceability.spec.md`, `SPEC-020-spec-dod.md`, plus ADR-043 and SPEC-016's `feature.spec.md`/`errors.spec.md`/`orchestrator.spec.md` for the cited gateway/watermark behavior |
| `programmer` | `SPEC-020-feature.spec.md`, `SPEC-020-traceability.spec.md`, all `PRESENT` contract files listed above, ADR-043, SPEC-016's package for the instantiated gateway, and certified tests |

---

## Brownfield / Reverse-Spec References

This feature is `brownfield` — it extends a running application. ADR-043 was written directly
against the live `src/infra/db/schema.ts` and its surrounding write paths; no `entries`/
`content_types` implementation exists yet in this repo.

| Evidence / Touchpoint | Type | Why It Matters |
|---|---|---|
| `ADS-memory/reports/architecture/ADR-043-collections.md` | source touchpoint | The primary design source for this entire spec: registry shape, reserved-key/grammar/kind validation, index provisioning, the disable→tombstone→cleanup lifecycle, and the sample schema (§5) |
| `ADS-memory/reports/architecture/ADR-022-content-model-entries-registry-expression-indexes.md` | source touchpoint | Origin of the append-only-revision/write-chokepoint discipline and the strict-on-write/tolerant-on-read field validation rule this spec's REQ-14/REQ-15 implement |
| `ADS-memory/reports/architecture/ADR-024-expression-totality.md` | source touchpoint | Bounds the field-validation predicate language this spec's operator-authored validation rules ride (cited by reference, not restated) |
| `ADS-memory/reports/architecture/ADR-041-storage-timeline.md` §4 | source touchpoint | Origin of the `index.provision`/`index.drop` ledger carve-out this spec's REQ-06/REQ-11 rely on downstream (owned by SPEC-017) |
| `ADS-memory/reports/architecture/ADR-023-plugin-data-modules.md` | source touchpoint | The explicitly rejected storage alternative (Directus-style per-Collection physical tables) named in this spec's Scope/Out-of-scope section |
| `ADS-memory/specs/016-content-admin-core-contract/SPEC-016-feature.spec.md` | source touchpoint | The shared core contract this spec depends on and cites by REQ/AC/INV id throughout `## Integration Contracts` — watermark stamping, the gated-mutation gateway, composite actor identity, and soft cross-boundary reference validation |
| `src/features/post/post.ts`, `src/features/settings/write-service.ts`, `src/features/settings/purge-service.ts` | source touchpoint | Existing write-chokepoint and deprecate/tombstone lifecycle precedents this spec's Agent Directives require the implementation to follow, cited by name per this project's Brownfield/Legacy Code Rule 3, not restated |
| No `ANALYSIS-*` / `MIGRATION-*` / `TESTABILITY-*` reports exist in `ADS-memory/reports/codebase-analysis/` | codebase-analysis | Directory was confirmed absent before this run; no CodeBase Analyzer output exists yet for the content-registry surface — this spec proceeds directly from the Accepted ADR's own direct-codebase verification instead |

---

## Validation Notes

- Validator last run: 2026-07-15T03:30:00Z (`--phase spec --update-hash`, then re-verified clean
  with `--phase spec` and no `--update-hash`)
- Validator result: PASS
- Validator manual waiver: N/A — `python3` was available and used directly
- Canonical hash verified at: 2026-07-15T03:30:00Z — see `SPEC-020-feature.spec.md` header for the
  current `content_hash` (recomputed by this v1.3.0 revision; supersedes v1.2.0's
  `sha256:eba25e6e95a82b7c4fe847d16f414f265d768c958d0757088b24d2a0865c9efe`)
- Notes: v1.3.0 revision. Fixes the 1 BLOCKING (RT-015) and folds in the 3 ADVISORY findings
  (RT-016, RT-017, RT-018) from
  `ADS-memory/reports/pipeline/020-collections/red-team-findings-round3.md` (spec hash
  `sha256:eba25e6e95a82b7c4fe847d16f414f265d768c958d0757088b24d2a0865c9efe`, Red-Team round 3
  completed 2026-07-15T02:00:00Z):
  - RT-015 (BLOCKING): REQ-27 and REQ-29 are each written as mutually exclusive cases, leaving two
    reachable scenarios ungoverned by any REQ/AC — a brand-new field added via
    `UPDATE_CONTENT_TYPE_FIELDS` with `queryable=true` from the start, and a single field whose
    `kind` and `queryable` both change in the same call. **Decision: add new REQ-30** (rather than
    broaden REQ-27/REQ-29's own text) stating both residual obligations explicitly, so REQ-27's and
    REQ-29's existing wording — and every AC/EC that already cites them for their own narrower
    cases — is left undisturbed. New AC-54 (brand-new queryable field via update) and AC-55
    (combined `kind`+`queryable` change) anchor REQ-30 to testable criteria; new EC-18/EC-19 mirror
    them. `state.spec.md`'s `UPDATE_CONTENT_TYPE_FIELDS` row, which previously misattributed the
    "newly added" case's coverage to REQ-29, now cites REQ-30 for that case; `orchestrator.spec.md`
    and `api.spec.md` updated to match. INV-09/INV-10 amended to also cite REQ-30.
  - RT-016 (ADVISORY): `state.spec.md`'s Precondition cell listed `expectedVersion` before the
    fields_empty rejection but the fields_empty clause's "before any other precondition below"
    qualifier was ambiguous about whether it also ran before `expectedVersion`; `orchestrator.spec.md`'s
    Lifecycle Hooks table separately described fields_empty as checked "first" with no mention of
    `expectedVersion` at all. **Decision: `expectedVersion` is checked first** (the conventional
    optimistic-concurrency ordering — cheapest, most fundamental precondition first). REQ-26
    amended with an explicit ordering sentence; `state.spec.md`, `orchestrator.spec.md`, and
    `api.spec.md` all now state the same order explicitly; new AC-56 covers the combined
    stale-`expectedVersion`-plus-empty-`fields` scenario.
  - RT-017 (ADVISORY): SPEC-016 REQ-18's v1.2.0 text narrowed its polymorphic-content-reference
    example to name `entry_terms` as its only concrete instance, leaving ambiguous whether
    `entries.type`'s soft reference to `content_types.key` (neither of REQ-18's two named flavors)
    is still covered. **Decision (SPEC-020-side only, per the finding's own suggested
    resolution):** `feature.spec.md`'s `## Integration Contracts` citation now states explicitly
    that `entries.type` instantiates REQ-18's general opening rule directly, independent of either
    named example flavor. No behavioral obligation changed — REQ-19/AC-29/AC-30 are unaffected.
  - RT-018 (ADVISORY): `spec-manifest.md`'s header/Purpose text and `pipeline-state.md`'s
    `depends_on` field still declared "SPEC-016 v1.1.0" and its superseded hash, even though
    SPEC-020's own v1.2.0 revision was authored after SPEC-016 had already moved to v1.2.0. Both
    now read "SPEC-016 v1.2.0" (`content_hash: sha256:c678a2a9bae047245654e4998089e4905fe52aaa6e80389ec7dadb122028efff`)
    — the version this round's re-sync actually verified against. SPEC-016 is being independently
    bumped to v1.3.0 in a parallel dispatch; this pin deliberately does not guess at that future
    hash.
  - Zero new `[NEEDS CLARIFICATION]` markers were introduced. RT-015's REQ-30-vs-broadened-REQ-27/29
    choice was a genuine Spec Agent judgment call (documented above), not an open question — the
    Red-Team finding's own suggested resolution named both options as acceptable and the "add a new
    REQ" branch best preserves the existing REQ-27/REQ-29 citations elsewhere in this package.

## Prior v1.2.0 Validation Notes

- Validator last run: 2026-07-15T00:30:00Z (`--phase spec --update-hash`, then re-verified clean
  with `--phase spec` and no `--update-hash`)
- Validator result: PASS
- Validator manual waiver: N/A — `python3` was available and used directly
- Canonical hash verified at: 2026-07-15T00:30:00Z — see `SPEC-020-feature.spec.md` header for the
  current `content_hash` (recomputed by this v1.2.0 revision; supersedes v1.1.0's
  `sha256:26782f655075384c4f743e04d9fe6224e3eb121bafd7fba49e69ed26776f40d8`)
- Notes: v1.2.0 revision. Fixes the 1 BLOCKING and folds in the 2 ADVISORY findings from
  `ADS-memory/reports/pipeline/020-collections/red-team-findings-round2.md` (spec hash
  `sha256:26782f655075384c4f743e04d9fe6224e3eb121bafd7fba49e69ed26776f40d8`, Red-Team round 2
  completed 2026-07-14T23:45:00Z):
  - RT-012 (BLOCKING): `CONTENT_TYPE_UPDATE_FIELDS`'s `fields` array had no stated floor — a
    present-but-empty `fields: []` could, per REQ-26's literal text, silently reduce a content type
    to zero fields. **Decision: reject it**, symmetric with `CONTENT_TYPE_CREATE`'s
    `fields.minItems: 1` — this is the option Red-Team itself recommended, and it is the reading
    most consistent with REQ-26's original intent (full-replacement governs *which* fields exist,
    never whether the content type may be left fieldless) and with this spec's disable→tombstone→
    cleanup lifecycle, which treats every destructive/degenerate state as something that must be
    reached deliberately through its own explicit step, never as an incidental side effect of an
    ordinary field-update call. `api.spec.md` §4 now carries `minItems: 1` on
    `CONTENT_TYPE_UPDATE_FIELDS`'s `fields`; REQ-26 states the floor and its rejection explicitly;
    new AC-51 and EC-16 cover the rejection case; `errors.spec.md` documents the new
    `VALIDATION_ERROR` / `details.reason='fields_empty'` shape and its ownership row;
    `state.spec.md`/`orchestrator.spec.md` preconditions and failure-code lists were updated to
    match.
  - RT-013 (ADVISORY): the pre-existing "ordinary `queryable` flag flip on update triggers index
    provisioning/teardown" behavior had no REQ/INV anchor, unlike the newer kind-change case
    (REQ-27/INV-09). New REQ-29 and INV-10 give it the same treatment; new AC-52/AC-53 and EC-17
    anchor it to testable criteria; `state.spec.md`/`orchestrator.spec.md` now cite REQ-29
    explicitly where they previously described the behavior with no REQ number attached.
  - RT-014 (ADVISORY): `spec-dod.md` item B-02's Notes cell said `"1.0.0"` against the file's own
    `1.1.0` (now `1.2.0`) header. Corrected to match.
  - Zero new `[NEEDS CLARIFICATION]` markers were introduced. RT-012 required a genuine Spec Agent
    judgment call between two textually-permitted readings, documented above and in REQ-26's own
    text, rather than an open question — Red-Team's own suggested resolution named the
    recommended answer.

## Prior Revision Notes (v1.0.0 → v1.1.0)

- Notes: v1.1.0 revision. Fixes all 5 BLOCKING and folds in all 5 ADVISORY findings from
  `ADS-memory/reports/pipeline/020-collections/red-team-findings.md` (spec hash
  `sha256:e206a5c22ae6fb7c66d7b397eb69698ee5f22e1c30d09333642af5ae646af882`, Red-Team completed
  2026-07-14T22:15:00Z):
  - RT-001 (BLOCKING): `CONTENT_TYPE_UPDATE_FIELDS.fields` is now explicitly full-replace, not
    merge-by-name (new REQ-26, AC-41/AC-42; `state.spec.md`/`orchestrator.spec.md`/`api.spec.md`
    updated to match).
  - RT-002 (BLOCKING): `UPDATE_ENTRY`/`PUBLISH_ENTRY`/`UNPUBLISH_ENTRY` behavior against a
    non-`active` content type is now explicit — blocked only for `tombstone`, permitted for
    `deprecated` (new REQ-28, AC-44/AC-45/AC-46; failure-code lists and error mapping updated).
  - RT-003 (BLOCKING): a `kind` change on a field that stays `queryable` now forces index
    teardown+re-provisioning (new REQ-27, AC-43, new INV-09).
  - RT-004 (BLOCKING): `ContentTypeRevision`/`EntryRevision` in `state.spec.md` now carry
    `delegatedByWorkspaceId`/`delegatedById` per SPEC-016 REQ-16's `ActorIdentityRef` shape (REQ-08/
    REQ-16 amended, new AC-47/AC-48).
  - RT-005 (BLOCKING): REQ-14 now explicitly covers field-value `kind`-conformance (new AC-49),
    removing the previously-unanchored claim in `behavior.spec.md` §7.
  - RT-006/RT-007/RT-008/RT-010 (ADVISORY): User Journey step 2 ordering corrected to match REQ-24;
    AC-38 rewritten for grammar; `fieldsJson`'s `{ext.site}` envelope formalized as a typed
    `FieldsJsonEnvelope` with an explicit malformed-payload AC-50; the Integration Contracts
    "Composite actor identity" bullet now states `content_type_revisions`/`entry_revisions` share
    `content.db` with `principals`, so REQ-17's physical-boundary clause doesn't itself apply here.
  - RT-009 (ADVISORY): OQ-04 updated from "still open, tracked against SPEC-017" to reflect that
    SPEC-016's own OQ-04 is now marked Resolved (2026-07-14, Coordinator fold-back from SPEC-017);
    Collections inherits that resolution directly with no remaining owner/resolve-by action.
  - RT-011 (CONSTITUTION_FLAG): left as-is in `feature.spec.md`'s Constitution Compliance table —
    already phrased as a forward-looking Architect note for the ADR Complexity Justification; no
    spec-level change was requested or needed.
  - Every `## Integration Contracts` citation was individually re-checked against the current
    SPEC-016 v1.1.0 text (600-second exact TTL, REQ-13's `FORBIDDEN` actor-class-redemption
    coverage, AC-33's `costClass: 'expensive'`, and the `ActorIdentityRef`/`APPEND_ACTOR_REFERENCE`
    shape) — no other citation was found stale besides the RT-004 gap and RT-009 OQ-04 staleness
    already listed above.
  - Zero new `[NEEDS CLARIFICATION]` markers were introduced. RT-001 and RT-005 required a genuine
    Spec Agent judgment call (documented in each REQ's own text and in the pipeline-state.md
    revision note) rather than an open question, since Red-Team's own suggested resolutions named
    the almost-certainly-correct answer in both cases.
