# ADR-PIPE-020: Collections — Content-Type Registry, Entries, and DDL-Safe Index Provisioning

- Status: ACCEPTED
- Date: 2026-07-15T11:00:00Z
- Spec: SPEC-020 v1.3.0 (hash: sha256:c678a2a9bae047245654e4998089e4905fe52aaa6e80389ec7dadb122028efff)
- Author: Software Architect (Claude Sonnet 5, Agent Direct Mode) / Leona Burime

## Constitution Check

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | N/A | Constitution unfilled template. |
| II — Test-First | N/A | Same. |
| III — Simplicity Gate | N/A | Same. |
| IV — Anti-Abstraction Gate | N/A | Same — spec's own note already establishes the gateway instantiation has a proven 3-consumer pattern (Storage/Recovery/Collections), not speculative. |
| V — Integration-First Testing | N/A | Same. |
| VI — Security-by-Default | N/A | Same — REQ-02-REQ-04's grammar/reserved-key/kind-enum injection prevention stands on ADR-043's decision. |
| VII — Spec Integrity | N/A | Same. |
| VIII — Observability | N/A | Same. |

No EXCEPTION rows. Complexity Justification filled anyway per this pipeline's established practice.

## Research Summary

- Research artifact: N/A — no new technology choice.
- Key decision: implement Collections as two separate Tier-2 libraries — `src/features/content-types/` and `src/features/entries/` — exactly as ADR-043 itself already specifies, each with its own `write-service.ts` chokepoint, sharing a fixed core-owned `kind`→`CAST` lookup table for DDL-safe index provisioning, and instantiating `core/gated-mutations` only for the final destructive cleanup ceremony.

## Planning Preflight Evidence

- Coordinator Planning Preflight: PASS
- Spec hash verified at: 2026-07-15T05:35:00Z, re-confirmed after the SPEC-006→SPEC-020 renumbering pass at 2026-07-15T07:00:00Z.
- Red-Team status and artifact: `cleared_for_architect`, round 4, 0 BLOCKING — `ADS-memory/reports/pipeline/020-collections/red-team-findings-round4.md`.
- System Blueprint status and artifact: none — same brownfield rationale as SPEC-016/017/018/019 (ADR-043's own 4-round debate + 6-round audit already did the design-level work).
- CodeBase Analyzer reports consumed: none exist; direct-codebase verification below.
- Reverse-spec artifacts consumed: N/A.
- Validator result or waiver: PASS, exit 0.

## Context

Collections is the first real build of ADR-022's long-deferred content-type-registry engine: an operator defines a content type's fields entirely through the admin UI, and the system provisions the underlying storage and query capability with zero developer code or migration. This is architecturally the highest-risk domain among the four dependents on a specific axis: it accepts *operator-authored* schema (field names, kinds) that ultimately drives generated DDL for index provisioning — a direct SQL-injection-shaped attack surface if handled naively. It is also the most combinatorially complex domain, with REQ-26/27/29/30 together specifying four distinct, must-not-be-conflated cases for how a full-replacement field-set update affects index provisioning.

System drivers:
- **DDL-injection risk**: index provisioning must map an operator-supplied field `kind` to a SQL `CAST` expression — the single highest-severity correctness requirement in this entire 4-domain set if implemented naively (string interpolation).
- **Combinatorial field-update correctness**: REQ-26 (full-replace), REQ-27 (kind change), REQ-29 (queryable flip), REQ-30 (both change together, or a field is newly introduced) must compose correctly, not be treated as four independent, potentially-conflicting rules.
- **Brownfield, established convention**: confirmed directly against the codebase — no `content_types`/`entries` tables exist; ADR-043 itself already specifies the exact module split (`src/features/content-types/`, `src/features/entries/`) and cites the existing `settings/write-service.ts` + `settings/purge-service.ts` precedent for the deprecate→tombstone lifecycle shape.
- **Cross-spec citation, not restatement**: the destructive cleanup ceremony is this domain's third instantiation of `core/gated-mutations` (after Storage and Recovery) — G-04's rule-of-three is satisfied by this exact consumer.

## Decision

Implement Collections as two Tier-2 libraries per ADR-043's own explicit direction: `src/features/content-types/` (the registry write-service, grammar/reserved-key/kind validation, index provisioning) and `src/features/entries/` (entry CRUD, field-bag validation against the current schema). Index provisioning maps a field's `kind` through a fixed, core-owned lookup table to its `CAST` SQL literal — never string-interpolating any operator-supplied value into DDL. The destructive cleanup step (`domain="collections"`, `action="cleanup"`) is implemented by calling `core/gated-mutations`'s exported orchestrator, distinct from the ordinary deprecate/tombstone transitions, which follow the existing `settings/write-service.ts` shape directly.

**Pattern(s) selected:** Two-library rule-of-two vertical slice (per ADR-043's own direction) + a fixed, closed lookup table for DDL generation (never dynamic SQL construction from operator input) + selective gated-mutation instantiation for cleanup only.

## Default Heuristic Alignment

- Default heuristic: modular monolith, vertical slices, hexagonal boundaries only where justified.
- Alignment: **FOLLOWS**
- Notes: The two-library split (content-types vs. entries) is itself already the established, Accepted decision (ADR-043) — this ADR does not reopen it, only implements it faithfully.

## Rationale

- Driver 1 (DDL-injection risk) → addressed by a fixed, closed `kind`→`CAST` lookup table — structurally impossible to interpolate arbitrary text, not merely validated-then-trusted.
- Driver 2 (combinatorial field-update correctness) → addressed by treating REQ-27/REQ-29/REQ-30 as composable rules resolved from a field's *post-call* state, not four independent branches.
- Driver 3 (brownfield + established convention) → addressed by following ADR-043's own explicit module names and the existing settings precedent.
- Driver 4 (rule-of-three) → addressed by citing this as the third `core/gated-mutations` consumer (after Storage, Recovery), satisfying G-04 directly.

## Pattern Evaluation

| Pattern | Fit Band | Adaptability | Evidence Basis | Pros | Cons | Key Tradeoffs | Verdict |
|---------|----------|--------------|----------------|------|------|---------------|---------|
| Fixed, closed `kind`→`CAST` lookup table for index DDL | Strong fit | High | measured (REQ-04's own explicit requirement; direct grep confirms no such table exists yet, greenfield) | Structurally eliminates DDL injection — there is no code path where operator text reaches a DDL string, by construction | New field kinds require a core code change, not just an operator action | Deliberately less flexible in exchange for being provably safe | **SELECTED** |
| Validate-then-interpolate (allow-list check, then build DDL string from the validated `kind`) | Rejected | Medium | measured (this is what AC-06's adversarial test case is specifically designed to catch) | Slightly more flexible (any validator-passing string could theoretically be used) | A validator bug or a future validator relaxation could reopen injection — the safety property depends on the validator being perfect forever, not on the mechanism being structurally incapable | Not selected — trades a provable safety property for marginal flexibility with no stated need |
| Two-library split (content-types + entries) per ADR-043 | Strong fit | High | measured (ADR-043's own explicit direction; matches every sibling feature's shape) | Matches established convention exactly | — | — | **SELECTED** |
| Single combined `collections` library for both registry and entries | Rejected | Medium | measured (directly contradicts ADR-043's own explicit two-library direction) | Slightly less file-count overhead | Diverges from the already-Accepted architecture decision with no new driver justifying the change | Not selected — this ADR does not reopen an already-settled decision |

## Quality Attribute Scorecard

| Axis | Definition | Score (1-5) | Confidence | Strengths | Weaknesses | Rationale | Assumptions | Activation Source | Mitigation / Owner / Enforcement / Deadline | Review Trigger | Delta vs Runner-up |
|---|---|---|---|---|---|---|---|---|---|---|---|
| modifiability | Cost of adding a new field kind or changing index-provisioning logic | 3 | measured | Single lookup table is the one edit point for a new kind | Adding a kind requires a core code change (deliberate) | The friction is intentional — REQ-04 explicitly requires this, trading modifiability for a structural safety guarantee | — | always-on | — | — | +2 vs. a dynamic-kind-string approach on safety; -1 on raw modifiability, an accepted tradeoff |
| modularity | Boundary clarity between content-types and entries libraries | 4 | measured | Matches ADR-043's own explicit two-library direction; entries only reads the content-type's current schema, never writes it | The two libraries must agree on the schema-validation contract exactly | Reuses an already-Accepted, audit-hardened architecture decision rather than inventing a new boundary | — | always-on | — | — | 0 vs. runner-up (a single-library alternative was rejected outright, not a close call) |
| scalability | Index-provisioned query performance at content scale | 4 | measured | AC-10's workspace-scoped index-identity requirement prevents cross-workspace collisions at any scale | Queryable-field cap (20) unbenchmarked (OQ-01) | The one performance-relevant mechanism (per-field indexes) is exactly what REQ-04's design targets | — | always-on | — | Benchmark owed before this ADR's own sign-off per OQ-01's stated deadline | 0 vs. runner-up |
| reliability | Correctness of the field-update index-provisioning combinatorics (REQ-26/27/29/30) | 5 | measured | Every combination (kind-only change, queryable-only change, both together, new field) is independently ACed and cross-referenced (REQ-30 explicitly resolves the "both change together" case) | This is genuinely intricate logic — the highest defect-risk surface in this domain | This is exactly the class of "four rules that must compose, not conflict" risk this ADR's own CIC exists to make Binding, not just documented | — | always-on | — | — | +2 vs. an implementation treating each REQ independently without an explicit composition rule |
| security | DDL-injection prevention | 5 | measured | Fixed, closed lookup table structurally prevents operator text from ever reaching a DDL string; grammar/reserved-key checks run before any DDL is even considered | — | This is the single highest-security-relevance requirement in the entire 4-domain pipeline — a SQL-injection-shaped attack surface via a legitimate admin feature | — | always-on | — | — | +2 vs. validate-then-interpolate |
| operability | Observability of content-type lifecycle and entry mutations | 4 | assumed | `content_type_revisions`/`entry_revisions` ledgers provide durable audit trails; outbox events reach downstream consumers | No metrics/tracing requirement stated | Strong audit trail by construction, matching every sibling domain's own ADR-022 discipline | — | always-on | — | — | 0 vs. runner-up |
| cost | Implementation cost | 4 | assumed | Reuses `core/gated-mutations` for cleanup only (the one genuinely novel piece); everything else follows established conventions | The combinatorial field-update logic (REQ-27/29/30) is real, irreducible complexity | Most of this domain's cost is in getting the field-update combinatorics right, not in inventing new architecture | — | always-on | — | — | 0 vs. runner-up |
| testability | Ease of testing DDL safety and field-update combinatorics | 5 | measured | Every injection attempt has a named adversarial AC (AC-05, AC-06); every field-update combination has a named AC (AC-43, AC-52-AC-55) | — | This domain's spec already enumerates the exact adversarial and combinatorial test matrix a CIC needs — minimal additional derivation required | — | always-on | — | — | +1 vs. a spec without explicit adversarial/combinatorial ACs |

## Overall Strengths

- The DDL-injection prevention mechanism is structurally safe (a closed lookup table), not merely validated — the strongest possible security posture for this concern.
- The field-update combinatorics (REQ-26/27/29/30) are fully specified with explicit composition rules, not left to independent, potentially-conflicting implementations.
- Faithfully implements an already-Accepted, heavily-audited architecture decision (ADR-043, 4-round debate + 6-round audit) rather than reopening any of its settled questions.

## Overall Weaknesses

- Adding a new field `kind` requires a core code change — an accepted, deliberate friction, not an oversight.
- The queryable-field cap (20) and cleanup retention window (30 days) are both Spec Agent `SAFE DEFAULT` values, unbenchmarked (OQ-01/OQ-02).

## Tradeoff Tension

We are trading field-kind extensibility (a new kind requires a core code change) for a structural, provable guarantee that no operator-supplied string ever reaches generated DDL.

## Why This Won

The fixed lookup-table approach is the only candidate that makes DDL-injection safety a structural property rather than a validation-dependent one — directly addressing this domain's single highest-severity risk. The two-library split and gated-cleanup-only decisions are not fresh choices this ADR makes; they are faithful implementations of ADR-043's own already-Accepted, already-audited direction.

## Runner-Up Comparison

- Runner-up: validate-then-interpolate (build the DDL string from an operator `kind` string after passing an allow-list check).
- Why it lost: the safety property would depend on the validator being correct forever, rather than being structurally impossible to violate — exactly the shape of defect AC-06's adversarial test case (a `kind` value containing a SQL-injection payload) is designed to catch. A validator bug, typo, or future relaxation could silently reopen the vulnerability; a closed lookup table cannot.

## Consequences

**Positive:**
- DDL-injection is structurally prevented, not merely tested against.
- Field-update combinatorics are fully composable and specified, closing a class of defect (partial/conflicting rule implementation) before it can occur.
- Faithful to an already-heavily-audited architecture decision — no re-litigation risk.

**Negative / Tradeoffs:**
- New field kinds require a core code change, not an operator-facing extension point.
- The queryable-field cap and retention window remain unbenchmarked defaults.

**Risks:**
- Risk: a future maintainer "simplifies" the lookup table into a more dynamic mapping for convenience, silently reopening the DDL-injection risk. Plan: Code Review Agent treats any DDL-generation code path that does not route through the fixed lookup table as a Required (blocking) finding.
- Risk: REQ-27/REQ-29/REQ-30's composition rule is implemented as three independent branches instead of a single post-call-state resolution, silently breaking the "both change together" case (REQ-30/AC-55). Plan: this ADR's CIC designates this exact composition as a Binding constraint.

## Mitigations Required

No axis scored ≤2.

## Migration Safety (required for brownfield, reverse-spec, or migration work)

| Safety Item | Decision / Evidence | Owner |
|---|---|---|
| Expand/contract shape | Purely additive: new `content_types`/`entries`/`content_type_revisions`/`entry_revisions` tables in `content.db`; `posts`/`pages` are explicitly untouched (ADR-043's own scope boundary, confirmed by direct schema.ts read — no `content_types`/`entries` exist today). | This ADR |
| Dual-write or read-routing plan | N/A — no prior content-type-registry mechanism exists (ADR-022's engine was deferred, never built). | This ADR (N/A confirmed) |
| Backfill plan | No historical content-type/entry data exists; `posts`/`pages` are explicitly NOT migrated onto `entries` in this pass (OQ-03, deliberately deferred). | This ADR |
| Reconciliation checks | REQ-19's write-time existence/workspace-ownership validation for `entries.type`, tolerant of orphan-on-read. | `features/entries` |
| Observability proving phase health | `content_type_revisions`/`entry_revisions` ledgers are the built-in audit surface. | `features/content-types`, `features/entries` |
| Rollback test | The cleanup ceremony's own failure modes (`PLAN_STALE`, etc.) are its abort-before-mutation paths, already SPEC-016-covered. Ordinary mutations have no rollback beyond normal transaction abort. | `features/content-types`, `features/entries` |
| Cutover approval and timing | N/A — no cutover; purely additive capability. | N/A |
| Point of no return | Cleanup `execute()`'s atomic multi-table delete (REQ-21) — permanently removes the content type and every scoped entry/revision row in one transaction. | `features/content-types` (delegating to `core/gated-mutations`) |
| Post-cutover verification | N/A. | N/A |

## Re-evaluation Triggers

- Calendar trigger: none stated; re-evaluate once real-world queryable-field usage data exists to validate or revise the 20-field cap.
- Scale trigger: queryable-field cap or cleanup retention window needs adjustment based on real usage (OQ-01/OQ-02).
- Topology trigger: none specific beyond SPEC-016's own.
- Dependency trigger: any future decision to migrate `posts`/`pages` onto `entries` (OQ-03) would require re-evaluating this ADR's scope boundary.

## Module / Service Boundaries

```
src/features/content-types/          # Per ADR-043's own explicit direction
  ports.ts
  types.ts
  write-service.ts        # Registry chokepoint: grammar/reserved-key/kind validation (fixed order,
                          #   REQ-24), watermark stamp, content_type_revisions append, index
                          #   provisioning delegation
  index-provisioning.ts    # The fixed kind->CAST lookup table (CIC U-001) + REQ-27/29/30's
                            #   composed index provisioning/teardown logic (CIC U-003)
  lifecycle.ts              # deprecate/reactivate/tombstone transitions, mirroring
                             #   settings/write-service.ts's existing precedent exactly
  cleanup.ts                 # planCleanup/confirmCleanup/executeCleanup — calls core/gated-mutations
                              #   (domain="collections", action="cleanup")
  repo.memory.ts, repo.sqlite.ts
  agent-tools.ts
src/features/entries/                 # Per ADR-043's own explicit direction
  ports.ts
  types.ts
  write-service.ts        # Entry chokepoint: field-bag validation against current schema (REQ-14),
                          #   watermark stamp, entry_revisions append
  repo.memory.ts, repo.sqlite.ts
  agent-tools.ts
apps/admin/src/sections/Collections.tsx   # Shared UI screen, per ADR-043's own direction
core/gated-mutations/                      # EXISTING (ADR-PIPE-016) — imported for cleanup only
```

## API / Event Contract Summary

- Admin routes under `/api/admin/v1/content-types` and `/api/admin/v1/entries`, per ADR-043's own direction.
- `collections_plan_cleanup` / `collections_execute_cleanup` — this domain's third instantiation of `core/gated-mutations` (satisfying G-04's rule-of-three alongside Storage and Recovery).
- Error codes: `RESERVED_CONTENT_TYPE_KEY`, `INVALID_KEY_GRAMMAR`, `INVALID_FIELD_NAME_GRAMMAR`, `INVALID_FIELD_KIND`, `QUERYABLE_FIELD_CAP_EXCEEDED`, `CONTENT_TYPE_NOT_ACTIVE`, `CONTENT_TYPE_NOT_FOUND`, `ENTRY_SLUG_CONFLICT`, `CLEANUP_NOT_ELIGIBLE`, plus SPEC-016's reused gateway codes.

## Enforcement

- Code Review Agent treats any DDL-generation code path that does not route through the fixed `kind`→`CAST` lookup table as a Required (blocking) finding.
- Code Review Agent treats a hand-rolled cleanup sequence bypassing `core/gated-mutations` as a Required finding (per GOV-ADR-001).
- Code Review Agent treats an implementation of REQ-27/REQ-29/REQ-30 as three independent, non-composing branches (rather than resolved from post-call state) as a Required finding.

## Complexity Justification

| Article Violated | Why This Complexity Is Needed | Simpler Alternative Considered | Why Simpler Alternative Was Insufficient |
|-----------------|-------------------------------|-------------------------------|------------------------------------------|
| IV — Anti-Abstraction Gate (N/A, no ratified article — applied as a discipline anyway) | The generic `{domain}`/`{action}` gated-mutation gateway is instantiated a third time here (after Storage and Recovery), satisfying SPEC-016 G-04's rule-of-three for the pattern generally — but this domain's own composed field-update logic (REQ-27/29/30) is domain-specific complexity, not a reusable abstraction; it exists because operator-driven schema evolution genuinely has four distinct index-provisioning cases that must compose correctly. | Treat each of REQ-26/27/29/30 as independent, non-interacting rules. | REQ-30 explicitly names the "both kind and queryable change in one call" case as one neither REQ-27 nor REQ-29 alone covers — an independent-rules implementation would leave this case ungoverned, exactly the gap REQ-30 exists to close. |

## Related Decisions

- Supersedes: none.
- Relates to: ADR-043 (Collections, primary source), ADR-022 (content-model registry — this is its first real build), ADR-023 (index-provisioning ledger, snapshot-before-DDL carve-out), ADR-041 (index-provisioning execution path, owned by SPEC-017), ADR-PIPE-016 (core contract, cleanup's gateway), ADR-021 (identity/authorization), ADR-009 (outbox discipline).

## Brownfield Grounding (direct codebase verification, this ADR)

- Confirmed via `src/infra/db/schema.ts`: no `content_types`/`entries` tables exist yet.
- Confirmed via `src/features/settings/purge-service.ts`: the existing tombstone/purge precedent this spec's Agent Directives point to is a direct, `authorize()`-gated single-call destructive purge (no plan/confirm/execute) — this is the correct precedent for Collections' ordinary deprecate/tombstone *transitions*, but NOT for the final cleanup step, which SPEC-020 REQ-20 explicitly requires to go through the gated-mutation gateway instead (instantiating SPEC-016 REQ-08, per GOV-ADR-001) — a stricter bar than settings' own purge, appropriate given Collections' cleanup is a full multi-table cascade delete, not a scoped value-row purge.
- Confirmed via ADR-043 §"Wiring into the existing codebase": the two-library split (`src/features/content-types/`, `src/features/entries/`) is already the ADR's own explicit direction — this ADR follows it rather than choosing a fresh module boundary.

## Implementation Outline: PRODUCED

Triggers: Boundary Cross (crosses `core/gated-mutations`, two new libraries, `infra/db/schema.ts`), Contract Change (new routes, agent tools, error codes across both libraries), Data And Persistence (4 new tables), Brownfield Dependency (explicitly leaves `posts`/`pages` untouched), Critical Cross-Boundary Invariant (INV-01 through INV-10, the largest invariant set among the four dependents). See `ADS-memory/reports/pipeline/020-collections/implementation-outline.md`.

## Critical Internal Constraints: PRODUCED

Designated units: U-001 (fixed kind→CAST lookup table + field-name grammar gate, DDL-injection prevention — Security-Critical Sequencing; revised 2026-07-15 per `/audit-work` — 3 independent auditors converged on the original designation covering only `kind`, leaving field-name DDL-safety undesignated; U-001-B2 now closes this), U-002 (fixed definition-time guard order, REQ-24 — Security-Critical Sequencing, mirrors SPEC-018's U-001 pattern), U-003 (field-update index-provisioning composition, REQ-27/29/30 — Algorithmic Correctness), U-004 (expectedVersion-checked-first ordering, REQ-26 — Concurrency/Ordering). See `ADS-memory/reports/pipeline/020-collections/critical-internal-constraints.md`.

## Governance ADR Promotion

**Evaluated, promotion warranted.** The fixed-lookup-table DDL-safety pattern is a genuine cross-cutting rule: any future domain that generates DDL from operator-supplied metadata (a field kind, a column type, an index expression) must route it through a closed, core-owned lookup table — never interpolate operator-supplied text into DDL directly. Promoted to `ADS-memory/governance/adrs/GOV-ADR-003-ddl-generation-never-interpolates-operator-input.md`; `ADR-INDEX.md` updated.
