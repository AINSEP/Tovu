# GOV-ADR-001: Gated-Mutation Gateway and Watermark Chokepoint Are Shared, Not Reimplemented

- **Status:** ACCEPTED
- **Enforcement:** MANDATORY
- **Date:** 2026-07-15
- **Author:** Software Architect (Claude Sonnet 5, Agent Direct Mode)
- **Scope Globs:** `src/features/**; src/core/gated-mutations/**`

## Rule

Any human-confirm, high-blast-radius mutation (forward migration, restore, destructive cleanup, or similar) MUST be implemented by calling `core/gated-mutations`'s exported `plan()`/`confirm()`/`execute()` orchestrator — never by hand-rolling an independent plan/confirm/execute sequence. Any write chokepoint that wants its writes counted toward the discarded-write-window disclosure MUST call `core/gated-mutations`'s `stampWatermark()` inside its own transaction, and MUST name itself explicitly in its own spec's `## Integration Contracts` section.

## Why

Four independent ADRs (ADR-041 Storage/Timeline, ADR-043 Collections, ADR-044 Categories & Tags, ADR-045 Backups/Recovery) each needed this exact mechanism, and ADR-041 §5's own six-round audit history is direct empirical evidence that describing it informally in each domain's own prose does not converge — every review round found a fresh inconsistency the previous round missed. SPEC-016/ADR-PIPE-016 extracted the mechanism into one shared, tested module specifically to close that drift permanently. Allowing a future domain to reimplement it independently would silently reopen the exact defect class this decision exists to close.

## Enforcement

- [ ] Linter rule: N/A — no static-analysis signature reliably distinguishes a hand-rolled gated-mutation sequence from a legitimate one; enforced by review instead.
- [ ] CI check: any new `sqliteTable` export suggesting a ledger/audit/revision row triggers the write-path coverage-class classification obligation ADR-041 item 5 already establishes (inherited, not reinvented by this rule).
- [x] Code review checklist item — Code Review Agent treats a hand-rolled plan/confirm/execute sequence, or a write chokepoint stamping the watermark outside `core/gated-mutations.stampWatermark()`, as a Required finding.
- [x] adr-governance skill path-match lookup — any change under `src/features/**` that introduces a new gated mutation or write chokepoint resolves this ADR via its scope globs.
- [ ] Manual review only.

## Comply-or-Explain (DEFAULT rules only)

N/A — this is a MANDATORY rule, not DEFAULT. No comply-or-explain path exists; a deviation requires a Coordinator-approved exception recorded in `ADR-EXCEPTIONS.md` with a rationale strong enough to survive the same scrutiny ADR-041's six audit rounds already applied to the alternative.

## Consequences

**Positive:** A single, hardened implementation of the highest-blast-radius mutation pattern in this codebase, instead of N independently-drifting ones. Every dependent domain inherits the Red-Team hardening already applied to `core/gated-mutations` (5 rounds against SPEC-016 alone) without re-deriving it.

**Negative:** A future domain with a genuinely novel ceremony shape that doesn't fit plan→confirm→execute must either adapt to this shape or justify a real exception — some friction is intentional here, since the friction is what prevents drift.

## Re-evaluation Triggers

- A third genuinely distinct ceremony *shape* emerges (not just a third consumer of the existing shape) — re-evaluate whether a more general orchestrator is warranted.
- 3+ exceptions recorded against this rule within 90 days.

## Related

- Origin: `ADS-memory/reports/pipeline/016-content-admin-core-contract/adr.md` (ADR-PIPE-016)
- Supersedes: none
- See also: ADR-041 (Storage/Timeline, primary source), ADR-043 (Collections §6), ADR-045 (Backups/Recovery §3), ADR-021 (identity & authorization)
