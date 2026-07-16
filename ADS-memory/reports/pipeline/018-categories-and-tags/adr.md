# ADR-PIPE-018: Categories & Tags — Shared Taxonomy Write Service

- Status: ACCEPTED
- Date: 2026-07-15T09:00:00Z
- Spec: SPEC-018 v1.3.0 (hash: sha256:0dbe6f8750aed1ea94fe94d4cfde31345207c73591cd4bbe93d52f13f3422f60)
- Author: Software Architect (Claude Sonnet 5, Agent Direct Mode) / Leona Burime

## Constitution Check

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | N/A | Constitution unfilled template. |
| II — Test-First | N/A | Same. |
| III — Simplicity Gate | N/A | Same. |
| IV — Anti-Abstraction Gate | N/A | Same — see Complexity Justification. |
| V — Integration-First Testing | N/A | Same. |
| VI — Security-by-Default | N/A | Same — REQ-07/REQ-08's workspace/lens validation stands on ADR-007/ADR-021. |
| VII — Spec Integrity | N/A | Same. |
| VIII — Observability | N/A | Same. |

No EXCEPTION rows. Complexity Justification filled anyway per this pipeline's established practice.

## Research Summary

- Research artifact: N/A — no new technology choice.
- Key decision: implement Categories & Tags as `src/features/taxonomy/`, following the exact rule-of-two feature template ADR-044 itself names and this codebase already uses elsewhere (e.g. `src/redirects/`: `ports.ts`, `types.ts`, a write-service file, `repo.memory.ts`/`repo.sqlite.ts`, `index.ts`), with one shared `taxonomies`/`terms` schema serving both hierarchical (category) and flat (tag) configurations via a single boolean, and `mergeTerm` as the domain's sole instantiation of SPEC-016's gated-mutation gateway.

## Planning Preflight Evidence

- Coordinator Planning Preflight: PASS
- Spec hash verified at: 2026-07-15T05:35:00Z (original v1.3.0), re-confirmed after the SPEC-004→SPEC-018 renumbering pass at 2026-07-15T07:00:00Z — see `pipeline-state.md`.
- Red-Team status and artifact: `cleared_for_architect`, round 4, 0 BLOCKING — `ADS-memory/reports/pipeline/018-categories-and-tags/red-team-findings-round4.md`.
- System Blueprint status and artifact: none — same brownfield self-check rationale as SPEC-016/017 (design already done via ADR-044's own 6-round audit history).
- CodeBase Analyzer reports consumed: none exist; direct-codebase verification below.
- Reverse-spec artifacts consumed: N/A.
- Validator result or waiver: PASS, exit 0.

## Context

Categories & Tags implements one shared taxonomy primitive (a `hierarchical` boolean distinguishing category from tag) over real relational tables (`taxonomies`/`terms`/`entry_terms`/`taxonomy_revisions`), replacing what would otherwise be a JSON-array-on-content-row anti-pattern (ADR-022's own "postmeta-shaped trap"). It is designed to ship independently of Collections (SPEC-020) — its soft polymorphic `(workspaceId, contentType, contentId)` reference to content is injective only in composition with ADR-043's reservation of `content_types.key ∈ {'post','page'}`, a cross-spec dependency this ADR must respect without redefining. `mergeTerm` is this domain's one destructive, non-independently-reversible mutation (deduplicating `entry_terms` rows is not undoable), so it alone instantiates SPEC-016's gated-mutation gateway; every other mutation is an ordinary, non-gated write.

System drivers:
- **Shared-primitive discipline**: category and tag must not become two parallel subsystems — ADR-044's own rejected-alternatives list already ruled this out; this ADR must not silently reopen it.
- **Cross-spec injectivity dependency**: this domain's polymorphic join is not sound on its own — it depends on ADR-043/SPEC-020's reserved-key guarantee holding, even though the two ship independently in time.
- **Brownfield constraint**: confirmed directly against the codebase — no `taxonomies`/`terms`/`entry_terms` tables exist yet; `posts.kind` (with default `"post"`) is the existing lens column REQ-08's validation reads.
- **Established convention**: this codebase already has a proven rule-of-two feature-module shape (`ports.ts`/`types.ts`/write-service/`repo.memory.ts`+`repo.sqlite.ts`) used by every sibling feature (redirects, forms, members, etc.) — this ADR should follow it, not invent a new shape.

## Decision

Implement Categories & Tags as `src/features/taxonomy/`, a single shared write-service governing both taxonomy configurations, storing `taxonomies`/`terms`/`entry_terms`/`taxonomy_revisions` directly in `content.db`'s schema (not a sidecar file — unlike SPEC-017's ledger, this data is ordinary content-adjacent data with no restore-survival requirement). `mergeTerm` is implemented by calling `core/gated-mutations`'s exported plan/confirm/execute orchestrator; every other mutation (`createTerm`, `renameTerm`, `reparentTerm`, `deprecateTerm`, `assignTerms`, `unassignTerms`, `createTaxonomy`, `deprecateTaxonomy`) is an ordinary mutation that still honors SPEC-016 REQ-14's authorize-before-idempotency precedence, without going through the gated gateway.

**Pattern(s) selected:** Rule-of-two vertical feature slice (existing codebase convention) + selective gated-mutation instantiation for the one destructive operation.

## Default Heuristic Alignment

- Default heuristic: modular monolith, vertical slices, hexagonal boundaries only where justified.
- Alignment: **FOLLOWS**
- Notes: This is the clearest FOLLOWS case among the four dependent specs — no new architectural boundary is introduced at all; the domain slots directly into the codebase's already-proven feature-module shape.

## Rationale

- Driver 1 (shared-primitive discipline) → addressed by one `taxonomies`/`terms` schema with a `hierarchical` boolean, never two subsystems.
- Driver 2 (cross-spec injectivity) → addressed by citing ADR-043's reservation explicitly in the Dependencies table (already done at the spec level) and re-confirming it here rather than silently assuming it.
- Driver 3 (brownfield, no existing taxonomy code) → addressed by building fresh against `content.db`'s schema, reading `posts.kind` for lens validation without modifying `post.ts`.
- Driver 4 (established convention) → addressed by matching `src/redirects/`'s exact file shape.

## Pattern Evaluation

| Pattern | Fit Band | Adaptability | Evidence Basis | Pros | Cons | Key Tradeoffs | Verdict |
|---------|----------|--------------|----------------|------|------|---------------|---------|
| Single shared write-service, one schema, `hierarchical` boolean | Strong fit | High | measured (ADR-044's own rejected-alternatives analysis; direct schema.ts read) | One implementation, one test surface, matches the domain's actual shape (categories and tags genuinely are the same primitive) | None significant | — | **SELECTED** |
| Two separate subsystems (categories vs. tags) | Rejected | Low | prior_art (ADR-044's own converged rejection) | Conceptually "simpler" per-subsystem | Pure duplication of identical logic; the two are provably the same shape modulo one boolean | Would reopen a question ADR-044 already closed after debate | Not selected |
| JSON array of term strings on the content row | Rejected | Low | prior_art (ADR-022's own documented anti-pattern) | No new table | Breaks efficient reverse lookup (REQ-04) and referential integrity on rename/merge — exactly the trap ADR-022 exists to avoid | None acceptable | Not selected |
| Hard FK from `entry_terms` to a single content table | Rejected | Low | measured (would either block on Collections landing first, or strand against `posts` only) | Stronger DB-level integrity | Forfeits the independent-shipping property that is this spec's entire value proposition | Not selected — contradicts the spec's own success signal (ships independently of Collections) |

## Quality Attribute Scorecard

| Axis | Definition | Score (1-5) | Confidence | Strengths | Weaknesses | Rationale | Assumptions | Activation Source | Mitigation / Owner / Enforcement / Deadline | Review Trigger | Delta vs Runner-up |
|---|---|---|---|---|---|---|---|---|---|---|---|
| modifiability | Cost of changing taxonomy rules later | 4 | measured | One schema/write-service to change | `mergeTerm`'s dedup semantics are hard to change post-hoc (data loss already happened for prior merges) | Shared-primitive design means most future changes (e.g. new hierarchy rules) touch one place | — | always-on | — | — | +2 vs. two-subsystem design |
| modularity | Boundary clarity vs. `core/gated-mutations` and Collections | 4 | measured | Only `mergeTerm` touches the gateway; everything else is a plain write-service call, matching the established rule-of-two shape exactly | The cross-spec injectivity dependency on ADR-043 is a boundary that exists in reasoning, not in code — easy to silently violate if a future Collections change relaxes the reserved-key guarantee | Mirrors `src/redirects/`'s exact proven shape | — | always-on | Owner: this ADR's Enforcement section flags the injectivity dependency for Code Review | If ADR-043's reserved-key guarantee is ever relaxed, this domain's join injectivity must be re-verified | 0 vs. runner-up |
| scalability | Reverse-lookup query performance at content scale | 4 | measured | REQ-04's own AC-05 already specifies the exact index (`idx_entry_terms_by_term`) and asserts no full scan at 10k-row scale | Hierarchy depth/taxonomies-per-content-type limits are explicitly unaddressed (OQ-02) | The one performance-critical query path (reverse lookup) is already specified with its enforcing index named in the AC itself | Self-hosted, single-workspace scale | always-on | — | — | 0 vs. runner-up |
| reliability | Referential integrity under concurrent/racing writes | 5 | measured | `entry_terms_unique` plus upsert/ignore-on-conflict makes EC-09's concurrent-assign race a structurally-idempotent no-op, not a race to test for | — | This is a case where the DB's own unique constraint does the correctness work, not application logic — the strongest possible reliability posture for this concern | — | always-on | — | — | +1 vs. an application-level dedup check (which would need its own race-condition test) |
| security | Workspace/lens isolation on the polymorphic join | 5 | measured | REQ-07/REQ-08's write-time (not just read-time) workspace+lens validation, independently re-verified 3 times by Red-Team across rounds | Depends on ADR-043's reserved-key guarantee for full injectivity — a cross-spec trust boundary | This is the domain's own highest-security-relevance concern and it received the most explicit hardening (2 dedicated REQs, round-1 and round-3 audit folds in ADR-044 itself) | — | always-on | — | Re-verify if ADR-043's reserved-key guarantee changes | +1 vs. a design trusting caller-supplied workspaceId alone |
| operability | Observability of taxonomy mutations | 3 | assumed | `taxonomy_revisions` ledger provides a durable audit trail for every non-membership mutation | No metrics/tracing requirement stated | Audit trail is strong; live operational metrics are out of scope, consistent with this being a v1 admin feature, not an ops-critical path | — | always-on | — | — | 0 vs. runner-up |
| cost | Implementation cost | 5 | assumed | Reuses an established codebase convention wholesale (rule-of-two feature shape) — near-zero net-new architectural cost | — | Lowest-cost domain among the four dependents — no new module shape, no new sidecar DB, no new port beyond what SPEC-016 already provides | — | always-on | — | — | +2 vs. any pattern requiring a new architectural shape |
| testability | Ease of testing validation-chain ordering and hierarchy rules | 5 | measured | behavior.spec.md §2.1's fixed validation-chain ordering (allow-list → workspace → lens → hierarchy) is fully enumerable and independently testable per check | — | Every precedence/ordering rule in this domain was itself the subject of 3 Red-Team-found ordering defects (RT-001, RT-011, RT-012) now resolved and testable | — | always-on | — | — | +2 vs. an implementation without an explicit, documented check order |

## Overall Strengths

- Follows an already-proven codebase convention with essentially zero net-new architectural surface.
- The one genuinely hard problem in this domain (cross-taxonomy/hierarchy/cycle validation ordering) received exactly the rigor it needed — 3 rounds of Red-Team-found ordering defects, all resolved with an explicit, cited precedence.
- Referential integrity for the highest-concurrency-risk operation (`assignTerms`) is enforced by a DB constraint, not application logic.

## Overall Weaknesses

- The cross-spec injectivity dependency on ADR-043 is a reasoning-level boundary, not a code-level one — nothing structurally prevents a future Collections change from silently breaking this domain's join.
- Term-hierarchy depth and per-content-type taxonomy limits remain genuinely unaddressed (OQ-01, OQ-02).

## Tradeoff Tension

We are trading a soft (not DB-enforced) polymorphic reference for the ability to ship independently of Collections — accepting a cross-spec trust dependency in exchange for decoupled delivery timing.

## Why This Won

The shared-primitive, rule-of-two-convention design is the only candidate that satisfies both of ADR-044's own already-debated constraints (one mechanism, not two; ships independently of Collections) while adding zero new architectural ceremony to a codebase that already has a proven shape for exactly this kind of domain.

## Runner-Up Comparison

- Runner-up: hard FK from `entry_terms` to a single content table.
- Why it lost: it directly contradicts this spec's own success signal (independent shipping from Collections) — a hard FK to `posts` alone would strand the design against one content type, and a hard FK requiring Collections' `entries` table first would block this spec on SPEC-020's own timeline, which ADR-044's Context explicitly rejects as unnecessary.

## Consequences

**Positive:**
- Zero new architectural shape — fastest-to-build of the four dependent domains.
- Referential integrity for the highest-risk concurrent-write case is DB-enforced, not application-logic-dependent.

**Negative / Tradeoffs:**
- The join's injectivity is a cross-spec trust dependency on ADR-043, not self-contained.
- `mergeTerm`'s data loss (dropped duplicate `entry_terms` rows) is irrecoverable by design — disclosed, not hidden, but real.

**Risks:**
- Risk: a future Collections change relaxes ADR-043's reserved-key guarantee, silently breaking this domain's join injectivity. Plan: Code Review Agent flags any change to `content_types` key-reservation logic for cross-review against this spec's Dependencies table.
- Risk: OQ-01/OQ-02 (custom taxonomies, per-content-type limits) surface as real product needs before this ADR's re-evaluation triggers fire. Plan: both are explicitly owned by this ADR with a stated resolve-by (architecture sign-off) — see Re-evaluation Triggers.

## Mitigations Required

No axis scored ≤2.

## Migration Safety (required for brownfield, reverse-spec, or migration work)

| Safety Item | Decision / Evidence | Owner |
|---|---|---|
| Expand/contract shape | Purely additive: new tables in `content.db`'s existing schema file, no change to any existing table (including `posts` — REQ-08 reads `posts.kind` but never writes it). | This ADR |
| Dual-write or read-routing plan | N/A — no prior taxonomy mechanism exists. | This ADR (N/A confirmed) |
| Backfill plan | No historical term data exists; taxonomies start empty except the two seeded rows (`category`, `tag`) at first boot. | This ADR |
| Reconciliation checks | REQ-19's periodic/boot-time orphan sweep for `entry_terms`. | `features/taxonomy` |
| Observability proving phase health | `taxonomy_revisions` ledger is the built-in audit surface. | `features/taxonomy` |
| Rollback test | N/A in the traditional migration sense — `mergeTerm`'s own failure modes (`PLAN_STALE`, etc.) are its abort-before-mutation paths, already SPEC-016-covered. | `features/taxonomy` |
| Cutover approval and timing | N/A — no cutover; this is additive capability. | N/A |
| Point of no return | `mergeTerm`'s `execute()` step, at the moment the duplicate `entry_terms` row is dropped via `entry_terms_unique` — irrecoverable, disclosed at plan time (REQ-16). | `features/taxonomy` |
| Post-cutover verification | N/A. | N/A |

## Re-evaluation Triggers

- Calendar trigger: none stated; re-evaluate once SPEC-020 (Collections) ships and the ADR-043 reserved-key dependency can be verified end-to-end against a real `content_types` registry.
- Scale trigger: term-hierarchy depth or taxonomies-per-content-type becomes a real product requirement (OQ-01/OQ-02).
- Topology trigger: none specific to this domain beyond SPEC-016's own (`siteId`/`workspaceId`).
- Dependency trigger: ADR-043's `content_types.key` reserved-key guarantee changes in any way.

## Module / Service Boundaries

```
src/features/taxonomy/
  ports.ts             # TaxonomyRepoPort, EntryTermRepoPort (rule-of-two)
  types.ts              # Taxonomy, Term, EntryTerm, TaxonomyRevision, MergePlanResponse etc.
  write-service.ts       # Single write chokepoint: createTaxonomy/Term, renameTerm, reparentTerm,
                         #   deprecateTaxonomy/Term, assignTerms, unassignTerms — all ordinary mutations,
                         #   each honoring SPEC-016 REQ-14's authorize-before-idempotency ordering
  merge-term.ts          # planMergeTerm/confirmMergeTerm/executeMergeTerm — calls
                         #   core/gated-mutations's plan()/confirm()/execute() (domain="taxonomy.merge")
  drift-free-validation.ts  # The fixed validation chain: allow-list -> workspace -> lens -> hierarchy
                             #   (behavior.spec.md §2.1) — isolated for focused review (CIC U-002)
  repo.memory.ts         # In-memory adapter (rule-of-two)
  repo.sqlite.ts          # SQLite adapter (Drizzle, content.db)
  agent-tools.ts          # Agent-tool catalog (REQ-22)
  index.ts
  ui/                    # Taxonomy admin screens
infra/db/schema.ts       # ADDS: taxonomies, terms, entry_terms, taxonomy_revisions tables
core/gated-mutations/    # EXISTING (ADR-PIPE-016) — imported for mergeTerm only, unmodified
```

## API / Event Contract Summary

- Admin CRUD routes under `/api/admin/v1/taxonomy` for taxonomies, terms, term-assignment (REQ-21).
- `taxonomy_plan_merge_term` / `taxonomy_execute_merge_term` — this domain's sole gateway instantiation.
- Error codes: `TAXONOMY_NOT_APPLICABLE`, `WORKSPACE_MISMATCH`, `CONTENT_TYPE_MISMATCH`, `TAXONOMY_NOT_HIERARCHICAL`, `PARENT_CROSS_TAXONOMY`, `TERM_NOT_FOUND`, `HIERARCHY_CYCLE_DETECTED`, `SAME_TERM_MERGE`, plus SPEC-016's reused gateway codes.

## Enforcement

- Code Review Agent treats any `entry_terms`/`taxonomy_revisions` write bypassing `write-service.ts`'s single chokepoint as a Required finding.
- Code Review Agent treats a hand-rolled `mergeTerm` sequence bypassing `core/gated-mutations` as a Required finding (per GOV-ADR-001).
- Code Review Agent flags any change to ADR-043's `content_types` key-reservation logic for cross-review against this spec's injectivity dependency.

## Complexity Justification

| Article Violated | Why This Complexity Is Needed | Simpler Alternative Considered | Why Simpler Alternative Was Insufficient |
|-----------------|-------------------------------|-------------------------------|------------------------------------------|
| IV — Anti-Abstraction Gate (N/A, no ratified article — applied as a discipline anyway) | The fixed 4-step validation chain (allow-list → workspace → lens → hierarchy) is kept as explicit, separately-testable steps rather than collapsed into one combined check, because three of its sub-orderings were independently found wrong by Red-Team across rounds (RT-001, RT-011, RT-012) — a collapsed check would hide exactly the ordering bugs this domain already proved it's prone to. | A single combined validation function. | Would re-obscure the exact ordering property that took 3 Red-Team rounds to get right, reintroducing the risk of a silent regression. |

## Related Decisions

- Supersedes: none.
- Relates to: ADR-044 (Categories & Tags, primary source), ADR-043 §4 (Collections reserved-key dependency), ADR-PIPE-016 (core contract, `mergeTerm`'s gateway), ADR-021 (identity/authorization), ADR-022 (append-only revisions, `entry_terms` CI-canary exemption).

## Brownfield Grounding (direct codebase verification, this ADR)

- Confirmed via `src/infra/db/schema.ts`: no `taxonomies`/`terms`/`entry_terms`/`taxonomy_revisions` tables exist. `posts.kind` exists (`text("kind").notNull().default("post")`) — the exact column REQ-08's lens-validation check reads.
- Confirmed via `src/redirects/` (an existing shipped feature): the rule-of-two file shape (`ports.ts`, `types.ts`, a write-service file, `repo.memory.ts`, `repo.sqlite.ts`, `index.ts`) this ADR's Module Boundaries directly reuses.
- Confirmed via ADR-044 §"Wiring into the existing codebase": this domain was already directed to `src/features/taxonomy/` by the source ADR itself — this ADR follows that instruction rather than choosing a fresh path.

## Implementation Outline: PRODUCED

Triggers: Boundary Cross (crosses `core/gated-mutations`, `infra/db/schema.ts`, `features/taxonomy`, and depends on ADR-043/SPEC-020's registry), Contract Change (new routes, new agent tools, new error codes), Data And Persistence (new tables in `content.db`), Brownfield Dependency (reads `posts.kind` without modifying `post.ts`), Critical Cross-Boundary Invariant (INV-01 through INV-08 span the write-service and the cross-spec injectivity dependency). See `ADS-memory/reports/pipeline/018-categories-and-tags/implementation-outline.md`.

## Critical Internal Constraints: PRODUCED

Designated units: U-001 (validation-chain fixed ordering, Security-Critical Sequencing / already 3x Red-Team-found), U-002 (cycle-detection algorithm correctness, Algorithmic Correctness). See `ADS-memory/reports/pipeline/018-categories-and-tags/critical-internal-constraints.md`.

## Governance ADR Promotion

**Evaluated, no new promotion.** The gateway-reuse rule is already covered by GOV-ADR-001. This domain introduces no new cross-cutting rule beyond what SPEC-016/GOV-ADR-001 already establish — the injectivity dependency on ADR-043 is a domain-specific, two-party contract, not a generalizable rule.
