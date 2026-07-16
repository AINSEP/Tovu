# Feature Spec: Production Readiness Phase 0 — Capability Inventory & Runtime-Mode Containment

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/feature.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-022 |
| version | 1.0.0 |
| status | APPROVED |
| content_hash | sha256:1d326b48d3adf4001f5d088f18d75221a71c49caa38231c99f26e4fc183cca1e |
| feature_name | FEAT-022-production-readiness-phase0 |
| last_edited | 2026-07-16T00:00:00Z |
| owner | Leon Aburime |
| spec_agent | Spec Agent (in-session, direct — Claude Code host) |
| spec_mode | greenfield |

---

## Overview

Phase 0 of ADR-046's production-readiness program. It gives Tovu a checked-in capability inventory (every route/worker classified `production`/`local-only`/`experimental`), an explicit runtime-mode signal independent of `NODE_ENV`, and fail-closed containment so a capability without its durable adapter cannot silently serve production traffic. It also folds in two small, load-bearing fixes the ADR-046 debate surfaced: a purpose-scoped mailer seam gate (closing a real lane-collision defect) and a report-only `dependency-cruiser` import-boundary baseline.

---

## Problem Statement

**Current state:** `src/server/deps.ts` (the real production composition root) silently selects in-memory, non-durable adapters for several user-visible/security-sensitive capabilities — the event outbox, change-set history, member repositories, webhook subscription/delivery, origin/egress settings, media metadata/transform registry, and the analytics buffer. Nothing distinguishes "this capability is genuinely production-ready" from "this capability is a walking skeleton that happens to be reachable." Two capability flags are actively misleading: `LocalBufferSink.capabilities()` reports `durable: true` while being explicitly process-only, and the media/mailer routes activate based on dependency presence rather than verified readiness. Mailer sends currently reach a bare `ConsoleMailerAdapter` with no gating at all — any future swap to a real SMTP adapter would immediately go live for every call site, including the notification lane (forms) that actually needs durability and the interactive lane (members) that doesn't.

**Desired state:** Every route family, worker, and scheduled capability is enumerated in a checked-in inventory with an explicit runtime classification. Production mode is an explicit, structurally-enforced signal (not inferred from `NODE_ENV`) that fails closed: it refuses to boot or refuses to serve a given capability's routes/workers when that capability's durability, security, or readiness requirements aren't met — rather than serving degraded behavior silently. A future real mailer adapter cannot activate the notification lane without a durable outbox path registered and ready, and cannot be blocked from the interactive lane that doesn't need one.

**Why now:** This is the first of ADR-046's four ordered workstreams, and the ADR's own text is explicit that later phases (durable adapters, boot lifecycle, composition split) build on this containment layer existing first. There is also a concrete, time-sensitive trigger: a recent commit already began "MailerPort shape review before the first real adapter" — meaning the mailer-seam gate this spec includes (folded in from the ADR-046 debate) needs to land before that real adapter does, not after.

**Success signal:** A capability classified `production` in the inventory without its durable adapter cannot serve traffic when the runtime-mode signal is `production` — proven by an integration test that boots the real composition in production mode with a deliberately-undurable capability and asserts refusal, not degraded service. A notification-lane mailer send in production mode without a registered durable outbox path is refused; an interactive-lane send with the same missing dependency is not (proven by a test exercising both lanes with identical `purpose` values before the vocabulary split, to show the *pre-fix* collision, and after, to show the fix).

---

## User Journey

This is an operator/CI-facing feature, not an end-user UI flow.

**Trigger:** An operator deploys Tovu with `TOVU_RUNTIME_MODE=production` set (or the deployment tooling sets it).

**Steps:**
1. The server reads the capability inventory at boot.
2. For each capability classified `production`, the server checks whether its durable adapter/security dependency is actually present and configured.
3. If any `production`-classified capability is missing its durable adapter, or a dev-only default is detected (dev secret placeholder, localhost egress allowance, always-on analytics stub), the server refuses to boot and logs which capability/check failed.
4. If all `production` capabilities pass, the server boots normally; `local-only`/`experimental` capabilities do not register their routes/workers and are absent from production traffic entirely (not present-but-erroring).
5. Separately, at request time: any mailer send routes through the purpose-scoped seam. An interactive-lane send proceeds. A notification-lane send is refused (not silently dropped, not silently sent) unless a durable outbox path is registered for that capability.

**Outcome:** An operator gets a clear boot-time failure naming the exact missing capability/adapter, instead of a server that appears healthy while serving degraded or unsafe behavior.

**Alternate paths:** In `local`/`development` mode, none of the above refusals apply — all capabilities, including `local-only`/`experimental` ones, are available exactly as they are today (this phase changes production-mode behavior only; local/dev workflows are unaffected). If `TOVU_RUNTIME_MODE` is unset, the system defaults to `local` (fail-open only in the direction of developer convenience, never fail-open toward unsafe production defaults — see INV-04).

---

## Scope

**In scope:**
- A checked-in capability inventory artifact (REQ-01).
- An explicit runtime-mode signal, independent of `NODE_ENV` (REQ-02).
- Fail-closed production-mode boot refusal for unsafe defaults and missing durable adapters (REQ-03).
- Route/worker containment for `local-only`/`experimental` capabilities in production mode (REQ-04, REQ-05).
- Explicit reclassification of currently-silent in-memory production selections (REQ-06).
- Webhook delivery worker containment until Phase 1 lands (REQ-07).
- `sharp`/media-transform readiness gating (REQ-08).
- The purpose-scoped `MailerPort` seam gate and the send-purpose vocabulary split (REQ-09, REQ-10) — folded in from the ADR-046 debate as a Phase-0.5 item, included here because it is small, load-bearing, and time-sensitive (see Why Now).
- `dependency-cruiser` report-only CI baseline (REQ-11).
- Inventory-staleness detection in CI/review (REQ-12).

**Out of scope (explicitly deferred to later ADR-046 phases):**
- Building any durable SQLite adapter for outbox/change-sets/webhooks/members/origin/media/analytics — that is Phase 1, and is itself pull-based per capability per the ADR-046 fold-in, not scheduled here.
- Resolving the BR-04/outbox-transaction-seam design question (amend BR-04, repo-owned enqueue-inside-chokepoint, or an explicit transaction-handle seam) — a separate, small pre-Phase-1 design note, not part of this spec's implementation.
- The full async boot/readiness lifecycle (`prepare`/`start`/`stop`, `/healthz`/`/readyz`, the `ModuleLifecycleStatus` contract) — Phase 2.
- Splitting `src/server/app.ts`/`deps.ts` into feature-owned modules — Phase 3.
- Making `dependency-cruiser` violations CI-blocking (only the report-only baseline is in scope here) — Phase 4.
- Any change to existing public route paths, request/response shapes, or route behavior for capabilities that already pass their production-readiness checks.

---

## Requirements

- REQ-01: The system shall provide a checked-in capability inventory artifact enumerating every route family, public worker, and scheduled/background capability composed in `src/server/deps.ts` and `src/server/app.ts`, recording for each: owner module, runtime classification (`production` | `local-only` | `experimental`), source-of-truth/persistence adapter, readiness dependencies and startup criticality (`critical` | `optional`), security dependencies, and a named restart/migration/rollback test owner.
- REQ-02: The system shall resolve an explicit runtime-mode signal (`production` | `local`) from a dedicated configuration source, never inferred solely from `NODE_ENV`.
- REQ-03: When the runtime-mode signal resolves to `production`, the system shall refuse to complete boot if any of: a dev-only secret/key placeholder is configured, a localhost/dev-only egress allowance is configured, an always-enabled analytics stub is wired as the active sink, or any capability classified `production` in the inventory lacks its durable adapter.
- REQ-04: A capability classified `local-only` or `experimental` in the inventory shall not register its routes or start its worker when the runtime-mode signal resolves to `production`.
- REQ-05: Any capability not classified `production` shall identify its runtime classification in its own readiness/response metadata when reachable in a non-`production` mode.
- REQ-06: Every capability currently selecting an in-memory adapter in the real (`deps.ts`) production composition shall receive an explicit inventory classification (REQ-01) and, if classified `production`, shall be contained per REQ-03/REQ-04 rather than continuing to serve production traffic unclassified.
- REQ-07: The webhook delivery worker (`enqueueDelivery`/`processDueDeliveries`) shall not start when the runtime-mode signal resolves to `production`, until superseded by a future Phase-1 spec that supplies its durable path.
- REQ-08: Media transform-generating routes shall verify `sharp` readiness (native binary loads successfully, resource limits configured, a passing integration-test signal) before registering as available in `production` mode; dependency presence alone shall not satisfy this requirement.
- REQ-09: Mailer sends shall route through a purpose-scoped seam capable of distinguishing an interactive/transactional-lane send from a notification-lane send on a field that does not currently collapse both lanes to an identical value; the existing `purpose: "transactional"` tag shared by `src/members/write-service.ts` and `src/forms/notify-subscriber.ts` shall be replaced or supplemented with a discriminating field sufficient for this purpose.
- REQ-10: When the runtime-mode signal resolves to `production`, a notification-lane mailer send shall be refused unless a durable outbox path is registered and ready for that send's originating capability; an interactive-lane send shall not be subject to this gate.
- REQ-11: `dependency-cruiser` shall run in CI in report-only (non-blocking) mode against a checked-in rules file enforcing at minimum: `src/core/**` may not import `src/server/**`, `apps/**`, feature modules, or concrete infrastructure adapters; feature/domain code may not import Express, route handlers, admin-app code, or direct database/SDK implementations; only bootstrap/composition modules may construct concrete adapters or select production implementations.
- REQ-12: A CI or review-gate check shall flag when a route or worker is registered in `deps.ts`/`app.ts` without a corresponding entry in the capability inventory (REQ-01).

<!-- Add more as needed. Numbers must not be reused, even if a requirement is removed. -->

---

## Acceptance Criteria

- AC-01 (REQ-01) [P1]: Given the current set of route families/workers registered in `deps.ts`/`app.ts`, when the capability inventory is generated, then every one of them has exactly one inventory entry with all six required fields populated (no blank cells).
- AC-02 (REQ-01) [P2]: Given a capability with no clear single owner module, when it is entered into the inventory, then the entry documents the ambiguity explicitly rather than guessing an owner.
- AC-03 (REQ-02) [P1]: Given `NODE_ENV=production` but the dedicated runtime-mode signal unset or set to `local`, when the server resolves its runtime mode, then it resolves to `local`, not `production` — proving the signal is not inferred from `NODE_ENV`.
- AC-04 (REQ-02) [P1]: Given the dedicated runtime-mode signal explicitly set to `production`, when the server resolves its runtime mode, then it resolves to `production` regardless of `NODE_ENV`'s value.
- AC-05 (REQ-03) [P1]: Given runtime mode `production` and a `production`-classified capability with no durable adapter configured, when the server boots, then boot fails with a message naming the specific capability and the specific missing requirement.
- AC-06 (REQ-03) [P1]: Given runtime mode `production` and a dev-only secret placeholder configured, when the server boots, then boot fails before any route registers.
- AC-07 (REQ-03) [P2]: Given runtime mode `production` and every `production`-classified capability's requirements met, when the server boots, then boot succeeds.
- AC-08 (REQ-04) [P1]: Given runtime mode `production` and a capability classified `local-only`, when the server boots, then that capability's routes return 404 (never-registered), not 200 with degraded behavior and not 500.
- AC-09 (REQ-04) [P1]: Given runtime mode `local` and the same `local-only` capability, when the server boots, then its routes register and behave exactly as they do today.
- AC-10 (REQ-05) [P2]: Given runtime mode `local` and a capability classified `experimental`, when its readiness/response metadata is inspected, then the classification is present and correctly labeled `experimental`.
- AC-11 (REQ-06) [P1]: Given the full list of capabilities the Context section names as currently in-memory in production (outbox, change sets, members, webhooks, origin, media, analytics), when the inventory is complete, then every one of them has an explicit classification — none remain silently unclassified.
- AC-12 (REQ-07) [P1]: Given runtime mode `production`, when the server boots, then `processDueDeliveries` is never invoked and no webhook-delivery worker handle is created.
- AC-13 (REQ-07) [P2]: Given runtime mode `local`, when the server boots, then webhook delivery behaves exactly as it does today (unchanged — this requirement only adds a production-mode gate).
- AC-14 (REQ-08) [P1]: Given runtime mode `production` and `sharp`'s native binary failing to load, when the server boots, then media transform routes do not register, and the failure is attributed specifically to `sharp` readiness in the boot log.
- AC-15 (REQ-08) [P2]: Given runtime mode `production` and `sharp` loading successfully with passing integration-test evidence recorded, when the server boots, then media transform routes register normally.
- AC-16 (REQ-09) [P1]: Given the pre-fix state (both `write-service.ts` and `notify-subscriber.ts` tagging sends `purpose: "transactional"`), when a test inspects both call sites' resolved lane, then it demonstrates they are indistinguishable — proving the defect existed before this spec's implementation.
- AC-17 (REQ-09) [P1]: Given the post-fix vocabulary split, when the same two call sites are inspected, then each resolves to a distinct, correct lane (members → interactive, forms → notification).
- AC-18 (REQ-10) [P1]: Given runtime mode `production`, a notification-lane send, and no durable outbox path registered for that capability, when the send is attempted, then it is refused (not silently dropped, not silently sent) with an observable, structured refusal signal.
- AC-19 (REQ-10) [P1]: Given the same conditions but an interactive-lane send, when the send is attempted, then it proceeds normally — proving the gate discriminates correctly, not just refuses everything.
- AC-20 (REQ-10) [P2]: Given runtime mode `production`, a notification-lane send, and a durable outbox path registered and ready, when the send is attempted, then it proceeds.
- AC-21 (REQ-11) [P1]: Given the checked-in `dependency-cruiser` rules file, when CI runs against a deliberately-violating fixture import (e.g. `src/core/` importing `src/server/`), then the run reports the violation and does not fail the build (report-only).
- AC-22 (REQ-11) [P2]: Given the current, unmodified `src/` tree, when the baseline `dependency-cruiser` run executes, then its report is recorded as the starting baseline (existing violations, if any, are catalogued, not silently passed).
- AC-23 (REQ-12) [P1]: Given a new route registered in `deps.ts` with no matching inventory entry, when the staleness check runs, then it flags the specific missing entry.
- AC-24 (REQ-12) [P2]: Given every currently-registered route has a matching inventory entry, when the staleness check runs, then it passes cleanly.

<!-- Rules:
  - Every REQ-* has at least one AC.
  - Every AC has a [P1], [P2], or [P3] tag.
  - P1 ACs are independently testable — each can be verified without other stories complete.
  - No AC requires knowledge of the implementation to evaluate.
  - AC numbers are never reused.
-->

---

## Invariants

- INV-01: A capability classified `production` in the inventory must never serve production traffic without its durable adapter present and configured.
- INV-02: The runtime-mode signal must never be derived from `NODE_ENV` alone.
- INV-03: A capability's own reported readiness/capability metadata (e.g. `capabilities().durable`) must never be trusted by the boot-time containment check without independent verification against the inventory — a self-reported flag is evidence, not authority (this closes the exact gap the ADR-046 debate found in `LocalBufferSink.capabilities().durable`).
- INV-04: On any ambiguous or unresolvable runtime-mode configuration, the system must default to `local`, never to `production` — a missing/malformed signal must never fail open toward weaker safety checks.
- INV-05: A notification-lane mailer send and an interactive-lane mailer send must never resolve to the same discriminating value after this spec's vocabulary fix — if they ever do again (e.g. a future third lane reintroducing a collision), the gate must fail closed (refuse) rather than silently default to "pass."
- INV-06: This phase must never alter the request/response contract of a capability that already passes its production-readiness checks today.

---

## Edge Cases

- EC-01: What happens when a capability's owner module cannot be determined unambiguously during inventory construction (e.g. shared code with no single clear owner)?
  Expected behavior: the inventory entry documents the ambiguity explicitly (AC-02) rather than assigning an arbitrary owner; this does not block the inventory from being otherwise complete.
- EC-02: What happens when `TOVU_RUNTIME_MODE` (or the chosen signal name) is set to an unrecognized value (neither `production` nor `local`)?
  Expected behavior: treated identically to unset, per INV-04 — resolves to `local`, and the resolution logs a warning naming the invalid value.
- EC-03: What happens when a capability is classified `production` but its durable adapter check itself throws (rather than cleanly returning false)?
  Expected behavior: treated as a failed check (boot refusal), never treated as a passed check — an exception during a safety check must never be interpreted as "safety confirmed."
- EC-04: What happens when a third, currently-unknown mailer call site is added after this spec ships, using a purpose value that isn't `"transactional"` and wasn't anticipated by the vocabulary split?
  Expected behavior: per INV-05, an unrecognized/unmapped purpose value fails closed (treated as notification-lane, the more restrictive gate) rather than defaulting to interactive-lane (the permissive path).
- EC-05: What happens when `dependency-cruiser`'s report-only run itself fails to execute (tool crash, misconfiguration)?
  Expected behavior: CI surfaces this as a distinct, visible failure of the reporting step itself — it must not be silently swallowed or interpreted as "zero violations found."
- EC-06: What happens when the capability inventory and the actual composed routes drift apart mid-development (a route added, inventory not yet updated, before CI catches it)?
  Expected behavior: covered by REQ-12/AC-23 — flagged, not silently tolerated indefinitely.

---

## Dependencies

| Dependency | What It Provides | Failure Mode | Fallback |
|------------|------------------|--------------|----------|
| `dependency-cruiser` (new devDependency, per ADR-046 Research Summary) | Static import-boundary/cycle analysis for REQ-11 | Tool unavailable or crashes in CI | Report-only mode means CI still passes; the reporting failure itself must be visible (EC-05) — no silent fallback to "no violations" |
| `sharp` (already installed, ADR-046 §Context correction) | Native image-transform binary for REQ-08's readiness gate | Native binary fails to load on a given deployment target | Media transform routes do not register in production mode (REQ-08); non-transform media routes are unaffected |
| Existing `identity`/`authorize()` surface | Not directly consumed by this phase — no new authz surface is introduced | N/A | N/A |
| ADR-046's own Phase 1-4 (future) | This phase's inventory and containment scaffolding is the input Phase 1's durability work consumes | Phase 1 not yet specced | None needed — Phase 0 is self-contained and does not require Phase 1 to exist first |

---

## Open Questions

- OQ-01: Should the runtime-mode signal be a new environment variable (e.g. `TOVU_RUNTIME_MODE`) or a value read from the existing site/workspace configuration store? — Owner: Software Architect (Implementation Outline stage) — Resolve by: before TDD begins for this spec.
- OQ-02: Should the capability inventory be a single checked-in Markdown/YAML file, or a small typed TypeScript module that doubles as both documentation and the actual runtime source of truth REQ-03/REQ-04's checks consult? — Owner: Software Architect — Resolve by: before TDD begins for this spec.

---

## Constitution Compliance

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | `dependency-cruiser` (REQ-11) is a maintained, widely-used import-boundary tool, per ADR-046's own Research Summary library decision — no custom AST analyzer built. |
| II — Test-First | COMPLIES | TDD Agent must certify failing tests for every REQ/AC above before Programmer implementation begins. |
| III — Simplicity Gate | COMPLIES | Every requirement traces to a named ADR-046 Phase-0 remediation item or a debate fold-in amendment; no speculative scope added. |
| IV — Anti-Abstraction Gate | COMPLIES | No new port/adapter seam is introduced by this phase — REQ-09/REQ-10's mailer seam gate wraps the existing `MailerPort`, it does not introduce a new port. The capability inventory is a data artifact, not an abstraction. |
| V — Integration-First Testing | COMPLIES | AC-05/06/08/12/14/18/19 (the P1 boot-refusal and gating criteria) all require integration-level coverage — booting the real composition, not just unit-testing a classifier function in isolation. |
| VI — Security-by-Default | COMPLIES | This phase's entire purpose is closing security-relevant silent-defaults gaps (REQ-03, REQ-06, REQ-09/10); no endpoint's authn/authz posture changes. |
| VII — Spec Integrity | COMPLIES | This spec's `spec_id`/`content_hash` is the reference for Software Architect/TDD/Programmer stages that follow. |
| VIII — Observability | COMPLIES | REQ-03/AC-05/06 and REQ-10/AC-18 both require the refusal itself to be observable/structured, not a silent no-op. |

---

## Implementation Readiness Gate

- [x] spec_id assigned and unique (verified against `ADS-project-knowledge/specs/` and `ADS-project-knowledge/reports/pipeline/` — 001-015, 021 in use; 016-020 reserved by the gated-mutations workstream; 022 is next free)
- [x] version set to correct semver (1.0.0, initial)
- [x] status set to APPROVED
- [ ] content_hash computed using the Speckit canonical hash rule and verified by the provider-local validator — pending validator run
- [x] feature_name matches the FEAT folder name exactly
- [x] Zero `[NEEDS CLARIFICATION]` markers remain in this file
- [x] All Open Questions have an owner and a resolution target date
- [x] All REQ-* items are testable and contain no vague qualifiers
- [x] All REQ-* items have at least one AC
- [x] All AC items have a [P1], [P2], or [P3] priority tag
- [x] All AC items follow Given/When/Then format
- [x] All Invariants are written as absolute, falsifiable statements
- [x] All Edge Cases have an explicit Expected Behavior
- [x] Dependencies table is complete — no blank failure mode or fallback cells
- [x] Constitution Compliance table complete — all 8 articles marked COMPLIES / EXCEPTION / N/A
- [x] Scope: in-scope list present and non-empty
- [x] Problem Statement: "Why now" field is filled
- [x] User Journey: trigger, steps, outcome, and alternate paths are present
- [x] Scope: out-of-scope list present and non-empty
- [ ] Full spec-system package present: all `PRESENT` files listed in spec-manifest.md exist — pending manifest/errors/behavior/traceability/dod file completion
- [x] behavior.spec.md complete (non-trivial mode-resolution and gate-ordering rules exist)
- [ ] traceability.spec.md complete — pending
- [ ] spec-manifest.md complete — pending
- [ ] spec-dod.md filled — pending
- [ ] spec-dod.md Spec Agent sign-off row completed; Coordinator row reserved for Planning Preflight
- [x] spec_mode is greenfield — no brownfield/reverse-spec evidence paths required

**Gate result:** PENDING — remaining package files and validator run below.

---

## Agent Directives (optional)

Always:
- Treat the ADR-046 debate's fold-in amendments (in the ADR file's "Debate Fold-In" section) as binding for REQ-09/REQ-10 — the purpose-vocabulary collision was verified by direct code read, not hypothesized.
- Resolve OQ-01/OQ-02 during Implementation Outline, not silently during coding.

Never:
- Implement any Phase 1 durable adapter as part of this spec's scope, even if it seems like "just a small SQLite table" — Phase 1 is pull-based and separately specced per the ADR-046 fold-in.
