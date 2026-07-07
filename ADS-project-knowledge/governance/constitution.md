# Tovu Constitution

- Version: 1.0.0
- Ratified: 2026-07-07
- Last Amended: 2026-07-07

> Bootstrapped by the Coordinator from the articles the v1 spec suite (SPEC-001…005)
> already applies by name in its Constitution Compliance tables, plus the governing ADRs
> (ADR-006 rule-of-two, ADR-007 workspace scoping, ADR-008 change-sets, ADR-015 Drizzle).
> This is a faithful codification of de-facto practice, not a new policy — **owner
> ratification is still recommended**; amend any article that doesn't match intent via the
> Amendment Log. The Spec Agent and Software Architect read this file on every run.

---

## Article I — Library-First

Prefer a maintained, widely-used library over a custom implementation for any problem a
library already solves well. Custom code is legitimate for domain logic and for cases
where the library tradeoff is genuinely unfavorable — but that choice must be conscious
and recorded, not a default.

**Complies if:** No custom implementation exists where a maintained library (healthy
maintenance, meaningful adoption) solves the same problem, *unless* the ADR carries a
Complexity Justification entry for it.

**Exception process:** Document in the ADR Complexity Justification table: the library
evaluated, its version, and the specific reason it was rejected (e.g., charset/rule
control, zero-dependency posture, security-boundary ownership). Known open Art. I decisions
carried from Red-Team: SPEC-002 slug library, SPEC-003 CLI framework, SPEC-004 CSS
sanitizer (build-vs-adopt — the ecosystem's security boundary; highest priority).

---

## Article II — Test-First (NON-NEGOTIABLE)

Behavior is specified as tests before it is implemented. The TDD Agent certifies failing
tests against the active spec before the Programmer writes implementation code.
Pre-pipeline draft code (e.g. `src/core/commands/*`) is reconciled *against* certified
tests — it is never treated as ground truth.

**Complies if:** Certified, initially-failing tests derived from the spec's ACs/INVs/ECs
exist and are recorded before implementation code is written for that unit.

**Exception process:** None. This article is non-negotiable. Draft/spike code may exist but
must be re-derived through certified tests before it counts as delivered.

---

## Article III — Simplicity Gate

Every module, endpoint, and abstraction must trace to a present requirement. No speculative
generality, no complexity added for a future that isn't in the current spec.

**Complies if:** Each new module/abstraction maps to at least one REQ/AC in the active spec
(reserved-but-unused vocabulary is allowed only when the spec explicitly reserves it, as
ADR-008 does for `proposed`/`discarded`).

**Exception process:** Document the added complexity and its near-term driver in the ADR
Complexity Justification table.

---

## Article IV — Anti-Abstraction Gate (Rule-of-Two)

Per ADR-006, do not introduce a port/adapter seam without two real implementations, or a
concrete, near-term second implementation on the roadmap. One abstraction, two adapters —
otherwise it's premature indirection.

**Complies if:** Each new port has ≥2 adapters, or a documented rule-of-two plan naming the
second (e.g. `ChangeSetRepoPort`: in-memory now + Phase-1 SQLite; the Drizzle SQL layer
satisfies rule-of-two via a shared schema per ADR-015).

**Exception process:** Justify a single-adapter port in the ADR (why the seam earns its
keep before the second adapter lands).

---

## Article V — Integration-First Testing

The P1 acceptance criteria that define a feature's contract are verified at the integration
boundary (the HTTP route / real adapter) wherever a boundary exists — not only as isolated
unit tests.

**Complies if:** Every P1 AC with an HTTP or cross-module surface has integration-level
coverage at that surface.

**Exception process:** Document why a given P1 AC is unit-only (no meaningful integration
boundary) in the traceability matrix or ADR.

---

## Article VI — Security-by-Default

Secure defaults are the baseline: input is validated, authorization is enforced per action,
and secrets/PII are never exposed. No endpoint reaches a non-local environment without
authentication and authorization.

**Complies if:** No endpoint is deployed beyond the local dev server without authn + per-action
authz, and no sensitive payload (e.g. `inversePayload` content snapshots) is exposed over HTTP.

**Exception process (STANDING, v1):** The Tovu dev server has no auth layer yet. Local-dev-only
endpoints may run unauthenticated during v1 **provided** each such spec records the Art. VI
EXCEPTION explicitly (as SPEC-001…005 do), Security Agent review still runs, workspace scoping
is enforced structurally via path param (ADR-007), and named-action authz
(`admin.change-sets.read`, `admin.change-sets.revert`, …) arrives with the permissions feature
before any non-local deployment. Destructive surfaces (e.g. change-set `revert`) must be built
with the actor/permission context in their signature from day one so authz is not a breaking
retrofit (Red-Team RT-007).

---

## Article VII — Spec Integrity

The spec is ground truth. Every downstream artifact references the active spec's ID, version,
and content hash. A hash mismatch is a blocking stop, treated like a failed build.

**Complies if:** Each downstream stage (Architect, TDD, Programmer, review) cites the current
`spec_hash` recorded in the feature's `pipeline-state.md`.

**Exception process:** None. Resolve the mismatch (re-validate / re-hash the spec, or update
the reference) before proceeding.

---

## Article VIII — Observability

Key paths are instrumented: errors are structured and machine-readable, meaningful state
changes emit events, and work is correlatable across the write path.

**Complies if:** New write paths emit structured errors (registry-defined codes) plus domain
events carrying a correlation id (e.g. `changeSetId` on `change-set.applied`/`.reverted`).

**Exception process:** Deferred observability fields are allowed when the spec names the
deferral and the downstream owner (e.g. SPEC-001 defers `occurredAt`/`correlationId` to the
observability feature and uses `changeSetId` as the in-scope correlation id).

---

## Governance

- This constitution supersedes all other project practices.
- Amendments require: written rationale, human approval, and a migration plan for in-flight work.
- All ADRs must include a Constitution Check section.
- Unjustified violations are a blocking escalation — the Coordinator treats them the same as a spec hash mismatch.

## Amendment Log

| Version | Date | Article | Change | Rationale |
|---------|------|---------|--------|-----------|
| 1.0.0 | 2026-07-07 | All | Initial ratification — bootstrapped from the de-facto articles applied across SPEC-001…005 + ADR-006/007/008/015 | Constitution was previously unbootstrapped; every spec ran on toolkit-default articles + the standing Art. VI no-auth exception. Codified before the Software Architect stage (Red-Team RT-007 leans on Art. VI). |
