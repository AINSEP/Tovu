# Spec Manifest: Menus (Navigation)

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/spec-manifest.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-012 |
| feature_name | FEAT-012-menus |
| version | 1.0.0 |
| last_edited | 2026-07-13T00:00:00Z |
| spec_naming | standard |
| spec_root | ADS-memory/specs/012-menus |
| spec_entrypoint | feature.spec.md |
| spec_readiness_artifact | spec-dod.md |

**Purpose:** This manifest is the package index for the strict Speckit compatibility flow. It
exists to make downstream stages read the full package instead of guessing filenames from
memory, and — for this **as-built backfill** — to name every point where the shipped code
diverges from the governing ADR-029, so no downstream agent silently "corrects" the spec back
to the ADR's original design intent.

---

## Package Applicability Matrix

| Logical File | Status (`PRESENT|OMITTED`) | Actual Filename | Why Present / Why Omitted |
|---|---|---|---|
| `feature.spec.md` | PRESENT | `feature.spec.md` | Canonical primary requirements spec |
| `api.spec.md` | PRESENT | `api.spec.md` | Real HTTP API surface exists (6 routes under `/api/admin/v1/workspaces/:workspaceId/menus`) |
| `state.spec.md` | PRESENT | `state.spec.md` | Real durable entity lifecycle (`MenuStatus` transitions, OCC `version`) and a derived binding index exist and are non-trivial enough to warrant a dedicated contract; also documents the (thin) real frontend local state, since no store/Redux layer exists to document separately |
| `orchestrator.spec.md` | OMITTED | `—` | No coordinator/orchestration layer distinct from the direct route→service function calls exists. `menu-service.ts`'s functions ARE the business-logic layer, called directly from route handlers with no intermediate async job/orchestrator abstraction (mirrors SPEC-009 Redirects' identical reasoning for the same absence). |
| `ui.spec.md` | PRESENT | `ui.spec.md` | Real admin UI exists (`Menus.tsx`, `MenuEditor.tsx`) |
| `errors.spec.md` | PRESENT | `errors.spec.md` | Real typed error classes (`MenuValidationError`, `MenuConflictError`, `MenuNotFoundError`, `MenuLocationBoundError`) map to real HTTP statuses at each route |
| `behavior.spec.md` | PRESENT | `behavior.spec.md` | Real precedence (last-writer-wins location reassignment), ordering (item-tree array order, validation-walk order, resolution order), non-obvious defaults (depth/count bounds), deduplication (slug uniqueness), and tie-break (OCC race) rules exist and materially affect behavior |
| `traceability.spec.md` | PRESENT | `traceability.spec.md` | Seeds REQ/AC/INV/EC/error-code/behavior-rule coverage mapping — filled from real code+tests, not left pending, since this is a backfill |
| `spec-manifest.md` | PRESENT | `spec-manifest.md` | Required package index for downstream stages |
| `spec-dod.md` | PRESENT | `spec-dod.md` | Readiness gate and quality proof |

---

## Stage Read Set

| Stage | Must Read |
|---|---|
| `architect` | `feature.spec.md`, `api.spec.md`, `state.spec.md`, `ui.spec.md`, `errors.spec.md`, `behavior.spec.md`, `traceability.spec.md`, `spec-dod.md`, plus ADR-029 itself and this manifest's Deviation Log below |
| `tdd` | `feature.spec.md`, `traceability.spec.md`, `spec-dod.md`, ADR-029, and the Coverage Gaps in `traceability.spec.md` Section 6 (these are the concrete backlog of tests to add, not a green field) |
| `programmer` | `feature.spec.md`, `traceability.spec.md`, all `PRESENT` contract files, ADR-029, and the certified tests already in `src/navigation/__tests__/` + `src/server/__tests__/admin-menus-routes.test.ts` (treat these as ground truth per the task's own instruction — do not "fix" passing tests to match a re-read of the ADR) |

---

## Brownfield / Reverse-Spec References

This feature extends an existing, already-shipped system. Per the task's own scoping
instruction, this is a **lightweight as-built backfill**, not the full 5-pass reverse-spec
extraction pipeline — so there is no `merged-requirements.md`/`review-digest.md`/
`extraction-manifest.md`/`coverage-map.md`/`consumer-inventory.md`/`intentional-changes.md` set.
The evidence below is the direct source-code/ADR grounding used instead.

| Evidence / Touchpoint | Type | Why It Matters |
|---|---|---|
| `ADS-memory/reports/architecture/ADR-029-menus-navigation.md` | source touchpoint (governing ADR, ACCEPTED 2026-07-10) | The design decision this spec documents the shipped implementation of |
| `src/navigation/{types,contracts,ports,index,menu-service,repo.memory,resolver}.ts` | source touchpoint | The complete real implementation this spec's REQ/AC/INV/EC/behavior rows are sourced from |
| `src/navigation/INFO.md` | source touchpoint | The implementation's own "Known simplifications" section — independently corroborates several Deviations below (e.g. termRef, id-stability, label fallback, no real transaction) |
| `src/navigation/__tests__/menu-service.test.ts`, `src/navigation/__tests__/resolver.test.ts` | testability | Passing unit tests treated as ground truth for behavior per this task's instruction |
| `src/server/routes/admin/menus/{create,update-tree,assign-location,delete,get-by-id,list}.ts` | source touchpoint | The real HTTP surface — endpoints, auth check placement, error-to-status mapping |
| `src/server/http/admin/menus.ts` | source touchpoint | Response DTO shapes (`AdminMenuDto` et al.) and `MenuRouteDeps` |
| `src/server/__tests__/admin-menus-routes.test.ts` | testability | Route-level integration tests treated as ground truth, including the explicit `navigation.manage`-gates-everything test |
| `apps/admin/src/sections/Menus.tsx`, `apps/admin/src/sections/MenuEditor.tsx` | source touchpoint | The real admin UI this spec's `ui.spec.md` documents |
| `src/identity/permissions.ts` (lines 149-153) | source touchpoint | The actual registered permission string (`navigation.manage`) — see Deviation D-1/D-2 below |
| `ADS-memory/reports/architecture/sweep-crosscutting-decisions-20260710.md` (§E, "Permission-namespace convention") | source touchpoint | The later-frozen `admin.{section}.{action}` convention that `navigation.manage` predates/violates — see Deviation D-2 |
| `ADS-memory/reports/pipeline/009-redirects/pipeline-state.md` | source touchpoint | An independent, prior agent's note (written for SPEC-009 Redirects) already flagging this exact same Menus permission-naming deviation — corroborates D-2 was not invented for this spec |

---

## Deviation Log (Code vs. ADR-029) — the required disclosure for this backfill

Per the dispatch instruction, every place the running code does less than ADR-029 describes,
or does something ADR-029 didn't decide, is recorded here explicitly rather than resolved
silently in either direction.

| ID | ADR-029 Says | Code Actually Does | Where |
|----|--------------|---------------------|-------|
| D-1 | §8 defines a 7-entry permission catalog: `navigation.read/create/update/delete/delete.force/assign/manage`, with `assign` and `delete.force` deliberately split out as "higher-trust than editing a label" | Only **one** permission is registered and used: `navigation.manage`, gating all six routes (list/get/create/update/assign/delete) uniformly, including force-purge | `src/identity/permissions.ts:149-153`; every file in `src/server/routes/admin/menus/` |
| D-2 | (Not an ADR-029 decision — a later, same-day cross-cutting ruling) `sweep-crosscutting-decisions-20260710.md` §E froze `admin.{section}.{action}` as the convention for admin-panel permissions, explicitly because renaming a stored grant string later is a breaking migration | `navigation.manage` does not follow that convention (would be `admin.menus.manage`) | `src/identity/permissions.ts:136-148`'s own doc comment discusses this exact tension and elects the flat `domain.verb` shape instead, citing that the `admin.{section}.{action}` convention "has no implementation behind it anywhere in this codebase" at the time Menus shipped |
| D-3 | §6 says every menu mutation runs through "the ADR-008 command gateway / ADR-022 single write chokepoint... No side-door SQL" | No command gateway exists as running code; every route calls `menu-service.ts` functions directly. `update-tree.ts`'s doc comment explains why: only `post/update` is registered in the gateway's revert registry today, so routing menu writes through it would record change sets nothing can revert | `src/server/routes/admin/menus/update-tree.ts:11-20` |
| D-4 | §3 claims `entryRef`/`termRef` targets are both "integrity-tracked" via `entry_refs` extraction at the write chokepoint | No `entry_refs` (or any ref-tracking index) write exists anywhere in `menu-service.ts`. `termRef` in particular has no compatible schema at all — already named a Wave-1 blocker in ADR-029's own Round-3 audit fold, not a fresh finding here | `src/navigation/resolver.ts:19-27` file header; `src/navigation/INFO.md` "Known simplifications" |
| D-5 | §2 states "A menu is a seeded `menu` content-type entry" — i.e., menus should ride the ADR-022 generic entries repo, with no separate persistence port | The shipped code stores menus in a **self-contained, in-memory-only** `InMemoryMenuRepo` behind a locally-declared `MenuRepoPort` — not entries-backed, and not persisted beyond process lifetime (no SQLite adapter for either `MenuRepoPort` or `NavLocationBindingRepoPort`) | `src/navigation/repo.memory.ts:1-31` file header |
| D-6 | §4 requires the binding-index write and the displaced-menu revision write to be "in the same transaction" | `assignLocation` performs these writes sequentially with **no rollback** if a later step throws — documented as accepted tech debt pending real transaction support | `src/navigation/menu-service.ts:338-366` doc comment |
| D-7 | §6 requires "id-stability" — "an update may not renumber surviving items" | Only within-submission uniqueness is enforced (`validateAndCloneTree`); there is no diff against the previous tree to catch a surviving node losing its original id across an edit | `src/navigation/menu-service.ts:259-274` doc comment |
| D-8 | (Implied by §4's "derived + rebuildable" framing) The binding index should be rebuildable from menu entries at any time | `NavLocationBindingRepoPort.rebuildForWorkspace` exists on the interface and has a working in-memory implementation, but **no caller anywhere** in the route or service code ever invokes it | `src/navigation/ports.ts:84-91`; `src/navigation/repo.memory.ts:199-205` |
| D-9 | (Not an explicit ADR-029 clause, but implied by "menus are entries with a read model") A `listMenus` read should go through the navigation library's service/read-model layer | `list.ts` calls `MenuRepoPort.list` directly — there is no `menu-service.ts` wrapper for listing; the route bypasses the feature's own service layer for this one read | `src/server/routes/admin/menus/list.ts:6-11` doc comment |
| D-10 | `types.ts` declares `MenuStatus = "draft" \| "published" \| "trash"` (implying a publish flow is part of the type contract) | No code path anywhere (service or route) ever sets `status: "published"` — it is a declared-but-unreachable value in the shipped feature | `src/navigation/types.ts:151`; grep-confirmed absence of any `"published"` write site |
| D-11 | §8 names outbox events (`navigation.menu.created/updated/deleted`, `navigation.location.assigned/unassigned`) as in-scope | The event name constants exist (`contracts.ts`) but nothing in `menu-service.ts` publishes any event | `src/navigation/contracts.ts:92-100`; absence confirmed by reading every mutating function in `menu-service.ts` |

None of the above are "fixed" in this spec — REQ/AC/state/behavior content throughout this
package documents the code's actual behavior (the right column), and the ADR's original text
(the left column) is preserved here as the comparison point for whichever agent eventually
decides whether to close each gap.

---

## Validation Notes

- Validator last run: 2026-07-13T00:00:00Z
- Validator result: PASS
- Validator manual waiver: N/A
- Canonical hash verified at: 2026-07-13T00:00:00Z
- Notes: Full 10-file strict package written directly from real source (`src/navigation/`,
  `src/server/routes/admin/menus/`, `src/server/http/admin/menus.ts`,
  `apps/admin/src/sections/{Menus,MenuEditor}.tsx`) plus the governing ADR-029 and the
  cross-cutting permission-convention doc. Eleven code-vs-ADR-029 deviations identified and
  logged above (D-1 through D-11) rather than silently resolved. Traceability filled from real
  tests/impl rather than left "pending," per the as-built nature of this spec. Six named
  coverage gaps (untested-but-implemented edge cases) carried into `traceability.spec.md`
  Section 6.2 with an owner and target date rather than hidden.
