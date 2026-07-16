# Red-Team Findings (Round 2): storage-timeline

- Feature: FEAT-017-storage-timeline
- Spec version: 1.1.0
- Spec hash: sha256:f9d60a5072a2eae2aa68b26bf9d5cdb66c42a3d23a3b0cd56cb5838376066355 (mechanically
  re-verified against the current `SPEC-017-*` package via
  `validate_spec_package.py --phase spec`, PASS with no `--update-hash` needed — content_hash is
  current, not stale)
- Red-Team completed: 2026-07-14T23:45:00Z
- This is a fresh, full adversarial pass against v1.1.0 — not a checklist replay of round 1.
- Finding count (this round): 1 BLOCKING · 3 ADVISORY · 2 CONSTITUTION_FLAG (carried forward,
  unchanged)

---

## Disposition of Round 1 Findings (RT-001 – RT-009)

| ID | Round 1 Severity | Verdict | Why |
|----|----|----|----|
| RT-001 | BLOCKING | **RESOLVED** | `ui.spec.md` §2.2's `DriftBanner` Input Contract now states explicitly it "renders only for `ahead`/`diverged`... `behind` is never `DriftBanner`'s responsibility." §4 bullet 1 matches. `feature.spec.md` AC-02 now reads "given the drift check reports `'in-sync'` or `'behind'` (in either `costClass` case), then no drift banner is shown from the Timeline itself — a `behind`-and-non-`'cheap'` site instead shows `PendingMigrationBanner` per REQ-29, never `DriftBanner`." The three-way disagreement (REQ-02 text vs. ui.spec.md §2.2 props vs. §4 rendering rule) is gone — all three now agree `DriftBanner` never has a `behind` responsibility, and no undeclared `costClass` prop was needed since the component no longer needs to know it. |
| RT-002 | BLOCKING | **RESOLVED** | `feature.spec.md` REQ-12 now reads `(APPLYING\|VERIFYING)_FAILED→RESTORING→(RESTORED\|RESTORE_FAILED)` for Postgres, matching SQLite's REQ-11, `state.spec.md`'s `RESTORE_FROM_MIGRATION_FAILURE` row, `orchestrator.spec.md`'s `onApplyOrVerifyFailure` hook, and `api.spec.md`'s `finalState` enum — all five artifacts now agree. New AC-40 explicitly covers the Postgres `RESTORE_FAILED` case and distinguishes it from `CUTOVER_FAILED→ROLLBACK_TO_BLUE`. |
| RT-003 | BLOCKING | **PARTIALLY RESOLVED** | The REQ-15 half is fixed cleanly: new AC-42 (delegator's `storage.migrate` grant revoked between `confirm()`/`execute()` → `FORBIDDEN`) is a direct, accurate instantiation of SPEC-016 REQ-15's live grant-∩-delegator rule. The REQ-14 half is **not actually fixed** — new AC-41 still doesn't exercise what REQ-14 defines. See new finding **RT2-001 (BLOCKING)** below for the full analysis; this is the same defect class as the original finding, recurring in the replacement content rather than the original AC-09/AC-10 pairing. |
| RT-004 | ADVISORY | **NOT RESOLVED (correctly, by design)** | SPEC-016's own OQ-02 still reads "inherited from SPEC-003's OQ-04 lineage" / "Owner: whoever resolves the original SPEC-003 OQ-04" with no disambiguation note of its own (verified directly against the current `SPEC-016-feature.spec.md` OQ-02 text). This dispatch's guardrails correctly forbid editing SPEC-016, and the revision correctly flagged this to the Coordinator instead of touching it out-of-scope. Still an open, informational risk for whoever next reads SPEC-016 standalone (e.g. a Red-Team pass on SPEC-018/SPEC-019/SPEC-020) — carried forward, not a SPEC-017 defect. |
| RT-005 | ADVISORY | **RESOLVED** | The Dependencies table's `ADS-project-knowledge/specs/003-site-install-dir/` row now carries "**Owner:** Software Architect for SPEC-017... **Resolve by:** before Programmer work begins on REQ-28–REQ-30," matching the rigor of every Open Question. |
| RT-006 | ADVISORY | **RESOLVED** | `behavior.spec.md` §1.2 now reads "this spec does not commit to whether a configured Postgres site can ever report `'cheap'` — that classification is entirely a `db-ops` adapter decision, per OQ-03," removing the prior internally-inconsistent "never `'cheap'`" assertion, and cites SPEC-016 AC-29/AC-33 correctly for the two cases it does commit to. |
| RT-007 | ADVISORY | **RESOLVED** | The Integration Contracts row for SPEC-016 REQ-22 now cites only AC-25, dropping the loosely-fitting AC-28. AC-25 is a clean, direct match for REQ-22's naming/callability rule. |
| RT-008 | CONSTITUTION_FLAG | **Unchanged, still valid** | The Postgres `CUTOVER` repoint mechanism (OQ-03) remains architecturally undecided at the spec level — correctly carried forward verbatim as an Architect-ready note; nothing in the revision changed this surface. |
| RT-009 | CONSTITUTION_FLAG | **Unchanged, still valid** | The `CUTOVER`-path / disk-headroom-preflight test-determinism concern remains — correctly carried forward verbatim; no revision content touched this surface. |

---

## BLOCKING Findings

### RT2-001
- Severity: BLOCKING
- Category: ambiguity (Integration Contracts citation accuracy — the same extra verification duty flagged in round 1, re-applied to the round-1 fix itself)
- Location: `SPEC-017-feature.spec.md` "## Integration Contracts" table, row `REQ-14, REQ-15 (...) | ... | AC-41, AC-42`; AC-41's own text (REQ-08); `SPEC-016-behavior.spec.md` §1.1 vs. §2.2; `SPEC-016-feature.spec.md` REQ-14 vs. REQ-11
- Description: The round-1 fix for RT-003 added AC-41 to demonstrate SPEC-016 REQ-14 ("`authorize()` before idempotency short-circuit") is live for this domain. AC-41's text: "Given a principal lacking `storage.migrate` calls `storage_execute_migrate_forward` with a `confirmationToken` that has already been redeemed..., then the response is `FORBIDDEN`... rather than `TOKEN_ALREADY_REDEEMED`, proving `authorize()` is evaluated before the token-state check... an instantiation of SPEC-016 REQ-14." But SPEC-016 itself draws an explicit, textual distinction between two *different* precedence rules that this citation conflates:
  - SPEC-016 REQ-11 / `behavior.spec.md` §2.2 ("`authorize()` re-evaluation ordering within `execute()`"): "`authorize()` (fresh, fail-closed) → token expiry/redemption-state check → plan re-derivation..." — this is the execute()-internal check sequence, and it is the *specific* rule that governs "authorize() before the `TOKEN_ALREADY_REDEEMED` check." This rule is already cited by SPEC-017's own REQ-08 ("MUST follow SPEC-016 REQ-11–REQ-13's authorize-then-token-state-then-plan-hash-then-actor-class ordering") and already listed against the row directly above (`REQ-08 – REQ-13 | ... | AC-06 – AC-10`).
  - SPEC-016 REQ-14 / `behavior.spec.md` §1.1 ("`authorize()` vs. idempotency short-circuit"): a *textually distinct* precedence rule about a call that "carries **both an idempotency key and an authorization requirement**," where the short-circuit in question returns a prior **`DUPLICATE_COMMAND`** result — a different error code, a different mechanism, and (per §1.1's own scope note) applicable "at every call site that performs a gated **or ordinary** mutation," i.e. a general-purpose idempotency-key concept independent of the gateway's own confirmation-token lifecycle. SPEC-016's own traceability matrix keeps these two rules in separate rows (REQ-11→AC-15/AC-16 vs. REQ-14→AC-21) precisely because they are not the same check.
  Nowhere in the SPEC-017 package (checked `api.spec.md` §4's `STORAGE_MIGRATE_EXECUTE` body, `orchestrator.spec.md`, `state.spec.md`) does an idempotency-key field or a `DUPLICATE_COMMAND`-shaped scenario exist for `storage.migrate-forward` at all. AC-41 demonstrates the REQ-11/§2.2 ordering (already covered), not the REQ-14/§1.1 idempotency-key mechanism — so the Integration Contracts table still asserts REQ-14 coverage that no SPEC-017 AC actually exercises, the exact failure mode RT-003 was raised to close. The fix replaced the *wrong-AC* symptom (AC-09/AC-10 not fitting) but the replacement AC has the *same root defect*: it doesn't test what REQ-14 defines, it re-tests REQ-11 under REQ-14's label.
- Suggested resolution: Either (a) identify or add a genuine domain-specific idempotency-key scenario for `storage_execute_migrate_forward` (or another mutation in this domain) that actually exercises REQ-14's "authorize() before `DUPLICATE_COMMAND`-shorted idempotency key" rule, if such a mechanism is intended to exist here; or (b) if this domain's only duplicate-suppression mechanism is the confirmation-token's own single-use redemption (already fully governed by REQ-11/REQ-13, cited in the row above), state plainly that REQ-14 has no independent domain-specific instantiation beyond what REQ-11 already provides, and either drop REQ-14 from this row (folding it into the REQ-08–REQ-13 citation instead, since REQ-11 already subsumes the ordering guarantee) or relabel AC-41 as evidence for REQ-11 (already covered) rather than REQ-14. Either fix removes the false coverage claim; as written, the table asserts something the spec's own content doesn't demonstrate.

---

## ADVISORY Findings

### RT2-002
- Severity: ADVISORY
- Category: missing-failure-mode
- Location: `SPEC-017-feature.spec.md` REQ-15 vs. REQ-28/REQ-29; `SPEC-017-orchestrator.spec.md` §4 (`reconcileInterruptedMigrationOnBoot`, `evaluateBootMigrationPolicy`) and §5 (`onBootDriftDetected`); `SPEC-017-behavior.spec.md` §2 (Ordering Rules)
- Description: Two independent boot-time decisions exist — crash reconciliation for an interrupted migration (REQ-15, blocking normal site-open until Recovery resolves it) and the cost-gated auto-migrate vs. `PENDING_MIGRATION` decision (REQ-28/REQ-29, driven by `evaluateBootMigrationPolicy`). Nothing in `orchestrator.spec.md`'s Action/Lifecycle-Hook tables or `behavior.spec.md`'s Ordering Rules (§2, which only covers the migrate-forward state machine's own internal step order and failure edges) states which of these two boot-time checks runs first, or whether `evaluateBootMigrationPolicy` is even reachable when a non-terminal `migration_runs` row already exists. A reasonable implementer could infer from REQ-15's "blocking normal site-open" language that reconciliation must gate everything else, including the cost-gated policy evaluation — but a different implementer could just as reasonably run both checks independently (e.g., dispatch `evaluateBootMigrationPolicy` and `reconcileInterruptedMigrationOnBoot` as parallel boot-time tasks), which would risk starting `AUTO_MIGRATE_ON_BOOT` on top of a site with an already-crashed, unresolved migration.
- Suggested resolution: Add an explicit boot-sequence ordering rule to `behavior.spec.md` §2 (e.g. "§2.4 Boot-sequence ordering: `RECONCILE_INTERRUPTED_MIGRATION` MUST run and resolve/block before `evaluateBootMigrationPolicy` is ever invoked; a site with a non-terminal `migration_runs` row never reaches the cost-gated auto-migrate/`PENDING_MIGRATION` decision until Recovery has resolved it"), and reference it from `orchestrator.spec.md`'s `onBootDriftDetected` hook description.

### RT2-003
- Severity: ADVISORY
- Category: contradiction (self-consistency of the DoD evidence artifact, not spec content)
- Location: `SPEC-017-spec-dod.md` §F, item F-08
- Description: F-08 ("All spec files have consistent version numbers") is marked PASS with the note "`1.0.0` in every file." This is stale — every file in the current package header states `version: 1.1.0` (confirmed directly in `feature.spec.md`, `ui.spec.md`, `behavior.spec.md`, `state.spec.md`, `orchestrator.spec.md`, `api.spec.md`, `errors.spec.md`, `traceability.spec.md`, `spec-manifest.md` headers). The check's *conclusion* (all files agree) is still true — the files are internally consistent with each other at `1.1.0` — but the DoD's own recorded evidence text contradicts the artifact it is supposed to be evidencing, which is exactly the "checked boxes with no [accurate] evidence" failure mode the spec-writing skill's DoD discipline exists to prevent.
- Suggested resolution: Update F-08's note to read "`1.1.0` in every file" to match the actual current package state.

---

## CONSTITUTION_FLAG Findings (carried forward, unchanged)

### RT2-004 (= round 1's RT-008)
- Severity: CONSTITUTION_FLAG
- Category: constitution
- Article: Article I — Library-First
- Location: OQ-03; REQ-12
- Description: The Postgres blue/green `CUTOVER` repoint mechanism has no obvious off-the-shelf library performing exactly this atomic-repoint contract; whichever primitive the Software Architect picks (DSN alias, db rename, pool re-target) is likely to need custom orchestration on top.
- Architect note: Prepare a Complexity Justification entry naming the candidate primitives considered and why custom coordination is unavoidable.

### RT2-005 (= round 1's RT-009)
- Severity: CONSTITUTION_FLAG
- Category: constitution
- Article: Article II — Test-First / testability
- Location: REQ-12, REQ-19, EC-03
- Description: Deterministically exercising the Postgres `CUTOVER` failure path and the disk-headroom preflight this domain's snapshot step depends on likely requires either a real multi-instance Postgres harness or a fault-injection fake `db-ops` adapter.
- Architect note: Prepare a test-strategy entry for how `CUTOVER`-path and disk-headroom-preflight tests will be made deterministic and CI-affordable.

---

## Integration Contracts Citation-Accuracy Check (fresh re-verification, per assignment)

Re-checked every row of `SPEC-017-feature.spec.md`'s `## Integration Contracts` table individually
against SPEC-016 v1.1.0's current REQ/AC text:

| Row (SPEC-016 ids) | Cited SPEC-017 ACs | Result |
|---|---|---|
| REQ-01 – REQ-05 | AC-11, AC-16 | Accurate |
| REQ-06, REQ-07 | AC-27 | Accurate |
| REQ-08 – REQ-13 | AC-06 – AC-10 | Accurate |
| **REQ-14, REQ-15** | **AC-41, AC-42** | **FAIL for REQ-14 (RT2-001 above) — PASS for REQ-15 (AC-42 is a correct, direct match)** |
| REQ-16 – REQ-18 | AC-19, AC-35 (REQ-28's attribution) | Accurate |
| REQ-19 – REQ-21 | AC-06, AC-09 | Accurate |
| REQ-22 | AC-25 | Accurate (RT-007's fix holds) |

**Overall citation-accuracy result: FAIL** — one row (REQ-14/REQ-15) is half-accurate: the RT-003 fix
correctly resolved the REQ-15/AC-42 pairing but did not actually resolve the REQ-14/AC-41 pairing,
which still cites an AC that does not exercise what REQ-14 defines. All six other rows are
independently confirmed accurate against SPEC-016 v1.1.0's current text.

Also independently re-verified: the SPEC-016 OQ-04 resolution cross-reference (SPEC-017's dedicated
resolution section vs. SPEC-016's own OQ-04, now marked Resolved) remains consistent — no drift
found there this round either.

---

## Routing Decision

**1 BLOCKING finding exists (RT2-001).** Per the Red-Team persona's severity definition, any
BLOCKING finding means the spec must be revised before Software Architect dispatch — **route back
to Spec Agent.** This does not meet the "3 or more BLOCKING" systemic-quality-problem escalation
threshold (only 1 this round, down from 3 in round 1), so this is a narrow, targeted fix, not a
signal of a broader spec-quality problem: fix the REQ-14/AC-41 citation (RT2-001) and this package
is otherwise in strong shape — RT-001 and RT-002 are cleanly and fully resolved, and 3 of 4 ADVISORY
items from round 1 are cleanly resolved.

ADVISORY (RT2-002, RT2-003) and CONSTITUTION_FLAG (RT2-004, RT2-005) findings are included in
Software Architect context once the spec clears this one remaining revision — none of them
independently block dispatch.

**Integration Contracts citation-accuracy check: FAIL** (see table above) — scoped narrowly to the
REQ-14 half of one row; every other row, including the two rows fixed in round 1 (REQ-14/REQ-15's
REQ-15 half, and REQ-22), is confirmed accurate.
