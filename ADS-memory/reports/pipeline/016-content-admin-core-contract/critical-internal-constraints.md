# Critical Internal Constraints: content-admin-core-contract

- Spec: SPEC-016 v1.4.0 (hash: sha256:eade503dc1cc72dddad16eb54f3098dada29954493b6d8f964ac51ca0e06194f)
- ADR: ADR-PIPE-016
- Implementation Outline: `ADS-memory/reports/pipeline/016-content-admin-core-contract/implementation-outline.md`
- Prior designations consulted: none found (this is the first Software Architect pass for this feature; no prior CIC artifact exists for `core/gated-mutations`, `core/commands`, or `identity/authorize` in `ADS-memory/reports/pipeline/`)
- Status: PRODUCED
- Trigger result: Security-Critical Sequencing Constraint (2 units), Concurrency / Ordering / Idempotency Constraint (2 units), Failure / Recovery Constraint (1 unit)
- Source sync: verified 2026-07-15T07:00:00Z — every REQ/AC/INV/C-xxx id below was cross-checked against SPEC-016 v1.4.0's current text and this feature's own `implementation-outline.md`
- Date: 2026-07-15T07:00:00Z
- Author: Software Architect (Claude Sonnet 5, Agent Direct Mode)

## Trigger Decision Matrix

| Trigger | Applies? | Designated Unit(s) | Plausible Wrong Implementation | Broken Property | Required Constraint | Source Trace |
|---|---:|---|---|---|---|---|
| Algorithmic Correctness Constraint | no | — | — | — | — | — |
| Stateful Protocol Constraint | no | — | Considered `ConfirmationToken`'s `minted→redeemed\|expired` transitions, but `state.spec.md` §3/§5 already fully specifies the legal transition table and no plausible wrong implementation escapes public-contract testing beyond what U-001/U-003 already cover (ordering and concurrency, respectively) — no additional internal-only state-machine detail exists beyond those. | — | — | — |
| Concurrency / Ordering / Idempotency Constraint | yes | U-002, U-003 | See unit sections below | See unit sections below | See unit sections below | REQ-01, INV-01, INV-03 |
| Security-Critical Sequencing Constraint | yes | U-001 | See unit section below | See unit section below | See unit section below | REQ-11, REQ-13, REQ-14, behavior.spec.md §2.2 |
| Explicit Performance Budget Constraint | no | — | SPEC-016 states no explicit latency/throughput budget for the gateway or watermark path (`GATED_WRITE` rate limits are a request-volume cap, not a latency budget) — no trigger without a stated budget. | — | — | — |
| Failure / Recovery Constraint | yes | U-004 | See unit section below | See unit section below | See unit section below | REQ-04, REQ-05 |
| Characterization Parity Constraint | no | — | Not a reverse-spec/migration surface — no legacy behavior to preserve. | — | — | — |

Candidate units checked beyond the designated four: `plan()` (C-001, read-only, no invariant beyond input validation — no trigger applies); `appendActorReference()` (C-006, a pure population helper whose correctness is fully captured by its public contract's Validation column — no internal detail escapes that); `DbOpsPort.getCapabilities()` (C-007, a static configuration-presence check with no concurrency or ordering property — no trigger applies).

## Designated Units

| Unit ID | Name | Location (module / contract ref) | Designating Trigger(s) | Outline Refs | Trace |
|---|---|---|---|---|---|
| U-001 | `execute()` check-sequence ordering | `core/gated-mutations/gateway.ts`, C-003 | Security-Critical Sequencing Constraint | C-003, INV-05, INV-08 | SPEC-016 REQ-11, REQ-13, REQ-14, behavior.spec.md §2.2, AC-38 |
| U-002 | `storage_write_watermark` same-transaction atomicity + concurrent-writer serialization | `core/gated-mutations/watermark.ts`, C-004 | Concurrency / Ordering / Idempotency Constraint | C-004, INV-01 | SPEC-016 REQ-01, EC-01, AC-01, AC-02, AC-39, AC-40 |
| U-003 | Single-use confirmation-token redemption under concurrent `execute()` calls | `core/gated-mutations/token.ts`, C-005 (invoked from C-003) | Concurrency / Ordering / Idempotency Constraint | C-005, INV-03 | SPEC-016 INV-03, state.spec.md §3 (`REDEEM_TOKEN`) |
| U-004 | Boot-time sidecar-mirror reconciliation source-of-truth direction | `core/gated-mutations/watermark.ts`, C-004 (`RECONCILE_MIRROR`) | Failure / Recovery Constraint | W-005, state.spec.md §3 | SPEC-016 REQ-03–REQ-05 |

## Unit Constraints

### U-001 `execute()` check-sequence ordering

- Responsibility: Evaluate `execute()`'s gate checks in the one order that preserves this contract's non-disclosure principle.
- Designation: A competent implementer, focused only on passing each individual AC in isolation, could satisfy every single-failure test (AC-15 through AC-20, AC-35) while still reordering two checks relative to each other in a way that only a two-failure-combination scenario exposes — exactly the class of bug AC-38 exists to catch, and exactly the shape of defect Red-Team round 2's RT-017 originally found (the actor-class check ran *after* plan re-derivation in an earlier draft). Broken property: a caller who was never allowed to redeem a given token could learn, ahead of being told `FORBIDDEN`, that the live plan has also drifted — a disclosure leak the contract's own REQ-11/REQ-14 non-disclosure pattern is designed to prevent everywhere else. Required constraint: the check order below is fixed and may not be reordered even when a later check would also fail.
- Outline refs: C-003, INV-05, INV-08

#### Binding Constraints

| ID | Constraint | Escalation Marker | Property Protected | Verification Surface | Trace |
|---|---|---|---|---|---|
| U-001-B1 | `authorize()` is re-evaluated fresh (never cached from `confirm()`-time) strictly before the token expiry/redemption-state check | ESCALATE_SECURITY | Non-disclosure of authorization state ahead of token state; live delegator-revocation must take effect immediately | API result (`FORBIDDEN` with `details.reasonCode: 'AUTHORIZE_DENIED'` reported before any token-state code) | SPEC-016 REQ-11, AC-15 |
| U-001-B2 | The actor-class redemption rule (REQ-13) is evaluated strictly after the token expiry/redemption-state check and strictly before plan re-derivation/hash comparison | ESCALATE_SECURITY | Non-disclosure — a caller failing the actor-class rule must never learn whether the plan has separately gone stale | API result (`FORBIDDEN` with `details.reasonCode: 'ACTOR_CLASS_MISMATCH'`, never `PLAN_STALE`, when both conditions hold simultaneously) | SPEC-016 REQ-13, behavior.spec.md §2.2, AC-38 |
| U-001-B3 | Plan re-derivation/hash comparison against live state runs only after every prior gate has passed, and any hash mismatch found there rejects with `PLAN_STALE` before any domain-specific mutation executes | — | Prevents a stale plan from ever reaching the domain-specific mutation step | API result (`PLAN_STALE`) / persisted state (no domain mutation applied) | SPEC-016 REQ-12, AC-16, AC-17 |

#### Required Ordering Constraints

| ID | Required Ordering | Property Protected | Observable Verification Surface | Escalation Marker | Trace |
|---|---|---|---|---|---|
| U-001-ORD1 | `authorize()` completes before the token expiry/redemption-state check begins | Non-disclosure of authz state ahead of token state (REQ-11) | API result: an unauthorized caller with an independently-expired token always sees `FORBIDDEN`, never `TOKEN_EXPIRED` | ESCALATE_SECURITY | SPEC-016 behavior.spec.md §2.2 EC row, feature.spec.md EC-04 |
| U-001-ORD2 | The token expiry/redemption-state check completes before the actor-class redemption rule runs | Token-state failures (expired/already-redeemed) must be distinguishable from actor-class failures per the established error taxonomy | API result: an already-redeemed token from an actor-class-mismatched caller reports `TOKEN_ALREADY_REDEEMED`, not `FORBIDDEN` | ESCALATE_SECURITY | SPEC-016 state.spec.md §3 `REDEEM_TOKEN` precondition order |
| U-001-ORD3 | The actor-class redemption rule completes before plan re-derivation/hash comparison begins | Non-disclosure of plan-staleness ahead of actor-class denial (REQ-13) | API result: `FORBIDDEN` (`ACTOR_CLASS_MISMATCH`), never `PLAN_STALE`, when both conditions hold (AC-38) | ESCALATE_SECURITY | SPEC-016 behavior.spec.md §2.2, AC-38 |

#### Invariant References

| Reference | Source | Binding Constraint IDs Supported |
|---|---|---|
| INV-05 | SPEC-016 feature.spec.md | U-001-B1 |
| INV-08 | `implementation-outline.md` (`[internal-invariant]`, derived from behavior.spec.md §2.2) | U-001-B2, U-001-ORD3 |

#### Design Context (optional, non-binding)

This ordering was itself the subject of a real Red-Team-found defect (round 2's RT-017) before this ADR was written — the spec's own behavior.spec.md §2.2 already states the corrected order in prose. This unit exists so the Programmer has a Binding, test-enforced version of that same ordering rather than relying on prose alone.

---

### U-002 `storage_write_watermark` same-transaction atomicity + concurrent-writer serialization

- Responsibility: Guarantee the watermark counter increments exactly once per stamped write, atomically with that write, and never loses an increment under concurrent writers.
- Designation: A competent implementer might increment the counter in a separate statement after the caller's own commit (rather than inside the same transaction), which passes every single-writer test but silently breaks atomicity the instant two writers interleave, or under a crash between the two statements. Broken property: INV-01 (never decreases) technically still holds, but the counter could under- or over-count relative to actual writes, corrupting every downstream discarded-window disclosure. Required constraint: the increment must execute inside the exact same transaction as the write it stamps, relying on the engine's own transactional isolation for serialization — never a post-commit or best-effort update.
- Outline refs: C-004, INV-01

#### Binding Constraints

| ID | Constraint | Escalation Marker | Property Protected | Verification Surface | Trace |
|---|---|---|---|---|---|
| U-002-B1 | The increment executes inside the caller's own already-open transaction; `stampWatermark()` throws rather than silently succeeding if called outside an open transaction | — | Same-transaction atomicity (REQ-01); prevents a "stamped without a corresponding write" or "write without a stamp" state | API result: `stampWatermark()` called outside a transaction throws, observable in the calling chokepoint's own error path (AC-02) | SPEC-016 REQ-01, AC-01, AC-02 |
| U-002-B2 | For a SQLite-backed site, concurrent commits are serialized by the single-writer WAL transaction model; for a Postgres-backed site (deferred), by row-level MVCC locking on the counter row — no engine-specific fast path may bypass the engine's own native transaction/locking guarantee | — | No lost updates under concurrent writers (INV-01) | Persisted state: after N concurrent transactions each increment once, the final counter value equals initial + N | SPEC-016 REQ-01, EC-01, AC-39, AC-40 |

#### Required Ordering Constraints

N/A — this unit's property is a same-transaction atomicity/serialization guarantee, not a multi-step ordering across separate operations; see Binding Constraints above.

#### Invariant References

| Reference | Source | Binding Constraint IDs Supported |
|---|---|---|
| INV-01 | SPEC-016 feature.spec.md | U-002-B1, U-002-B2 |

#### Design Context (optional, non-binding)

This is the exact mechanism ADR-041's own round-1/round-2 audit fold corrected (moving the authoritative counter into `content.db` after an earlier draft assumed cross-file atomicity that SQLite cannot provide). This unit exists so that history is not silently re-discoverable as a fresh defect in this codebase's actual implementation.

---

### U-003 Single-use confirmation-token redemption under concurrent `execute()` calls

- Responsibility: Guarantee a confirmation token is redeemed at most once even when two `execute()` calls race on the same token.
- Designation: A competent implementer might check `status === 'minted'` and then, in a separate step, set `status = 'redeemed'` — correct under sequential calls (which is all the public ACs directly exercise), but under two concurrent `execute()` calls both reading `status === 'minted'` before either write lands, both could proceed to run the domain-specific mutation, violating exactly-once execution. Broken property: INV-03 (never redeemed more than once) and, transitively, the entire "gated mutation runs exactly once" guarantee this contract exists to provide. Required constraint: the read-then-transition-to-redeemed step must be a single atomic operation (e.g. a conditional update guarded by the current status), not a read followed by a separate write.
- Outline refs: C-005, INV-03

#### Binding Constraints

| ID | Constraint | Escalation Marker | Property Protected | Verification Surface | Trace |
|---|---|---|---|---|---|
| U-003-B1 | The token's `status='minted' → 'redeemed'` transition must be a single atomic, conditional operation (fails/no-ops if status is not `'minted'` at the moment of the attempt) — never a separate read followed by a separate write | ESCALATE_IRREVERSIBLE | Exactly-once execution of the gated mutation (INV-03); a double-redemption of a migration/restore/destructive-cleanup token is a non-idempotent, high-blast-radius external effect | Persisted state: under two concurrent `execute()` calls with the same valid token, exactly one succeeds and the other observably fails with `TOKEN_ALREADY_REDEEMED` | SPEC-016 INV-03, state.spec.md §3 `REDEEM_TOKEN` |

#### Required Ordering Constraints

N/A — this is a single-operation atomicity constraint, not a multi-step ordering.

#### Invariant References

| Reference | Source | Binding Constraint IDs Supported |
|---|---|---|
| INV-03 | SPEC-016 feature.spec.md | U-003-B1 |

#### Design Context (optional, non-binding)

`ESCALATE_IRREVERSIBLE` applies here because the domain-specific mutations this gateway guards (forward migration, restore, destructive Collections cleanup) are exactly the class of non-idempotent, hard-to-undo operations the marker exists for — a double-execution bug in this unit would not be a cosmetic defect.

---

### U-004 Boot-time sidecar-mirror reconciliation source-of-truth direction

- Responsibility: Ensure the sidecar mirror is always corrected FROM `content.db`'s authoritative counter at boot, never the reverse, and never from `storage_ledger`.
- Designation: A competent implementer, seeing two values (mirror and authoritative counter) disagree at boot, might "merge" or average them, or might reconcile from whichever value is numerically larger — plausible-sounding recovery heuristics that both violate REQ-04's explicit rule. A different plausible wrong implementation (the one ADR-041's own round-2 audit fold actually found in an earlier draft) reconciles from `storage_ledger`'s max recorded value — which doesn't work because the ledger records operational/schema events, not one row per ordinary write, so its max value is not a proxy for the watermark's true value. Broken property: the mirror could report a state that never actually existed in `content.db`, and any disclosure computed from it would be silently wrong rather than honestly degraded. Required constraint: reconciliation always overwrites the mirror from `content.db`'s current authoritative value, discarding the mirror's own prior value entirely, and only when `content.db` opens successfully.
- Outline refs: W-005, state.spec.md §3 (`RECONCILE_MIRROR`)

#### Binding Constraints

| ID | Constraint | Escalation Marker | Property Protected | Verification Surface | Trace |
|---|---|---|---|---|---|
| U-004-B1 | On successful `content.db` open, the mirror is unconditionally overwritten from the authoritative counter's current value — never merged, averaged, or reconciled from `storage_ledger` | — | Mirror correctness; prevents a silently-wrong disclosure computed from a mirror value that never existed in `content.db` | Persisted state: after boot reconciliation, `mirror.value === contentDb.watermark.value` exactly, regardless of the mirror's pre-boot value | SPEC-016 REQ-04 |
| U-004-B2 | When `content.db` fails to open, the mirror is left unreconciled and `mirror.staleness` is set to `'unrefreshable'`; any disclosure computed in this state renders an explicit unknown/lower-bound estimate, never a precise number derived from the stale mirror | — | Honest degradation over silent wrongness (REQ-05) | API/UI result: disclosure surface renders an explicit unknown/lower-bound marker, never a specific count, when `mirror.staleness === 'unrefreshable'` | SPEC-016 REQ-05, EC-05 |

#### Failure / Recovery Constraints

| ID | Failure Point | Required Behavior | Partial-State Rule | Verification Surface | Escalation Marker |
|---|---|---|---|---|---|
| U-004-F1 | `content.db` fails to open at boot | Reconciliation does not run; mirror's prior value is left untouched (neither trusted as fresh nor discarded) | Mirror's `staleness` field must transition to `'unrefreshable'`; `mirror.value` itself is neither zeroed nor treated as current | Persisted state: `mirror.staleness === 'unrefreshable'`; downstream disclosure surfaces check this field before rendering any count | — |

#### Invariant References

| Reference | Source | Binding Constraint IDs Supported |
|---|---|---|
| (no separate outline INV — this unit's property is fully captured by REQ-04/REQ-05 directly) | SPEC-016 feature.spec.md REQ-04, REQ-05 | U-004-B1, U-004-B2, U-004-F1 |

#### Design Context (optional, non-binding)

This is the exact defect ADR-041's own round-2 audit fold found and corrected (Codex, gpt-5.5, high — the only one of three auditors that round to catch it). This unit exists so that specific, previously-real defect cannot silently reappear in this codebase's actual implementation of the mechanism ADR-041 only ever described in prose.

## Deviation And Promotion Protocol

Per `AI-Dev-Shop/skills/critical-internal-constraints/SKILL.md`: escalation-marked constraints (U-001-B1, U-001-B2, U-001-ORD1, U-001-ORD3, U-003-B1) require Coordinator routing and a recorded `[CIC_DEVIATION_APPROVED]` entry before any deviation; all other Binding constraints require a recorded `[CIC_DEVIATION]` entry. No deviations exist yet — this is the initial designation pass.

## Downstream Handoff Notes

- Coordinator: tasks touching `core/gated-mutations/gateway.ts`, `watermark.ts`, or `token.ts` must reference U-001/U-002/U-003 by Unit ID; tasks touching boot-sequence reconciliation must reference U-004. Source-sync IDs to watch: REQ-01, REQ-04, REQ-05, REQ-11, REQ-13, INV-01, INV-03, INV-05, INV-08.
- TDD focus: encode U-001's two-failure-combination property test and U-003's concurrent-redemption race test first — both are the constraint class most likely to pass every individual AC while still being wrong. Audit-only constraints: none — every Binding constraint above has an observable verification surface.
- Programmer audit focus: confirm the token status transition (U-003-B1) is implemented as a single atomic/conditional database operation, not read-then-write; confirm `execute()`'s check sequence (U-001) cannot be reordered by a future edit without failing U-001-ORD1/ORD2/ORD3's tests; confirm boot reconciliation (U-004) never reads from `storage_ledger`.
- Open risks or ambiguities: none beyond SPEC-016's own carried-forward OQ-01 (watermark contention benchmark) and OQ-03 (Postgres `CUTOVER` mechanism), neither of which changes any Binding constraint recorded here.
