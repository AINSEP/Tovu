# Critical Internal Constraints: backups-recovery

- Spec: SPEC-019 v1.1.0 (hash: sha256:eb0588d10723af1981dbad16975255bc05681df346246287a9c546514c854f4d)
- ADR: ADR-PIPE-019
- Implementation Outline: `ADS-memory/reports/pipeline/019-backups-recovery/implementation-outline.md`
- Prior designations consulted: `ADS-memory/reports/pipeline/016-content-admin-core-contract/critical-internal-constraints.md` (U-001/U-003 re-affirmed as inherited via `core/gated-mutations`, unchanged); `ADS-memory/reports/pipeline/017-storage-timeline/critical-internal-constraints.md` — none of SPEC-017's designated units are directly touched by this domain's own code, but U-001 below is the FIRST designation of the shared `core/operation-lock` primitive that SPEC-017's own execute() path (implementation-outline.md W-102/W-102a) will also need to consult; this designation should be treated as binding on SPEC-017's implementation too, not only this domain's. (Reference corrected 2026-07-15 per `/audit-work`: SPEC-017's own W-103 is its quiesce-time watermark-stamping flow, unrelated to the lock — the lock-consultation flows are W-102/W-102a.)
- Status: PRODUCED
- Trigger result: Concurrency / Ordering / Idempotency Constraint (1 unit), Security-Critical Sequencing Constraint (2 units)
- Source sync: verified 2026-07-15T10:00:00Z against SPEC-019 v1.1.0 and this feature's own implementation-outline.md
- Date: 2026-07-15T10:00:00Z
- Author: Software Architect (Claude Sonnet 5, Agent Direct Mode)

## Trigger Decision Matrix

| Trigger | Applies? | Designated Unit(s) | Plausible Wrong Implementation | Broken Property | Required Constraint | Source Trace |
|---|---:|---|---|---|---|---|
| Algorithmic Correctness Constraint | no | — | No algorithm of the class Algorithmic Correctness targets (matching/dedup/scheduling/ranking/money) exists in this domain. | — | — | — |
| Stateful Protocol Constraint | no | — | Considered `RestoreFlowStep`'s enum transitions — but every illegal transition is already fully captured by C-301-C-303's public contract Validation columns and INV-02 (see U-002 below); no additional internal-only state-machine detail escapes those. | — | — | — |
| Concurrency / Ordering / Idempotency Constraint | yes | U-001 | See unit section | See unit section | See unit section | REQ-13, INV-03; GOV-ADR-002 |
| Security-Critical Sequencing Constraint | yes | U-002, U-003 | See unit sections | See unit sections | See unit sections | REQ-08, INV-02; behavior.spec.md §2.2 |
| Explicit Performance Budget Constraint | no | — | No stated latency/throughput budget for this domain. | — | — | — |
| Failure / Recovery Constraint | no | — | The restore ceremony's own failure/recovery behavior (PLAN_STALE, etc.) is fully inherited from SPEC-016's gateway (already covered by SPEC-016's own CIC) — no domain-specific failure/recovery detail beyond that inheritance and the progress-panel refresh-safety property, which is a read-freshness contract fully captured by C-304's public Validation column, not an internal-only gap. | — | — | — |
| Characterization Parity Constraint | no | — | Not a reverse-spec/migration surface. | — | — | — |

Candidate units checked beyond the designated three: `computeDisclosure` (C-305, fully captured by its own public Validation column — no internal detail escapes it); `resolveDeepLinkContext` (C-306, a trust-boundary concern but fully captured by its public contract's "never trusts the envelope" Validation rule — no internal-only sequencing beyond what's already Binding at the contract level); banner precedence resolver (C-308, a display-ordering concern with no correctness/security/recovery/parity property at stake — explicitly considered and rejected in ADR-PIPE-019).

## Designated Units

| Unit ID | Name | Location (module / contract ref) | Designating Trigger(s) | Outline Refs | Trace |
|---|---|---|---|---|---|
| U-001 | Shared cross-domain in-flight operation lock | `core/operation-lock.ts`, C-309 | Concurrency / Ordering / Idempotency Constraint | C-309, INV-03; GOV-ADR-002 | SPEC-019 REQ-13, INV-03; SPEC-017 implementation-outline.md W-102/W-102a (cross-reference) |
| U-002 | Disclosure-acknowledgment gates confirm reachability | `features/recovery/recovery-orchestrator.ts`, C-302 | Security-Critical Sequencing Constraint | C-302, INV-02 | SPEC-019 REQ-08, INV-02, behavior.spec.md §1.2 |
| U-003 | Fresh `costClass` re-check before gateway delegation | `features/recovery/recovery-orchestrator.ts`, C-301 | Security-Critical Sequencing Constraint | C-301, behavior.spec.md §2.2 | SPEC-019 REQ-12, behavior.spec.md §2.2, EC-05 |

## Unit Constraints

### U-001 Shared cross-domain in-flight operation lock

- Responsibility: Guarantee at most one gated operation (a Storage migration or a Recovery restore) is in flight per site at any time, across both domains.
- Designation: A competent implementer, working on Recovery and Storage as if they were fully independent slices (the codebase's own default heuristic), might each implement their own "is anything in flight?" check against their own domain's own state (`migration_runs` for Storage, a Recovery-local flag for restore) — this passes every single-domain test (each screen correctly blocks a second operation of its own kind) but never detects the *other* domain's in-flight operation, since neither reads the other's state. Broken property: REQ-13's explicit cross-screen requirement, and the data-corruption risk of a concurrent migrate-forward and restore against the same site (e.g. a restore reading a schema mid-migration, or a migration applying atop a database a restore has just discarded). Required constraint: both domains MUST consult one single, shared, site-scoped lock primitive — never two domain-local checks that happen to look similar.
- Outline refs: C-309, INV-03; GOV-ADR-002

#### Binding Constraints

| ID | Constraint | Escalation Marker | Property Protected | Verification Surface | Trace |
|---|---|---|---|---|---|
| U-001-B1 | `acquireOperationLock({siteId, operationKind})` is the single, shared entry point both `features/storage`'s migrate-forward `execute()` and `features/recovery`'s `executeRestore` MUST call before proceeding to their own domain-specific mutation — neither domain may implement an independent in-flight check | ESCALATE_IRREVERSIBLE | REQ-13; prevents a concurrent migration and restore against the same site, a genuine data-corruption risk | Integration-observable: a concurrent Storage-execute and Recovery-execute attempt against the same site always yields exactly one winner and one `*_OPERATION_IN_FLIGHT` rejection | SPEC-019 REQ-13, INV-03 |
| U-001-B2 | `acquireOperationLock` is an atomic, single conditional operation (check-and-set), never a separate read-then-write | ESCALATE_IRREVERSIBLE | Prevents the same TOCTOU race this pattern already guards against in SPEC-016 CIC U-003 (token redemption) and this domain's own concurrent-restore concern | Integration test: two simultaneous acquire attempts for the same site, exactly one succeeds | SPEC-019 REQ-13 |

#### Required Ordering Constraints

| ID | Required Ordering | Property Protected | Observable Verification Surface | Escalation Marker | Trace |
|---|---|---|---|---|---|
| U-001-ORD1 | `acquireOperationLock` succeeds before either domain's own gateway `execute()` proceeds to its domain-specific mutation (state-machine advance for Storage, restore for Recovery) | REQ-13's cross-screen guarantee | Integration test: lock acquisition is provably the first side-effecting step of both `executeMigrateForward` and `executeRestore` | ESCALATE_IRREVERSIBLE | SPEC-019 REQ-13; ADR-PIPE-017 cross-reference |

#### Invariant References

| Reference | Source | Binding Constraint IDs Supported |
|---|---|---|
| INV-03 | SPEC-019 feature.spec.md | U-001-B1, U-001-B2, U-001-ORD1 |

#### Design Context (optional, non-binding)

This unit is deliberately recorded once, here, rather than duplicated in SPEC-017's own CIC, because it is genuinely one shared primitive both domains must use identically — recording it twice would risk the two copies drifting apart, exactly the failure mode this whole pipeline exists to prevent. SPEC-017's own implementation must treat this designation as binding on its own `execute()` path.

---

### U-002 Disclosure-acknowledgment gates confirm reachability

- Responsibility: Guarantee `confirm()` for a restore is never reachable — from any code path, not just the primary UI — until the operator has explicitly acknowledged the discarded-write-window disclosure for that specific plan.
- Designation: A competent implementer might enforce this purely client-side (disabling the confirm button until a checkbox is checked) and treat the server's `confirmRestore` endpoint as trusting a `disclosureAcknowledged: true` flag the client sends — this passes every UI-level test (the button really is disabled) while leaving a server-side path that would mint a token for any client claiming acknowledgment, honest or not. Broken property: INV-02, and transitively ADR-045's central safety requirement — a modified client, a direct API call, or a future second UI surface could mint a restore confirmation token without the operator having actually seen the disclosure. Required constraint: the server-side `confirmRestore` handler must itself refuse to mint a token unless (a) the request carries `disclosureAcknowledged: true`, AND (b) the `planId` being confirmed was one this server's own `planRestore` actually minted and returned a disclosure for (per U-002-ORD1) — not merely trust a caller-supplied boolean flag at face value with no plan-provenance check. (Note: per SPEC-019 `state.spec.md`'s own `ACKNOWLEDGE_DISCLOSURE` action, the acknowledgment itself is a client-only gate with no server call — the server cannot verify that a human actually read the disclosure text, only that the request carries the flag against a plan the server itself minted. This constraint's required predicate is exactly that composite check, not an invented server-side "acknowledgment record" the state contract does not define.)
- Outline refs: C-302, INV-02

#### Binding Constraints

| ID | Constraint | Escalation Marker | Property Protected | Verification Surface | Trace |
|---|---|---|---|---|---|
| U-002-B1 | `confirmRestore` rejects (mints no token) unless the request carries `disclosureAcknowledged: true` AND `planId` resolves to a plan this server's own `planRestore` actually minted and returned a disclosure for (per U-002-ORD1) — the composite of these two checks, not an invented server-tracked acknowledgment state | ESCALATE_SECURITY | INV-02 — the disclosure is this domain's one non-negotiable safety gate | API result: a `confirmRestore` call omitting the acknowledgment field, or supplying it against a `planId` the server never minted, is rejected | SPEC-019 REQ-08, INV-02 |

#### Required Ordering Constraints

| ID | Required Ordering | Property Protected | Observable Verification Surface | Escalation Marker | Trace |
|---|---|---|---|---|---|
| U-002-ORD1 | `planRestore` (which returns the disclosure) must complete before `confirmRestore` can ever succeed for the same `planId` | INV-02 — no confirm without a prior, genuine plan-and-disclosure step | API result: `confirmRestore` for a `planId` never returned by a prior `planRestore` call fails | ESCALATE_SECURITY | SPEC-019 behavior.spec.md §2.1 |

#### Invariant References

| Reference | Source | Binding Constraint IDs Supported |
|---|---|---|
| INV-02 | SPEC-019 feature.spec.md | U-002-B1, U-002-ORD1 |

#### Design Context (optional, non-binding)

This unit exists because SPEC-019's own state.spec.md action catalog shows `ACKNOWLEDGE_DISCLOSURE` as a client-only, no-server-call action — meaning the disclosure-acknowledgment tracking on the server side is not automatically implied by the client wizard's own state machine, and must be independently verified as a real server-side gate, not assumed.

---

### U-003 Fresh `costClass` re-check before gateway delegation

- Responsibility: Guarantee `planRestore` re-evaluates `costClass` fresh at call time, never from a cached/prior render, before delegating to `core/gated-mutations.plan()`.
- Designation: A competent implementer might cache `costClass` from the capability bar's last fetch (a reasonable-looking optimization to avoid a redundant `getCapabilities()` call) and reuse that cached value inside `planRestore` — this passes every test where `costClass` is stable between page load and plan-call, but under EC-05's exact scenario (costClass degrades from `'cheap'` to `'unavailable'` between list-load and restore-flow-open), the cached value would incorrectly let `plan()` proceed against a site that has since become incapable of producing a restore point. Broken property: REQ-12's "no restore action for `costClass: 'unavailable'`" degraded-mode guarantee, and ADR-041 §2's explicit rejection of any attestation-override bypass — a stale-cache bug would be a silent, accidental version of exactly the bypass ADR-041 rejected on purpose. Required constraint: `planRestore` must call `getCapabilities()` fresh, every time, never reusing a value fetched for a different purpose (e.g. rendering the status bar).
- Outline refs: C-301, behavior.spec.md §2.2

#### Binding Constraints

| ID | Constraint | Escalation Marker | Property Protected | Verification Surface | Trace |
|---|---|---|---|---|---|
| U-003-B1 | `planRestore` calls `db-ops.getCapabilities()` fresh at call time, never reusing a `costClass` value cached for the capability/status bar's own rendering | ESCALATE_SECURITY | REQ-12's degraded-mode guarantee; prevents an accidental attestation-override-equivalent bypass via stale cache | API result: given `costClass` degrades to `'unavailable'` between an initial fetch and a `planRestore` call, the call refuses to reach the gateway and reports the degraded state | SPEC-019 REQ-12, behavior.spec.md §2.2, EC-05 |

#### Required Ordering Constraints

| ID | Required Ordering | Property Protected | Observable Verification Surface | Escalation Marker | Trace |
|---|---|---|---|---|---|
| U-003-ORD1 | The fresh `costClass` re-check completes, and is confirmed not `'unavailable'`, before `core/gated-mutations.plan()` is ever called | REQ-12; prevents the gateway's own `authorize()` evaluation from ever running against a capability-unavailable site | API result: `plan()`'s own `authorize()` evaluation is never reached when a fresh recheck already shows `'unavailable'` | ESCALATE_SECURITY | SPEC-019 behavior.spec.md §2.2 |

#### Invariant References

| Reference | Source | Binding Constraint IDs Supported |
|---|---|---|
| (no separate outline INV — fully captured by REQ-12 and behavior.spec.md §2.2 directly) | SPEC-019 feature.spec.md REQ-12, behavior.spec.md §2.2 | U-003-B1, U-003-ORD1 |

#### Design Context (optional, non-binding)

This is the same class of "looks like a harmless optimization, isn't" risk as SPEC-018's U-002 (drift classification) — caching `costClass` feels like an obvious win until the exact race condition behavior.spec.md's own EC-05 names is constructed.

## Deviation And Promotion Protocol

Per `AI-Dev-Shop/skills/critical-internal-constraints/SKILL.md`: escalation-marked constraints (U-001-B1, U-001-B2, U-001-ORD1, U-002-B1, U-002-ORD1, U-003-B1, U-003-ORD1) require Coordinator routing and a recorded `[CIC_DEVIATION_APPROVED]` entry before any deviation. No deviations exist yet.

## Downstream Handoff Notes

- Coordinator: tasks touching `core/operation-lock.ts` reference U-001 and must be shared/cross-referenced with SPEC-017's own tasks, not duplicated independently. Tasks touching `recovery-orchestrator.ts`'s confirm/plan steps reference U-002/U-003.
- TDD focus: U-001's cross-domain concurrent-acquire property test is the highest-priority integration test in this entire 4-domain set — it is the one property that cannot be verified by testing either domain in isolation. U-002's server-side test (per U-002-B1's actual predicate: `disclosureAcknowledged:true` AND `planId` provenance from this server's own `planRestore` — not an invented server-tracked acknowledgment record) and U-003's stale-cache race test are next.
- Programmer audit focus: confirm `core/operation-lock.ts` has exactly one implementation, consumed identically by both domains; confirm `confirmRestore` rejects unless both halves of U-002-B1's composite predicate hold (the flag AND `planId` provenance) — do not implement or look for a separate server-tracked "acknowledgment" record, `state.spec.md` defines none; confirm `planRestore` never reuses a cached `costClass`.
- Open risks or ambiguities: OQ-03 (authorize() behavior when content.db is unreadable) remains unresolved — see ADR-PIPE-019's Consequences section for the explicit routing recommendation to Coordinator.
