# Spec Manifest: categories-and-tags

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/spec-manifest.md -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-018 |
| feature_name | FEAT-018-categories-and-tags |
| version | 1.3.0 |
| last_edited | 2026-07-15T02:00:00Z |
| spec_naming | prefixed |
| spec_root | ADS-memory/specs/018-categories-and-tags/ |
| spec_entrypoint | SPEC-018-feature.spec.md |
| spec_readiness_artifact | SPEC-018-spec-dod.md |
| depends_on | SPEC-016 (content-admin-core-contract) v1.4.0, content_hash sha256:0dbe6f8750aed1ea94fe94d4cfde31345207c73591cd4bbe93d52f13f3422f60 (bumped during Coordinator Planning Preflight, 2026-07-15; see SPEC-018-feature.spec.md header for rationale) |

**Purpose:** This manifest is the package index for the strict Speckit compatibility flow. SPEC-018
is a dependent domain spec that cites SPEC-016's REQ/AC/INV ids by number from its own
`## Integration Contracts` section (in `SPEC-018-feature.spec.md`) instead of restating SPEC-016's
watermark/gateway/actor-identity/soft-reference contract.

---

## Package Applicability Matrix

| Logical File | Status (`PRESENT|OMITTED`) | Actual Filename | Why Present / Why Omitted |
|---|---|---|---|
| `feature.spec.md` | PRESENT | `SPEC-018-feature.spec.md` | Canonical primary requirements spec for Categories & Tags |
| `api.spec.md` | PRESENT | `SPEC-018-api.spec.md` | Real callable surface: human admin CRUD routes under `/api/admin/v1/taxonomy` and an agent-tool catalog, including `mergeTerm`'s instantiation of SPEC-016's gated-mutation gateway |
| `state.spec.md` | PRESENT | `SPEC-018-state.spec.md` | This domain owns durable state directly: `taxonomies`, `terms`, `entry_terms`, `taxonomy_revisions`, and the merge-ceremony's confirmation-token state |
| `orchestrator.spec.md` | PRESENT | `SPEC-018-orchestrator.spec.md` | `TaxonomyWriteService` is a real write-chokepoint orchestrator with a fixed validation-check ordering (behavior.spec.md §2.1) and a `mergeTerm` gateway instantiation |
| `ui.spec.md` | PRESENT | `SPEC-018-ui.spec.md` | ADR-044's Wiring section names a real screen, `apps/admin/src/sections/Taxonomy.tsx`, plus an embedded term-assignment picker in the post/page editor |
| `errors.spec.md` | PRESENT | `SPEC-018-errors.spec.md` | This domain defines its own error codes (`TAXONOMY_NOT_HIERARCHICAL`, `PARENT_CROSS_TAXONOMY`, `HIERARCHY_CYCLE_DETECTED`, `WORKSPACE_MISMATCH`, `CONTENT_TYPE_MISMATCH`, `TAXONOMY_NOT_APPLICABLE`, plus not-found codes) alongside reusing SPEC-016's gateway codes for the merge ceremony |
| `behavior.spec.md` | PRESENT | `SPEC-018-behavior.spec.md` | Real precedence (allow-list before workspace/lens checks), ordering (the fixed validation chain; the non-negotiable merge step order), default (seeded category/tag), and dedup (entry_terms_unique) rules exist and are load-bearing |
| `traceability.spec.md` | PRESENT | `SPEC-018-traceability.spec.md` | Seeds REQ/AC/INV/EC/error-code/behavior-rule coverage mapping before TDD |
| `spec-manifest.md` | PRESENT | `SPEC-018-spec-manifest.md` | Required package index for downstream stages |
| `spec-dod.md` | PRESENT | `SPEC-018-spec-dod.md` | Readiness gate and quality proof |

---

## Stage Read Set

| Stage | Must Read |
|---|---|
| `architect` | `SPEC-018-feature.spec.md`, `SPEC-018-api.spec.md`, `SPEC-018-state.spec.md`, `SPEC-018-orchestrator.spec.md`, `SPEC-018-ui.spec.md`, `SPEC-018-errors.spec.md`, `SPEC-018-behavior.spec.md`, `SPEC-018-traceability.spec.md`, `SPEC-018-spec-dod.md`, plus `SPEC-016-feature.spec.md` and every `SPEC-016-*.spec.md` file cited in this spec's Integration Contracts section |
| `tdd` | `SPEC-018-feature.spec.md`, `SPEC-018-traceability.spec.md`, `SPEC-018-spec-dod.md`, plus `SPEC-016-feature.spec.md`/`SPEC-016-errors.spec.md`/`SPEC-016-state.spec.md` for the reused gateway/watermark test fixtures |
| `programmer` | `SPEC-018-feature.spec.md`, `SPEC-018-traceability.spec.md`, all `PRESENT` contract files listed above, plus SPEC-016's `PRESENT` contract files for the mechanisms this spec cites rather than reimplements |

---

## Brownfield / Reverse-Spec References

This feature is `brownfield` — it extends a running application (per the Coordinator's directive)
even though no prior code implements this exact contract yet; ADR-044 was written directly against
the live `src/infra/db/schema.ts` and `src/features/post/post.ts`.

| Evidence / Touchpoint | Type | Why It Matters |
|---|---|---|
| `ADS-project-knowledge/reports/architecture/ADR-044-categories-and-tags.md` | source touchpoint | Origin of every requirement in this spec: the shared taxonomy mechanism, the soft polymorphic `entry_terms` reference, the allow-list, the merge/rename/reparent semantics, and the concrete sample schema |
| `ADS-memory/specs/016-content-admin-core-contract/SPEC-016-feature.spec.md` | dependency spec | Owns the watermark, gateway, actor-identity, and general soft-reference contract this spec cites by REQ/AC id in its Integration Contracts section |
| `ADS-project-knowledge/reports/architecture/ADR-043-collections.md` §4 | source touchpoint | Origin of the `content_types.key` reserved-key guarantee this spec's polymorphic join depends on for injectivity |
| `ADS-project-knowledge/reports/architecture/ADR-021-identity-and-authorization.md` | source touchpoint | Origin of `authorize()`, the flat-string permission convention (`admin.taxonomy.*`), and principal-kind rules cited here by reference, per this project's Brownfield Rule 3 |
| `ADS-project-knowledge/reports/architecture/ADR-022-content-model-entries-registry-expression-indexes.md` §4a | source touchpoint | Origin of the append-only per-entry revisioning rule this spec's `entry_terms` exemption (REQ-13) explicitly narrows |
| `src/features/post/post.ts` | codebase touchpoint | Confirms `posts.kind` is fixed at creation with no post↔page conversion path (`UpdatePostInput` has no `kind` field) — grounds this spec's Out-of-Scope statement and the lens-validation check (REQ-08) |
| `src/features/post/` (no `deletePost`/`removePost` function found) | codebase touchpoint | Confirms `post`/`page` currently has no delete path — grounds this spec's note that REQ-18's cleanup-event obligation is a standing requirement for a not-yet-reachable code path, not an assumption of existing behavior |
| No `ANALYSIS-*` / `MIGRATION-*` / `TESTABILITY-*` reports exist in `ADS-memory/reports/codebase-analysis/` | codebase-analysis | Directory was confirmed absent before this run; this spec proceeds directly from the Accepted ADR-044's own direct-codebase verification instead |

---

## Validation Notes

- Validator last run: 2026-07-15T02:05:00Z
- Validator result: PASS (`--phase spec --update-hash` run twice — once after the RT-014/RT-015/
  RT-017 content edits and version bump, then again after adding the "Revision Note (v1.3.0)"
  section to `feature.spec.md`, which itself changed the canonical hash — then re-verified clean
  with `--phase spec` and no `--update-hash`, exit 0)
- Validator manual waiver: N/A — `python3` is available and used directly
- Canonical hash verified at: 2026-07-15T02:05:00Z — `sha256:03ad39e3a209e0edc282424ec8c37023760f16abe71008ff8bdb5d8284ba9f81`
- Sibling hash propagation: mechanically grepped across all 7 non-`feature.spec.md` files with
  their own "Content Hash"/`content_hash` header field (`api.spec.md`, `state.spec.md`,
  `orchestrator.spec.md`, `ui.spec.md`, `errors.spec.md`, `behavior.spec.md`,
  `traceability.spec.md`) — all 7 confirmed to carry the current canonical hash
  `sha256:03ad39e3a209e0edc282424ec8c37023760f16abe71008ff8bdb5d8284ba9f81` (RT-016 fix; this step
  was dropped during the 1.1.0→1.2.0 bump and is now done and verified).
- Notes: This is the v1.3.0 revision of SPEC-018, resolving Red-Team Round 3 finding RT-014
  (BLOCKING) and RT-015/RT-016/RT-017 (ADVISORY)
  (`ADS-memory/reports/pipeline/018-categories-and-tags/red-team-findings-round3.md`, prior spec
  hash `sha256:5191fc93e7714f827be3d2febe5033ddaaa42e910ed803038c47797829ae4ae3`). See
  `feature.spec.md`'s "Revision Note (v1.3.0)" section for the full list of changes. Zero
  `[NEEDS CLARIFICATION]` markers were introduced by this revision. Of the three Open Questions
  carried forward from v1.0.0, OQ-03 is Resolved (Red-Team RT-004); OQ-01 and OQ-02 remain open
  with their original owner and resolution milestone.
