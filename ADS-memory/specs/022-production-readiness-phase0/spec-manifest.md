# Spec Manifest: Production Readiness Phase 0 — Capability Inventory & Runtime-Mode Containment

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/spec-manifest.md -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-022 |
| feature_name | FEAT-022-production-readiness-phase0 |
| version | 1.0.0 |
| last_edited | 2026-07-16T00:00:00Z |
| spec_naming | standard |
| spec_root | ADS-memory/specs/022-production-readiness-phase0/ |
| spec_entrypoint | feature.spec.md |
| spec_readiness_artifact | spec-dod.md |

**Purpose:** Package index for the strict Speckit compatibility flow. `spec_naming: standard` matches this repo's actual convention — every spec folder from `006` onward uses `standard`, not `prefixed` (verified against existing manifests during the SPEC-021 pass; only `001`-`005` use `prefixed`).

---

## Package Applicability Matrix

| Logical File | Status (`PRESENT\|OMITTED`) | Actual Filename | Why Present / Why Omitted |
|---|---|---|---|
| `feature.spec.md` | PRESENT | `feature.spec.md` | Canonical primary requirements spec |
| `api.spec.md` | OMITTED | `—` | Phase 0 introduces no new public HTTP endpoint, request/response shape, or API contract — it gates whether *existing* routes register at all (REQ-04) and refuses at the composition/boot layer (REQ-03), which is covered by `errors.spec.md`'s boot-refusal codes and `behavior.spec.md`'s ordering rules, not a new API surface. |
| `state.spec.md` | OMITTED | `—` | The capability inventory (REQ-01) is a checked-in, source-controlled artifact (documentation-as-data), not a durable runtime data model with a lifecycle/state machine — no `state.spec.md`-shaped contract applies. |
| `orchestrator.spec.md` | OMITTED | `—` | The full async boot orchestration lifecycle (`prepare`/`start`/`stop`, module status aggregation) is explicitly ADR-046 Phase 2's scope, not Phase 0's. Phase 0's boot-check sequence (behavior.spec.md §2.1) is a linear validation pass, not a multi-module orchestrator. |
| `ui.spec.md` | OMITTED | `—` | No UI surface — this is a server/CI-facing phase. |
| `errors.spec.md` | PRESENT | `errors.spec.md` | Phase 0 introduces 6 new boot-refusal/egress-refusal/tooling codes. |
| `behavior.spec.md` | PRESENT | `behavior.spec.md` | Real precedence (runtime-mode resolution, mailer-lane resolution), real ordering (boot-check sequence), and non-obvious fail-closed defaults — required per the template's own inclusion criteria. |
| `traceability.spec.md` | PRESENT | `traceability.spec.md` | Seeds REQ/AC/INV/EC/error coverage mapping before TDD. |
| `spec-manifest.md` | PRESENT | `spec-manifest.md` | Required package index. |
| `spec-dod.md` | PRESENT | `spec-dod.md` | Readiness gate. |

---

## Stage Read Set

| Stage | Must Read |
|---|---|
| `architect` | `feature.spec.md`, `errors.spec.md`, `behavior.spec.md`, `traceability.spec.md`, `spec-dod.md`, plus `ADR-046-production-readiness-and-composition-hardening.md` (esp. its Debate Fold-In section) and the debate consensus report it cites |
| `tdd` | `feature.spec.md`, `errors.spec.md`, `behavior.spec.md`, `traceability.spec.md`, `spec-dod.md`, ADR-046, the Software Architect Implementation Outline (once produced) |
| `programmer` | `feature.spec.md`, `errors.spec.md`, `behavior.spec.md`, `traceability.spec.md`, ADR-046, certified failing tests from TDD, the Implementation Outline |

---

## Brownfield / Reverse-Spec References

N/A — greenfield. Phase 0 introduces new containment/inventory scaffolding; it does not extend, migrate, or reverse-engineer existing behavior. (It *reads* existing composition-root state — `src/server/deps.ts`/`app.ts` — as input to the inventory, but that's ordinary implementation research, not a brownfield migration in the spec-provider sense.)

| Evidence / Touchpoint | Type | Why It Matters |
|---|---|---|
| N/A — greenfield | N/A | N/A |

---

## Validation Notes

- Validator last run: 2026-07-16T00:00:00Z
- Validator result: PASS
- Validator manual waiver: N/A
- Canonical hash verified at: 2026-07-16T00:00:00Z — `sha256:1d326b48d3adf4001f5d088f18d75221a71c49caa38231c99f26e4fc183cca1e`
- Notes: Package authored in-session (direct Spec Agent execution, not a dispatched subagent, per explicit user request). First validator run surfaced 27 findings (missing Section C rows, 3 status fields not exactly PASS/NA, 2 NA rows lacking concrete justification, a non-ISO-8601 sign-off date) — all repaired inline, second run PASS with zero findings. Ready for Software Architect dispatch.
