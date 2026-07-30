# Spec Manifest: Admin Command Gateway — Auditable, Undoable Mutations

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/spec-manifest.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-001 |
| feature_name | FEAT-001-admin-command-gateway |
| version | 1.0.0 |
| last_edited | 2026-07-07T04:15:00Z |
| spec_naming | prefixed |
| spec_root | ADS-memory/specs/001-admin-command-gateway/ |
| spec_entrypoint | feature.spec.md |
| spec_readiness_artifact | spec-dod.md |

**Purpose:** Package index for the strict Speckit compatibility flow.

---

## Package Applicability Matrix

| Logical File | Status (`PRESENT|OMITTED`) | Actual Filename | Why Present / Why Omitted |
|---|---|---|---|
| `feature.spec.md` | PRESENT | `feature.spec.md` | Canonical primary requirements spec |
| `api.spec.md` | PRESENT | `api.spec.md` | Feature adds 3 endpoints and modifies 2 existing ones |
| `state.spec.md` | PRESENT | `state.spec.md` | Durable change-set rows + status lifecycle are the heart of the feature |
| `orchestrator.spec.md` | OMITTED | `—` | Gateway is a synchronous in-process call path; no async orchestration, queues, or coordinator state beyond the existing outbox worker (unchanged) |
| `ui.spec.md` | OMITTED | `—` | No UI surface in this slice; change-history/undo UI is a later frontend feature |
| `errors.spec.md` | PRESENT | `errors.spec.md` | Feature defines 5 new machine-readable error codes |
| `behavior.spec.md` | PRESENT | `behavior.spec.md` | Ordering rules (gateway steps, revert walk), guard precedence, dedup, tie-break |
| `traceability.spec.md` | PRESENT | `traceability.spec.md` | Seeds REQ/AC/INV/EC/error/BR coverage mapping before TDD |
| `spec-manifest.md` | PRESENT | `spec-manifest.md` | Required package index |
| `spec-dod.md` | PRESENT | `spec-dod.md` | Readiness gate |

---

## Stage Read Set

| Stage | Must Read |
|---|---|
| `architect` | `feature.spec.md`, `api.spec.md`, `state.spec.md`, `errors.spec.md`, `behavior.spec.md`, `traceability.spec.md`, `spec-dod.md` |
| `tdd` | `feature.spec.md`, `traceability.spec.md`, `spec-dod.md`, `behavior.spec.md`, `errors.spec.md`, ADR, tasks |
| `programmer` | `feature.spec.md`, `traceability.spec.md`, `api.spec.md`, `state.spec.md`, `errors.spec.md`, `behavior.spec.md`, ADR, certified tests |

---

## Brownfield / Reverse-Spec References

| Evidence / Touchpoint | Type | Why It Matters |
|---|---|---|
| `src/core/ports.ts` (`DomainEvent.actorId`/`changeSetId`) | source touchpoint | ADR-008 vocabulary already on the event envelope; gateway must stamp both fields |
| `ADS-memory/reports/architecture/ADR-008-change-sets.md` | codebase-analysis | Governing decision: storage shape, auto-applied single-item rule, revert semantics |
| `ADS-memory/reports/architecture/admin-section-architecture-outline.md` (rev 3 §7) | codebase-analysis | Upstream analysis that motivated this feature (agent plane requires audit/undo first) |
| `src/features/post/post.ts` (`updatePost`, `version`) | source touchpoint | Wrapped mutation #1; version field feeds the revert guard |
| `src/features/presentation/presentation.ts` (`setActiveTheme`, no `version`) | source touchpoint | Wrapped mutation #2; record gains `version` (REQ-05) |
| `src/server/routes/admin/posts/update.ts`, `…/presentation/patch-active-theme.ts` | source touchpoint | Routes to rewire; response contracts must not change (REQ-04) |
| `src/core/events/` (outbox-worker, memory-bus) | source touchpoint | Event delivery lane for change-set.applied/reverted |
| `src/core/commands/{change-set,command,repo.memory}.ts` (pre-pipeline draft, uncommitted) | source touchpoint | Draft implementation written before pipeline boot; Programmer reconciles it against certified tests — treat as VibeCoder-grade input, not ground truth |
| `AGENTS.md` (repo root) + per-module `INFO.md` files | codebase-analysis | Module conventions (parameter objects, INFO.md/index.ts, __tests__/__specs__) that Agent Directives enforce |

---

## Validation Notes

- Validator last run: 2026-07-02T21:05:00Z
- Validator result: PASS
- Validator manual waiver: N/A
- Canonical hash verified at: 2026-07-02T21:05:00Z (sha256:d47c72376bb7ff82b5506e9b69b03215f50eae1ea24b98573fb43ffc103aba73)
- Notes: first run flagged collapsed DoD rows B-21…B-32 and missing NA justifications on F-03/F-04/F-05; repaired and revalidated clean.
- Revision R2 (2026-07-07): applied Red-Team ADVISORY fixes RT-001 (wired-route summaries), RT-002 (presentation change-set item `entityType`/`entityId`), RT-006 (presentation `version` backfill); corrected stale `tovu/src/…` brownfield paths to `src/…` after the repo split. Version held at 1.0.0 (content-only clarification, mirroring SPEC-002/003 revision convention); content hash recomputed via `--update-hash`.
