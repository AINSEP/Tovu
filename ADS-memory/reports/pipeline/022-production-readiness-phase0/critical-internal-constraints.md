# Critical Internal Constraints: Production Readiness Phase 0 — Capability Inventory & Runtime-Mode Containment

- Spec: SPEC-022 v1.0.0 (hash: sha256:1d326b48d3adf4001f5d088f18d75221a71c49caa38231c99f26e4fc183cca1e)
- ADR: ADR-046
- Implementation Outline: `ADS-memory/reports/pipeline/022-production-readiness-phase0/implementation-outline.md`
- Prior designations consulted: none found — `mail/ports.ts`/`MailerPort` has no prior CIC artifact in this repo (first time this port has been touched under a CIC-aware Software Architect pass)
- Status: PRODUCED
- Trigger result: Security-Critical Sequencing Constraint (1 unit)
- Source sync: verified 2026-07-16T00:00:00Z
- Date: 2026-07-16T00:00:00Z
- Author: Software Architect (in-session, direct)

> One designated unit. This is not a broad CIC pass — every other contract in the outline (C-001 through C-004) was checked against the four-part test and did not qualify: C-001/C-002 are pure data/lookup with no plausible-wrong-but-contract-satisfying implementation shape; C-003's aggregation risk is a completeness/UX concern (an operator gets an incomplete failure report), not a correctness/security break, so it stays as an outline Aggregate-Risk Note rather than a CIC unit; C-004 is a straightforward classification lookup with no internal state or ordering to get subtly wrong.

## Trigger Decision Matrix

| Trigger | Applies? | Designated Unit(s) | Plausible Wrong Implementation | Broken Property | Required Constraint | Source Trace |
|---|---:|---|---|---|---|---|
| Algorithmic Correctness Constraint | no | — | — | — | — | — |
| Stateful Protocol Constraint | no | — | — | — | — | — |
| Concurrency / Ordering / Idempotency Constraint | no | — | — | — | — | — |
| Security-Critical Sequencing Constraint | yes | U-001 | Default an unrecognized/unmapped lane-discriminator value to the interactive (permissive) lane — e.g. `lane === "notification" ? gate() : proceed()`, which silently treats "unknown" as "safe," or check only `purpose === "transactional"` for the interactive branch (the exact collision this codebase already shipped once, verified at `write-service.ts:183`/`notify-subscriber.ts:78` before this spec's fix) | A notification-lane send (e.g. a future third mailer call site, or a regression in members/forms' own field) proceeds directly in `production` mode without a durable outbox path — silently reintroducing the data-loss-on-crash defect the ADR-046 debate spent two rounds finding and fixing | The lane-resolution function must fail closed: any value it does not explicitly recognize as the interactive lane must resolve to the notification lane, never the reverse | ADR-046 Debate Fold-In item 3; feature.spec.md INV-05, EC-04, REQ-09/REQ-10 |
| Explicit Performance Budget Constraint | no | — | — | — | — | — |
| Failure / Recovery Constraint | no | — | — | — | — | — |
| Characterization Parity Constraint | no | — | — | — | — | — |

## Designated Units

| Unit ID | Name | Location (module / contract ref) | Designating Trigger(s) | Outline Refs | Trace |
|---|---|---|---|---|---|
| U-001 | Mailer lane resolution | `src/mail/purpose-scoped-mailer.ts` (`C-005`) | Security-Critical Sequencing | C-005, INV-002 | REQ-09, REQ-10, INV-05, EC-04 |

## Unit Constraints

### U-001 Mailer lane resolution

- Responsibility: given a `MailerPort.send()` call's (widened) discriminating field, decide whether the send is interactive-lane (proceed unconditionally) or notification-lane (gated on durable-outbox-readiness in `production` mode).
- Designation: Security-Critical Sequencing — a wrong-but-contract-satisfying implementation (defaulting unknown values to the permissive lane) silently reintroduces a verified, already-shipped-once defect (members/forms both tagging `purpose: "transactional"`) — required constraint: unrecognized values resolve to the restrictive lane, never the permissive one.
- Outline refs: C-005, INV-002

#### Binding Constraints

| ID | Constraint | Escalation Marker | Property Protected | Verification Surface | Trace |
|---|---|---|---|---|---|
| U-001-B1 | The lane-resolution function must classify via an explicit allowlist of known-interactive values, never via a denylist of known-notification values or any other "guess permissive by default" shape. An unrecognized value is notification-lane by construction, not by a fallback branch that could be forgotten. | ESCALATE_SECURITY | Prevents a future call site (or a mis-edited existing one) from silently landing in the permissive lane | API result: `MailerPort.send()`'s return/error shape when a notification-lane send is refused (`MAILER_SEND_REFUSED_NO_DURABLE_PATH` is observably present, not swallowed) | feature.spec.md INV-05, EC-04 |
| U-001-B2 | The discriminating field's value space must be a closed, typed union (not a bare `string`) at the `MailerSendOptions` type level, so a caller cannot pass an arbitrary string that bypasses both the interactive-allowlist and any compile-time review of new values. | ESCALATE_SECURITY | Prevents the exact class of defect found this session — two call sites converging on the same *untyped* string value without either author noticing, because nothing forced the collision to be visible at compile time | Persisted/typed state: `MailerSendOptions`'s TypeScript type definition itself is the enforcement surface — `audit-only: verified by code review / typecheck, not a runtime-observable test` | feature.spec.md REQ-09 |
| U-001-B3 | In `local`/non-`production` mode, the lane-resolution logic still runs (for observability/logging) but must never cause `MailerPort.send()` to refuse or throw. | — (not security/irreversible — this is a scope-boundary constraint, not a security one; explains why no default marker) | Prevents Phase 0's containment work from being an accidental behavior change to local/dev workflows | API result: a `local`-mode send with a notification-lane value still returns the same success/failure shape it does today | feature.spec.md INV-06, behavior.spec.md §2.2 |
| U-001-B4 | The interactive lane and the notification lane must resolve to disjoint values — no discriminating-field value may ever satisfy both `resolveLane(...) === "interactive"` and a caller's independent notification-lane check simultaneously. This is U-001-B1's allowlist rule restated as an explicit invariant on the *value space itself* (not just the resolution function's control flow), so a reader auditing `mail/ports.ts`'s `MailerSendOptions.lane` type does not need to trace into `purpose-scoped-mailer.ts` to confirm the two lanes can't collide. | ESCALATE_SECURITY | Makes the disjointness property self-contained at the type/table level, not something a reader has to reconstruct by tracing `resolveLane`'s control flow — closes the exact "not self-contained" gap the 2026-07-16 full-session audit found (agreed but deferred pending this promotion) | Persisted/typed state: `MailerSendOptions.lane`'s closed union (`"interactive" \| "notification"`) has exactly two members, and `resolveLane`'s allowlist checks only the single permissive value — audit-only: verified by code review/typecheck, not a runtime-observable test (mirrors U-001-B2's verification surface) | feature.spec.md INV-05, U-001-B1, U-001-B2 |

#### Required Ordering Constraints

| ID | Required Ordering | Property Protected | Observable Verification Surface | Escalation Marker | Trace |
|---|---|---|---|---|---|
| U-001-ORD1 | Runtime-mode resolution (C-001) must complete and be cached before the first `MailerPort.send()` call the decorator ever handles — the decorator must never resolve mode per-call from a live `process.env` read. | Prevents a mode flip mid-process (e.g. a test harness mutating `process.env` between test cases) from silently changing a send's lane-gate behavior mid-flight in a way that's inconsistent with what the rest of the process (C-003's boot gate) already decided | API result: two sends in the same process, same lane, same mode — deterministic outcome; a test that mutates `process.env` after boot and asserts the decorator does NOT observe the change | — | behavior.spec.md §2.2, C-001 |

#### Invariant References

| Reference | Source | Binding Constraint IDs Supported |
|---|---|---|
| INV-002 | implementation-outline.md Critical Invariants | U-001-B1 |
| INV-05 | feature.spec.md | U-001-B1, U-001-B2, U-001-B4 |
| INV-06 | feature.spec.md | U-001-B3 |

#### Design Context (optional, non-binding)

The allowlist-not-denylist shape (U-001-B1) and the closed-union typing (U-001-B2) are both direct responses to how the *actual* prior defect happened in this codebase: not a logic bug, but an absence of anything forcing two independently-written call sites to notice they'd converged on the same untyped string. A denylist or a loosely-typed field would satisfy every acceptance criterion in feature.spec.md on the happy path while leaving the exact same latent collision risk for call site #3. This is why the constraint is about the *type shape*, not just the runtime branch logic.

## Deviation And Promotion Protocol

(Unchanged from template — see full text in `framework/templates/critical-internal-constraints-template.md`.) U-001-B1, U-001-B2, and U-001-B4 all carry `ESCALATE_SECURITY`: any Programmer-stage deviation from any of the three requires a recorded `[CIC_DEVIATION_APPROVED]` entry before proceeding, not just a `[CIC_DEVIATION]` note.

## Downstream Handoff Notes

- Coordinator: any task touching `src/mail/purpose-scoped-mailer.ts`, `src/mail/ports.ts`'s `MailerSendOptions`, `src/members/write-service.ts`, or `src/forms/notify-subscriber.ts` must reference U-001.
- TDD focus: U-001-B1's EC-04 unknown-value case and U-001-B2's type-level closure are both must-test-first — write the adversarial "unrecognized/new lane value" test before the happy-path interactive/notification tests, per this repo's own adversarial-test-design convention (the bug that motivated this whole CIC unit was found by exactly that kind of test, not a happy-path one).
- Programmer audit focus: confirm the discriminating field's TypeScript type is a closed union at compile time (U-001-B2) — grep for the field's type declaration, confirm it is not `string`. Confirm the lane-resolution function's structure is allowlist-shaped (U-001-B1) — a `switch` with a `default: return "notification"` or equivalent, not an `if (value === "notification") gate() else proceed()`.
- Open risks or ambiguities: none beyond the "no staleness check for new call sites" gap already flagged in the Implementation Outline's Downstream Handoff Notes (out of SPEC-022's approved scope).
