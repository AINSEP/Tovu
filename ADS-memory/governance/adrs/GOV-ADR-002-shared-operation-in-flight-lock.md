# GOV-ADR-002: Site-Wide Gated Operations Share One In-Flight Lock

- **Status:** ACCEPTED
- **Enforcement:** MANDATORY
- **Date:** 2026-07-15
- **Author:** Software Architect (Claude Sonnet 5, Agent Direct Mode)
- **Scope Globs:** `src/features/storage/**; src/features/recovery/**; src/core/operation-lock.ts`

## Rule

Any domain implementing a gated, destructive operation (forward migration, restore, or a future equivalent) MUST consult the single shared `core/operation-lock.ts` primitive before starting, and MUST NOT implement its own independent in-flight-operation check. A site may have at most one gated operation in flight at a time, across all domains, not one per domain.

## Why

SPEC-019 (Backups/Recovery) REQ-13 requires that a migration in flight on Storage blocks a restore on Recovery, and vice versa — a genuine cross-domain concurrency boundary, not a per-screen concern. Two independent per-domain locks could each correctly report "nothing in flight on my own screen" while a concurrent operation runs on the sibling screen, silently reopening the exact race this requirement exists to prevent. This was caught during SPEC-019's Software Architect pass (ADR-PIPE-019) when the Pattern Evaluation explicitly considered and rejected the two-independent-locks design.

## Enforcement

- [ ] Linter rule: N/A — no static signature reliably distinguishes a correct shared-lock consultation from an independent reimplementation.
- [ ] CI check: none yet.
- [x] Code review checklist item — Code Review Agent treats a second in-flight-lock implementation in either `features/storage` or `features/recovery` as a Required finding.
- [x] adr-governance skill path-match lookup — any change under the scope globs resolves this ADR.
- [ ] Manual review only.

## Comply-or-Explain (DEFAULT rules only)

N/A — MANDATORY, no comply-or-explain path.

## Consequences

**Positive:** A single, correct-by-construction mutual-exclusion boundary across every current and future gated-mutation domain.

**Negative:** A small, real coupling point between otherwise-independent feature slices — any domain consulting the lock must agree on its exact API shape.

## Re-evaluation Triggers

- A third domain needs the lock — confirm the shared primitive's API still generalizes cleanly.
- 3+ exceptions recorded against this rule within 90 days.

## Related

- Origin: `ADS-memory/reports/pipeline/019-backups-recovery/adr.md` (ADR-PIPE-019)
- Supersedes: none
- See also: GOV-ADR-001 (gated-mutation gateway reuse), ADR-PIPE-017 (Storage, the sibling consumer)
