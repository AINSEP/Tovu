# Spec Manifest: esm-migration

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/spec-manifest.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-049 |
| feature_name | FEAT-049-esm-migration |
| version | 1.1.0 |
| last_edited | 2026-08-18T04:00:00Z |
| spec_naming | standard |
| spec_root | ADS-memory/specs/049-esm-migration/ |
| spec_entrypoint | feature.spec.md |
| spec_readiness_artifact | spec-dod.md |

**Naming convention note:** `spec_naming` is `standard` (plain filenames, no `SPEC-049-` prefix). This was not asked of a human interactively during this dispatched run (no synchronous back-and-forth was available); it follows the convention used by the two most recent full spec packages in this repo (`044-workspace-administration`, `045-plugins-admin`), both of which use plain `feature.spec.md`-style filenames. This is a low-stakes formatting default, not a blocking ambiguity — it can be corrected by a rename if a human prefers `prefixed` naming, without touching spec content or hash.

**Purpose:** This manifest is the package index for the strict Speckit compatibility flow. It exists to make downstream stages read the full package instead of guessing filenames from memory.

---

## Package Applicability Matrix

| Logical File | Status (`PRESENT|OMITTED`) | Actual Filename | Why Present / Why Omitted |
|---|---|---|---|
| `feature.spec.md` | PRESENT | `feature.spec.md` | Canonical primary requirements spec — wave-membership rules, verification gate, scope boundaries |
| `api.spec.md` | OMITTED | `—` | This feature introduces no external API surface, no new endpoint, and no change to any request/response shape (REQ-06: zero behavior change). The dispatching brief explicitly instructed skipping the `api-contracts`/`api-design` skills for this reason. |
| `state.spec.md` | OMITTED | `—` | No durable, stateful data-store contract is introduced. A wave's migration status is tracked as git/CI state (which files/directories have been converted), not as application data with a state machine, entities, or transitions of the kind this file models. |
| `orchestrator.spec.md` | OMITTED | `—` | No coordinator/orchestration service layer is introduced by this feature. Wave sequencing is a process/CI rule (captured in `behavior.spec.md` §2), not a runtime orchestrator component. |
| `ui.spec.md` | OMITTED | `—` | This feature has no UI surface. It is a pure module-system migration with no user-visible component. |
| `errors.spec.md` | OMITTED | `—` | This feature defines no new product-facing error codes or HTTP error registry. Wave-failure and rollback handling are captured as INV-01–05/EC-01–05 in `feature.spec.md` and as EARS statements in `behavior.spec.md` §7 — CI/build-time verification-gate failures, not an API error envelope. |
| `behavior.spec.md` | PRESENT | `behavior.spec.md` | The feature's core content is an ordering rule (strictly bottom-up wave sequencing) and a barrel-eligibility rule — exactly what this file exists to capture, per its own applicability criterion ("non-trivial ordering... affects correctness"). |
| `traceability.spec.md` | PRESENT | `traceability.spec.md` | Required; seeds REQ/AC/INV/EC/behavior-rule coverage mapping before TDD |
| `spec-manifest.md` | PRESENT | `spec-manifest.md` | Required package index for downstream stages |
| `spec-dod.md` | PRESENT | `spec-dod.md` | Required readiness gate and quality proof |

---

## Stage Read Set

| Stage | Must Read |
|---|---|
| `architect` | `feature.spec.md`, `behavior.spec.md`, `traceability.spec.md`, `spec-dod.md`, `spec-manifest.md`, plus the cited evidence report `ADS-memory/reports/codebase-analysis/MIGRATION-esm-2026-08-18.md` |
| `tdd` | `feature.spec.md`, `behavior.spec.md`, `traceability.spec.md`, `spec-dod.md`, ADR (once produced), tasks (once produced) |
| `programmer` | `feature.spec.md`, `behavior.spec.md`, `traceability.spec.md`, ADR, certified tests |

---

## Brownfield / Reverse-Spec References

This is a `migration`-mode spec (see `feature.spec.md` header `spec_mode: migration`). It is derived from a CodeBase Analyzer report, not from a greenfield product request.

| Evidence / Touchpoint | Type | Why It Matters |
|---|---|---|
| `ADS-memory/reports/codebase-analysis/MIGRATION-esm-2026-08-18.md` | migration | Sole evidentiary basis for the Wave 1 leaf-set membership (REQ-02), the directional failure-mode mechanics that motivate strictly-bottom-up ordering (REQ-01/INV-04, `behavior.spec.md` §2.1), the barrel-purity counts underlying REQ-11, the `core` Ce=0-vs-grep discrepancy (REQ-03), and the Node engines-floor/`require(esm)` open question (REQ-08). Cited throughout `feature.spec.md` and `behavior.spec.md` rather than restated, per the Brownfield/Legacy Rule (spec-writing skill, Rule 3 and Rule 5 — reference by citation, preserve evidence/confidence metadata). |
| `MIGRATION-esm-2026-08-18.md` §1, "Coverage Caveat" and "Sampling Notice" | migration | Source of REQ-10's `[NEEDS CLARIFICATION]` — explicitly names `apps/admin/**` internals and `packages/*` workspace package build/module config as unsampled/excluded from the evidence base. `apps/admin/**` is separately excluded by explicit out-of-scope instruction (REQ-09); `packages/*` has no equivalent explicit instruction, which is exactly the gap REQ-10 asks a human to close. |
| `src/webhooks/subscriptions.ts:30`, `src/webhooks/index.ts:49`, `delete.ts` (session-17 experiment) | source touchpoint | The concrete, confirmed instance of the barrel re-export failure chain, cited by `MIGRATION-esm-2026-08-18.md` §2 and referenced (not restated) in `feature.spec.md`'s User Journey and `behavior.spec.md` §2.1 as the reason wave ordering must be strictly bottom-up. |
| Root `package.json` (`engines.node: >=20.6.0`, `"type": "commonjs"`) | source touchpoint | Directly verified (not taken on report authority alone) via `Read`/`grep` during this Spec Agent run, 2026-08-18. Confirmed the Node engines-floor gap that REQ-08 (resolved 2026-08-18: Phase 0 bumps to Node 24) is built on. |
| `Dockerfile` (`ARG NODE_VERSION=22`) | source touchpoint | Directly verified via `grep` during this Spec Agent run, 2026-08-18. Confirmed the deploy target was Node 22, not the Node 24 the bottom-up safety argument depends on for the CJS-requires-ESM direction — the concrete fact behind REQ-08, now resolved as the Phase 0 bump target. |
| `packages/sdk/package.json` (`"type": "module"`), `packages/sdk/src/index.ts` + `packages/sdk/src/__tests__/unit/sdk-public-api.unit.test.ts` (2 files), consumer grep across `src/`/`apps/` | source touchpoint | Directly verified via `Read`/`grep` during this Spec Agent run, 2026-08-18, in response to REQ-10's resolution: `packages/*` contains exactly one package, `sdk`, already `"type": "module"`, 2 TypeScript files, one-way dependency direction (multiple `src/` files import `@tovu/sdk`; zero imports the other direction). Grounds REQ-10's "pre-migrated no-op" conclusion — the exact consumer-file count in the human's answer (19) was not independently reproduced by this grep (6 files / 26 import occurrences found instead), but the qualitative facts that matter for REQ-10 (already ESM, zero reverse dependency) are confirmed. |

---

## Validation Notes

- Validator last run: 2026-08-18T04:00:00Z (`--phase spec --update-hash`, revision pass after both clarifications resolved)
- Validator result: PASS — `PASS: strict Speckit package passed mechanical validation.` Zero errors.
- Validator manual waiver: N/A — not needed; validator ran successfully and passed cleanly.
- Canonical hash verified at: 2026-08-18T04:00:00Z — `sha256:af12b9f5cc28ea909a62730ed39d59d18897bc5d25de4822aa8dee7f44016fab`
- Notes: v1.0.0 was authored 2026-08-18 with 2 blocking `[NEEDS CLARIFICATION]` markers (REQ-08 Node-version decision, REQ-10 `packages/*` scope), surfaced as structured questions and left unresolved by design per the Spec Agent's guardrail against handing off with unresolved markers. Both were answered by the human the same day (REQ-08 → Node 24 Phase 0, Option A; REQ-10 → in scope, `packages/sdk` pre-migrated no-op). v1.1.0 incorporates both answers; `packages/sdk`'s already-ESM/zero-dependency status was independently re-verified via direct grep before being cited (2 `.ts` files, `"type": "module"`, one-way consumer relationship — exact consumer-file count differed slightly from the human's figure but the qualitative conclusion held). Validator now passes clean. Per explicit Coordinator instruction, Red-Team / Software Architect dispatch is intentionally held pending the human's return — this package is handoff-ready, not yet handed off.
