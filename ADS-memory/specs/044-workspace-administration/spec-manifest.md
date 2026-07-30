# Spec Manifest: workspace-administration

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-044 |
| feature_name | FEAT-044-workspace-administration |
| version | 1.0.0 |
| last_edited | 2026-07-21T00:00:00Z |
| spec_naming | standard |
| spec_root | ADS-memory/specs/044-workspace-administration |
| spec_entrypoint | feature.spec.md |
| spec_readiness_artifact | feature.spec.md (Implementation Readiness Gate section) |

**Purpose:** Package index for the workspace-administration spec. **Disclosed deviation from the
full Speckit package convention**, following the same precedent already used in this repo for a
similarly-scoped feature (`specs/043-widgets/spec-manifest.md`): authored directly by the Coordinator
(dispatched slice, Spec Agent persona) in one pass, not run through the provider-local validator, and
no canonical `content_hash` computed. Held to the same content rigor (every REQ has an AC, every AC
is Given/When/Then with a priority, Constitution Compliance is complete) — the disclosed gap is
process/tooling, not content completeness.

---

## Package Applicability Matrix

| Logical File | Status (`PRESENT\|OMITTED`) | Actual Filename | Why Present / Why Omitted |
|---|---|---|---|
| `feature.spec.md` | PRESENT | `feature.spec.md` | Canonical primary requirements spec — complete, self-contained |
| `api.spec.md` | OMITTED | `—` | Five routes total (REQ-01..05); request/response shapes are stated inline in Requirements/AC rather than split into a separate contract file — proportionate to the surface size |
| `state.spec.md` | OMITTED | `—` | The only state change is `WorkspaceRepoPort` gaining `findById`/`list`/`update`/`delete` (REQ-08) alongside the existing `WorkspaceRecord` shape (unchanged) — fully described inline, no new table |
| `orchestrator.spec.md` | OMITTED | `—` | No async orchestration layer — matches every other admin CRUD feature in this codebase |
| `ui.spec.md` | OMITTED | `—` | `Workspace.tsx`'s shape (REQ-07) is described at the same level of detail this codebase's other admin screens were built from (no dedicated `ui.spec.md` exists for `Users.tsx`/`Roles.tsx` either) |
| `errors.spec.md` | OMITTED | `—` | Five codes total, all reused from the existing project-wide vocabulary (`VALIDATION_ERROR`, `RESOURCE_CONFLICT`, `RESOURCE_NOT_FOUND`, `FORBIDDEN`, `UNAUTHENTICATED`) plus one new code local to this feature (`LAST_WORKSPACE`, REQ-05/INV-03/AC-06) — stated inline, not centralized |
| `behavior.spec.md` | OMITTED | `—` | The one non-obvious ordering rule (INV-04: workspaceId-match check before authorization) and the one atomicity rule (INV-03) are stated directly as Invariants — no separate ordering/precedence surface exists in this small a feature |
| `traceability.spec.md` | OMITTED | `—` | Not yet seeded — REQ-01..08/AC-01..08/INV-01..04/EC-01..04 are dense enough to derive a traceability matrix mechanically at TDD time, matching the SPEC-043 precedent's reasoning |
| `spec-manifest.md` | PRESENT | `spec-manifest.md` | This file |
| `spec-dod.md` | OMITTED | `—` | `feature.spec.md`'s own Implementation Readiness Gate section serves this role, with its one disclosed open item (status DRAFT pending checkpoint) instead of a separate sign-off file |

---

## Stage Read Set

| Stage | Must Read |
|---|---|
| `architect` | feature.spec.md (entire file — Requirements, Architectural Finding section, Constitution Compliance), ADR-007, ADR-006, SPEC-006 (for the `authorize()`/`registerPermission` contract this spec builds on) |
| `tdd` | feature.spec.md, ADR-007, SPEC-006's api.spec.md §2 (auth profiles) |
| `programmer` | feature.spec.md, `src/features/workspace/create.ts` (the existing slice being extended), `src/server/routes/admin/users/*.ts` (the route-pattern precedent to mirror), certified tests |

---

## Validation Notes

- No provider-local validator run yet (disclosed above) — no `content_hash` computed.
- This is a fresh (`spec_mode: greenfield`) spec; there is no prior version to diff against.
- Status is `DRAFT` — owed before Software Architect dispatch: (1) Coordinator Planning Preflight,
  (2) an owner decision on OQ-04 (nav placement — cheap, non-blocking to every other REQ/AC), (3) the
  same Red-Team-or-equivalent review pass every other spec in this pipeline goes through before
  implementation. This spec's own risk profile is low (no security-core change, additive CRUD on an
  already-scoped resource) relative to the SPEC-006 amendment produced alongside it.
