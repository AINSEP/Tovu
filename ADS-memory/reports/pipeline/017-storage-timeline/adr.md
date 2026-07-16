# ADR-PIPE-017: Storage — Timeline, Migrate-Forward State Machine, and Sidecar Ops Journal

- Status: ACCEPTED
- Date: 2026-07-15T08:00:00Z
- Spec: SPEC-017 v1.3.0 (hash: sha256:bce97937e6e34ec517b57385c80b34cd9a0c7ab33360cf97e081437b438ff6a8)
- Author: Software Architect (Claude Sonnet 5, Agent Direct Mode) / Leona Burime

## Constitution Check

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | N/A | Constitution unfilled template — no ratified article; confirmed by direct read. |
| II — Test-First | N/A | Same. |
| III — Simplicity Gate | N/A | Same — this ADR's Pattern Evaluation applies judgment independently. |
| IV — Anti-Abstraction Gate | N/A | Same — see Complexity Justification for rule-of-three reasoning applied anyway. |
| V — Integration-First Testing | N/A | Same. |
| VI — Security-by-Default | N/A | Same — REQ-08's no-attestation-bypass and REQ-25's mandatory redaction stand on ADR-041's decision. |
| VII — Spec Integrity | N/A | Same. |
| VIII — Observability | N/A | Same — error envelope carries `correlationId` regardless. |

No EXCEPTION rows. Complexity Justification filled anyway (see below), same discipline as ADR-PIPE-016.

## Research Summary

- Research artifact: N/A — no new technology choice. Dialect split (SQLite/Postgres) and Drizzle are already fixed by ADR-015/ADR-041.
- Key decision: implement the migrate-forward state machine as an explicit, table-driven state machine module (not an imperative if/else chain), backed by a **second, independent** sidecar SQLite database (`ops/storage-journal.db`) — distinct from `content.db`, which only carries SPEC-016's watermark column.

## Planning Preflight Evidence

- Coordinator Planning Preflight: PASS
- Spec hash verified at: 2026-07-15T05:35:00Z (original), re-verified after the SPEC-002→SPEC-017 renumbering pass (mechanical, content-hash-only) at 2026-07-15T07:00:00Z — see `pipeline-state.md`.
- Red-Team status and artifact: `cleared_for_architect`, round 4, 0 BLOCKING — `ADS-memory/reports/pipeline/017-storage-timeline/red-team-findings-round4.md`. Renumbering carried no requirement/AC change, so this clearance stands against the renumbered package.
- System Blueprint status and artifact: none — same brownfield self-check rationale as SPEC-016 (design-level work already done via ADR-041, which cleared its own 3-round `/audit-work` pass and a 6-round internal audit fold).
- CodeBase Analyzer reports consumed: none exist; this ADR does direct-codebase verification below.
- Reverse-spec artifacts consumed: N/A.
- Validator result or waiver: PASS, `validate_spec_package.py --phase preflight`, exit 0.

## Context

SPEC-017 instantiates SPEC-016's shared gated-mutation gateway/watermark/actor-identity contract for the `storage.migrate` domain, and independently owns: a read-first Timeline over an append-only ledger, a dialect-conditional (SQLite in-place vs. Postgres blue/green) migrate-forward state machine with distinct failure edges, boot-time crash reconciliation, and an optional Tier-3 read-only browser with mandatory sensitive-column redaction. ADR-041 §5's six-round audit history already demonstrated how easily this class of mechanism drifts when described informally — this spec is the first of four dependent domains to prove out SPEC-016's shared contract against real domain complexity (a genuine dual-dialect state machine with 3 distinct failure shapes), and its own Integration Contracts section becomes the pattern the other three dependents (SPEC-018/019/020) match against.

System drivers:
- **Structural complexity**: a 9-state SQLite branch and an 11-state Postgres branch (with 3 distinct failure edges: `SNAPSHOT_FAILED→ABORTED_SAFE`, `(APPLYING|VERIFYING)_FAILED→RESTORING→(RESTORED|RESTORE_FAILED)`, `CUTOVER_FAILED→ROLLBACK_TO_BLUE`) is exactly the shape that drifts silently under ad hoc imperative code.
- **Physical data boundary**: `storage_ledger`/`migration_runs`/`restore_points` must survive a `content.db` restore (the very operation they narrate) — ADR-041 item 2 already decided this requires a physically separate sidecar file, not a table inside `content.db`.
- **Brownfield constraint**: confirmed directly against the codebase — no `.site-meta.json`, no `__drizzle_migrations` reads, no `ops/` tree, and no `SERVE_SITE` implementation exist anywhere in `src/` today. This is genuinely first-touch territory within an otherwise-running product, not a migration of existing behavior.
- **Cross-dependency**: this spec's `execute()` internally calls SPEC-016's `stampWatermark()` (at quiesce) and depends on SPEC-019 (Backups/Recovery) as the receiving surface for its own failure hand-off (REQ-14/REQ-23) — SPEC-019 does not yet exist at this ADR's time of writing, a sequencing risk this ADR names but does not resolve.

## Decision

Implement Storage as a new vertical slice, **`src/features/storage/`**, that (a) imports `core/gated-mutations` for the generic plan/confirm/execute orchestration, watermark stamping, and actor-identity attribution; (b) owns an explicit, table-driven migrate-forward state machine module with dialect-conditional branches; (c) owns a new, independent sidecar database bootstrap (`ops/storage-journal.db`, its own Drizzle + better-sqlite3 instance, mirroring `infra/sqlite/content-db.ts`'s existing pattern) for `storage_ledger`/`migration_runs`/`restore_points`; (d) implements the SQLite `DbOpsPort` adapter now, with the Postgres adapter explicitly deferred (no Postgres path exists in this codebase yet).

**Pattern(s) selected:** Explicit table-driven state machine (Stateful Protocol pattern) + vertical feature slice, composing `core/gated-mutations` rather than reimplementing it.

## Default Heuristic Alignment

- Default heuristic: modular monolith, vertical slices for feature ownership, hexagonal boundaries only where justified.
- Alignment: **FOLLOWS**
- Notes: `features/storage/` is a vertical slice per the default heuristic; the `DbOpsPort` is the one hexagonal boundary this domain owns (dialect isolation is exactly the "external I/O justifies an explicit boundary" case), matching ADR-041 §1's own layering decision (thin `db-ops` library → admin screen → optional Tier-3 browser).

## Rationale

- Driver 1 (structural complexity of the dual-dialect state machine) → addressed by an explicit, exhaustively-testable transition table instead of imperative branching.
- Driver 2 (physical data-boundary survival requirement) → addressed by a genuinely separate sidecar database, not a `content.db` table.
- Driver 3 (brownfield first-touch) → addressed by building the sidecar bootstrap fresh, mirroring `content-db.ts`'s already-proven pattern rather than inventing a new one.
- Driver 4 (SPEC-019 not yet existing) → addressed by defining the hand-off contract (REQ-14/REQ-23) at the boundary now, deferring only the receiving implementation.

## Pattern Evaluation

| Pattern | Fit Band | Adaptability | Evidence Basis | Pros | Cons | Key Tradeoffs | Verdict |
|---------|----------|--------------|----------------|------|------|---------------|---------|
| Explicit table-driven state machine, dialect-branched | Strong fit | High | measured (state.spec.md §1-§3's own enum/transition tables) | Every legal transition and failure edge is enumerable and independently testable; illegal transitions (e.g. `ROLLBACK_TO_BLUE` reachable only from `CUTOVER_FAILED`) are structurally checkable | Two dialect branches to maintain | Some duplication between SQLite/Postgres branches, traded for exhaustive testability of a safety-critical ceremony | **SELECTED** |
| Imperative step sequence (try/catch per step, no explicit state enum) | Weak fit | Low | prior_art (the informal-prose shape ADR-041 §5 itself needed six audit rounds to stabilize) | Less code up front | Illegal-transition bugs (e.g. entering `SNAPSHOTTING` before `QUIESCING` completes) are not structurally preventable, only test-coverage-dependent | Lower upfront cost, much higher risk of exactly the drift class this spec exists to prevent | Not selected — this is the shape that already proved to drift |
| Generic saga/workflow engine (reused across future multi-step ceremonies) | Rejected | Medium | analogical | Reusable for a hypothetical future ceremony | No second distinct ceremony shape exists yet beyond what `core/gated-mutations` already generalizes at the plan/confirm/execute level; this state machine's dialect-branching is domain-specific, not reusable shape | Speculative generality, same Anti-Abstraction reasoning as ADR-PIPE-016 | Not selected — no third distinct shape |
| Store ledger tables inside `content.db` | Rejected | Low | measured (direct contradiction with ADR-041 item 2's own reasoning) | Simpler bootstrap (one DB, not two) | Cannot survive a restore of the very database it narrates — the exact defect ADR-041's R1 draft had before its own audit fold corrected it | Would silently reopen a defect this codebase's own architecture history already found and fixed | Not selected — contradicts already-Accepted, audit-hardened ADR-041 decision |

## Quality Attribute Scorecard

| Axis | Definition | Score (1-5) | Confidence | Strengths | Weaknesses | Rationale | Assumptions | Activation Source | Mitigation / Owner / Enforcement / Deadline | Review Trigger | Delta vs Runner-up |
|---|---|---|---|---|---|---|---|---|---|---|---|
| modifiability | Cost of changing the state machine or ledger schema later | 4 | measured | Explicit transition table is a single edit point per legal/illegal transition | Two dialect branches must be kept in sync when a shared concern (e.g. quiesce) changes | Table-driven design makes the cost of a future audit-found gap (like ADR-041's own six rounds) a single-file fix, not a codebase-wide hunt | — | always-on | — | — | +2 vs. imperative step sequence |
| modularity | Boundary clarity vs. `core/gated-mutations` and `content-db.ts` | 4 | measured | Clean composition: `features/storage` calls `core/gated-mutations`'s exported functions and mirrors `content-db.ts`'s bootstrap pattern for its own sidecar DB, without duplicating either | A contributor must know two DB bootstraps exist (`content.db`, `ops/storage-journal.db`) with different lifecycles | Mirrors an already-proven pattern (`content-db.ts`) rather than inventing a new bootstrap shape | — | always-on | Owner: this ADR's Module/Data Boundaries section documents both DBs' scope explicitly | If a third sidecar DB is ever needed, extract a shared bootstrap helper (not yet — only one precedent exists) | +1 vs. storing ledger in `content.db` (which scores 2: simpler bootstrap but violates the restore-survival requirement) |
| scalability | Timeline query / ledger growth under load | 3 | assumed | `storage_query_timeline` is cursor-paginated with a caller-set filter (REQ-04); no unbounded scan | Ledger row volume over years-long site lifetime unbenchmarked | Read pattern is bounded by design (cursor + filters); growth concern is storage volume, not query shape | Self-hosted, single-site-per-install scale | always-on | Owner: Software Architect for SPEC-017 (this ADR) — no current benchmark exists; flag for re-evaluation if ledger table growth becomes visible in practice | Ledger table exceeds a size where cursor pagination alone is insufficient | 0 vs. runner-up |
| reliability | Behavior across crash/restart during an in-flight migration | 5 | measured | REQ-15's boot-time crash reconciliation (`RECONCILE_INTERRUPTED_MIGRATION`) plus INV-08's Coordinator-mandated boot-sequence ordering (must resolve before `evaluateBootMigrationPolicy` ever runs) are both explicit, Red-Team-hardened (round 2's RT2-002) requirements | Quiesce itself is chokepoint-visible-only (a disclosed, accepted residual, REQ-27) | This is the single highest-reliability-relevance concern in this domain, and it received the most explicit hardening (dedicated behavior.spec.md §2.4 section, its own INV-08) | Tier-3 in-process plugins can write around quiesce (ADR-024 §4 Rung 1 limitation) — disclosed, not hidden | always-on | — | ADR-024 §4 Rung 2 (capability sandbox) ships — re-evaluate whether `quiesceIntegrity` can ever be fully closed | +2 vs. an implementation without an explicit boot-ordering invariant |
| security | Authorization/redaction correctness | 5 | measured | Reuses SPEC-016's `authorize()`/actor-class rule wholesale (no reimplementation); REQ-25's mandatory, tier-independent `sensitive: true` redaction is unconditional | Tier-3 browser is a genuinely new attack surface (bounded read) even though redacted | Security posture is inherited from SPEC-016's already-hardened gateway plus this domain's own mandatory-redaction rule, evaluated independently by Red-Team | — | always-on | — | — | +1 vs. a design that redefined its own auth instead of reusing SPEC-016's |
| operability | Observability of migration/drift state | 4 | assumed | `StorageHealthSummary`, drift classification, and the Timeline itself are purpose-built observability surfaces | No metrics/tracing requirement stated (out of scope — future Site Health surface per ADR-041 §1) | This domain's entire read surface (Timeline, health, schema-state) is itself an operability feature, unusually strong for a v1 admin surface | — | always-on | — | — | 0 vs. runner-up |
| cost | Implementation cost of a full dual-dialect state machine now vs. deferring Postgres | 4 | assumed | Postgres adapter is explicitly deferred (no code exists); SQLite-only ships first | State-machine *shape* still models both dialects now, even though only SQLite is implemented | Modeling both dialects in the state machine now (even with Postgres unimplemented) avoids a structural rework later — cheaper than retrofitting Postgres states into an already-shipped SQLite-only machine | — | always-on | — | — | +1 vs. building SQLite-only initially with Postgres bolted on later |
| testability | Ease of exhaustively testing state transitions | 5 | measured | Every transition and failure edge is enumerable from `state.spec.md` §1-§3; INV-01 through INV-06 are all independently property-testable | — | Table-driven design is directly testable by enumerating the transition table itself, not by tracing imperative control flow | — | always-on | — | — | +2 vs. imperative step sequence |

## Overall Strengths

- Reuses SPEC-016's hardened gateway/watermark/actor-identity mechanism wholesale — zero reimplementation risk.
- The dual-dialect state machine's illegal transitions (e.g. conflating `CUTOVER_FAILED` with the `APPLYING`/`VERIFYING` failure edge) are structurally preventable by the table-driven design, not merely test-coverage-dependent.
- Boot-sequence ordering (INV-08) is explicit and Red-Team-hardened, closing a class of defect (running cost-gated policy atop an unresolved crash) that would be easy to introduce silently.

## Overall Weaknesses

- Two sidecar-adjacent database bootstraps now exist (`content.db`, `ops/storage-journal.db`) that a contributor must learn to distinguish.
- The Postgres branch is fully specified but unimplemented — a real gap between "designed" and "built," explicitly disclosed, not hidden.

## Tradeoff Tension

We are trading upfront state-machine modeling cost (full dual-dialect shape, even with Postgres unimplemented) for avoiding a structural rework when the Postgres adapter is eventually built.

## Why This Won

The table-driven state machine is the only candidate that makes this domain's highest-risk property (illegal state transitions during a destructive migration) structurally checkable rather than merely test-coverage-dependent — directly addressing the exact defect class ADR-041's own six-round audit history proved happens under informal description. The sidecar-DB decision is not actually a fresh choice this ADR makes; it is required by ADR-041 item 2's own already-Accepted, audit-corrected reasoning (an in-`content.db` ledger cannot survive the restore it narrates).

## Runner-Up Comparison

- Runner-up: imperative step sequence with try/catch per step, no explicit state enum.
- Why it lost: this is exactly the shape ADR-041 §5 already proved drifts under real review pressure — six independent audit rounds each found a fresh gap in an informally-described version of a materially simpler mechanism (the watermark). A dual-dialect, multi-failure-edge state machine is a harder case, not an easier one, so the same informal-description risk applies more, not less.

## Consequences

**Positive:**
- Illegal state transitions are structurally prevented, not merely tested for.
- Ledger data survives a `content.db` restore by construction (separate physical file).
- The Postgres branch's shape is already modeled, reducing future rework cost when that adapter is built.

**Negative / Tradeoffs:**
- A second sidecar-DB bootstrap pattern now exists alongside `content-db.ts`.
- The Postgres adapter remains unimplemented — anyone reading only the state machine could mistakenly assume Postgres support ships now.

**Risks:**
- Risk: SPEC-019 (Backups/Recovery) is not yet approved at this ADR's time of writing, and REQ-14/REQ-23's failure hand-off has no receiving surface yet. Plan: this ADR's Module Boundaries section defines the hand-off contract shape now; Coordinator must sequence SPEC-019's own architecture work before Storage's `RESTORE_FROM_MIGRATION_FAILURE` action is implemented against a real Recovery surface.
- Risk: the write-path inventory automation ADR-041 item 5 requires (the `ts-morph`-based typed AST inventory) does not yet exist. Plan: tracked as ADR-041's own Phase 0 deliverable, not blocking this ADR's own approval — the discarded-window disclosure remains explicitly partial/labeled until that inventory lands.

## Mitigations Required

No axis scored ≤2.

## Migration Safety (required for brownfield, reverse-spec, or migration work)

| Safety Item | Decision / Evidence | Owner |
|---|---|---|
| Expand/contract shape | Purely additive: new `ops/storage-journal.db` file, new tables within it, no change to any existing table. Confirmed no `storage_ledger`/`migration_runs`/`restore_points`/`.site-meta.json`/`__drizzle_migrations`-reading code exists in `src/` today — this is new capability, not a migration of running behavior. | This ADR |
| Dual-write or read-routing plan | N/A — no prior Storage surface exists to dual-write against. | This ADR (N/A confirmed) |
| Backfill plan | No historical ledger data exists to backfill; a site's Timeline starts empty at first boot after this feature ships. | This ADR |
| Reconciliation checks | REQ-15's boot-time crash reconciliation (`RECONCILE_INTERRUPTED_MIGRATION`) is the built-in check; INV-08 (this ADR's own CIC unit) guards its ordering against the cost-gated policy. | This module's own implementation |
| Observability proving phase health | Timeline itself, `StorageHealthSummary`, and drift classification are the built-in observability surfaces. | `features/storage` |
| Rollback test | The state machine's own failure edges (`ABORTED_SAFE`, `RESTORING→RESTORED\|RESTORE_FAILED`, `ROLLBACK_TO_BLUE`) are this domain's rollback paths — each independently testable per the transition table. | `features/storage` |
| Cutover approval and timing | Postgres `CUTOVER` requires a successful `VERIFYING` state and is a single atomic repoint — no gradual cutover. Concrete repoint mechanism deferred (OQ-03, Postgres adapter not yet built). | Software Architect for SPEC-017 (this ADR) — OQ-03 remains open, owed before the Postgres adapter's implementation begins |
| Point of no return | For SQLite: `JOURNALING` writing the terminal `core.migration` ledger row. For Postgres: a successful `CUTOVER` repoint — after which blue is no longer authoritative. | `features/storage` |
| Post-cutover verification | Postgres `VERIFYING` runs before `CUTOVER`, not after — verification of the green schema is a precondition for cutover, not a post-hoc check. This is intentional: catching a bad schema before it ever serves traffic is stronger than verifying after. | `features/storage` |

## Re-evaluation Triggers

- Calendar trigger: none stated; re-evaluate once SPEC-019 (Recovery) ships and the REQ-14/REQ-23 hand-off has a real receiving surface to test against end-to-end.
- Scale trigger: ledger table growth becomes visible in practice (OQ-01's watermark-contention concern applies at the SPEC-016 level; this domain's own ledger-volume concern is distinct and currently unbenchmarked).
- Topology trigger: `siteId` vs `workspaceId` resolution (OQ-02, inherited) — this domain's sidecar scoping assumption would need revisiting under a shared-file multi-site topology.
- Dependency trigger: the Postgres `db-ops` adapter's concrete implementation landing (OQ-03) — re-verify the `CUTOVER` repoint mechanism against this ADR's state-machine shape.

## Module / Service Boundaries

```
src/features/storage/
  timeline.ts              # Timeline query/read model (REQ-01, REQ-04); getTimeline selector
  drift.ts                 # Drift classification (REQ-02, REQ-03) — tag-identity-decisive algorithm
  migrate-forward/
    state-machine.ts        # Explicit table-driven state machine (REQ-11, REQ-12), both dialect branches
    plan.ts                  # storage_plan_migrate_forward — calls core/gated-mutations.plan()
    execute.ts                # storage_execute_migrate_forward — calls core/gated-mutations.execute(),
                              #   delegates the domain mutation callback to state-machine.ts
  boot/
    reconcile-interrupted-migration.ts   # REQ-15; MUST run before...
    evaluate-boot-migration-policy.ts     # ...REQ-28/REQ-29 (INV-08 ordering — see CIC U-004)
  restore-points.ts         # backup_create_restore_point (REQ-22) — single-call, authorize()-gated,
                             # NOT a core/gated-mutations instantiation
  tier3-browser.ts          # Optional Tier-3 read-only browser (REQ-25, REQ-26)
  agent-tools.ts            # Agent-tool catalog (REQ-20-REQ-23)
  ui/                       # StorageTimelineScreen and children (ui.spec.md §1)
infra/sqlite/
  storage-journal-db.ts     # NEW — mirrors content-db.ts's bootstrap pattern (Drizzle + better-sqlite3),
                            # opens `<install-dir>/ops/storage-journal.db`, its own migrations dir
  storage-journal-schema.ts # NEW — storage_ledger, migration_runs, restore_points table definitions
  db-ops.ts                 # SQLite DbOpsPort adapter implementation
infra/postgres/ (deferred)
  db-ops.ts                 # Postgres DbOpsPort adapter — NOT built in this pass; OQ-03 unresolved
core/gated-mutations/       # EXISTING (ADR-PIPE-016) — imported, not modified
core/operation-lock.ts      # EXISTING (ADR-PIPE-019, GOV-ADR-002) — `migrate-forward/execute.ts` MUST
                             #   call acquireOperationLock({siteId, operationKind: 'migration'}) before
                             #   proceeding to the state machine; this is the SAME shared, site-wide
                             #   primitive Recovery's executeRestore also consults — never a Storage-local
                             #   in-flight check. See Critical Internal Constraints U-003 (revised below;
                             #   originally drafted 08:00 as a Storage-local guard, before ADR-PIPE-019's
                             #   10:00 decision to require one shared primitive — corrected here per the
                             #   audit-work internal verification pass, 2026-07-15).
```

`ADS-project-knowledge/specs/003-site-install-dir/state.spec.md`'s `SERVE_SITE` row requires the REQ-28–REQ-30 amendment recorded by this spec — the mechanical edit to that pre-existing file is a follow-up task, not performed by this ADR (matching ADR-041 §10's own stance).

## API / Event Contract Summary

- `storage_plan_migrate_forward` / `storage_execute_migrate_forward` — this domain's instantiation of SPEC-016's gateway (`domain="storage.migrate"`).
- `storage_query_timeline`, `storage_get_health`, `storage_get_schema_state`, `storage_list_pending_migrations`, `storage_list_restore_points` — free-read tools.
- `backup_create_restore_point` — single-call, non-gateway, `authorize()`-gated write.
- `storage_get_restore_guidance` — deep-link routing only, hands off to SPEC-019 via `StorageContextEnvelope` (unsigned, untrusted, re-verified server-side by the receiving surface).
- Error codes: `SCHEMA_DRIFT_DIVERGED`, `RESTORE_POINT_UNAVAILABLE`, `TIER3_DISABLED`, `MIGRATION_ALREADY_IN_FLIGHT` (domain-specific) plus SPEC-016's reused codes.

## Enforcement

- Code Review Agent treats any direct `content.db` table for `storage_ledger`/`migration_runs`/`restore_points` as a Required finding (must live in the sidecar `ops/storage-journal.db` per ADR-041 item 2).
- Code Review Agent treats a hand-rolled migrate-forward sequence bypassing `core/gated-mutations`'s orchestrator as a Required finding (per GOV-ADR-001).
- Code Review Agent treats any `describeTables()`/`readRows()` response including a `sensitive: true` column as a Required (blocking) finding, regardless of caller permission tier.
- Code Review Agent treats a Storage-local in-flight-operation check (independent of `core/operation-lock.ts`) as a Required finding — the shared lock is MANDATORY per GOV-ADR-002, scoped explicitly to `src/features/storage/**`.

## Complexity Justification

| Article Violated | Why This Complexity Is Needed | Simpler Alternative Considered | Why Simpler Alternative Was Insufficient |
|-----------------|-------------------------------|-------------------------------|------------------------------------------|
| IV — Anti-Abstraction Gate (N/A, no ratified article — applied as a discipline anyway) | A full dual-dialect state machine (9 SQLite states + Postgres's additional `CUTOVER`/`CUTOVER_FAILED`/`ROLLBACK_TO_BLUE`) is modeled now even though the Postgres adapter is deferred, because retrofitting dialect branches into an already-shipped SQLite-only state machine is empirically the more expensive path (per ADR-041's own history of costly late corrections). | Model only the SQLite branch now; add Postgres states when the adapter is actually built. | Would require reworking the transition table and every consumer that pattern-matches on `MigrationRunStatus` once Postgres is added — a structural change, not an additive one, exactly the kind of late-discovered cost ADR-041's audit history repeatedly found. |

## Related Decisions

- Supersedes: none.
- Relates to: ADR-041 (Storage/Timeline, primary source), ADR-PIPE-016 (core contract this spec instantiates), ADR-PIPE-019 (Backups/Recovery — originating ADR for the shared `core/operation-lock.ts` primitive this spec's `execute()` path is bound by, per GOV-ADR-002), ADR-023 (§3 disk-headroom, §4 snapshot-before-DDL amended by ADR-041, §8 sandboxed-read floor), ADR-024 (§4 isolation rungs), ADR-015 (Drizzle/migrations, tag-identity drift), ADR-012 (install-dir layout), ADR-021 (§9 seeded system principal).

## Brownfield Grounding (direct codebase verification, this ADR)

- Confirmed via direct grep: no `.site-meta.json`, `schemaTag`/`schemaVersion` handling, `__drizzle_migrations` reads, `ops/storage-journal.db`/`restore-points/` references, or `SERVE_SITE`/`serveSite` implementation exist anywhere in `src/` today. This domain is genuinely new capability, not a migration of running behavior — the "existing `SERVE_SITE`" the spec references is a pre-existing **spec document** (`ADS-project-knowledge/specs/003-site-install-dir/`), not running code.
- `src/infra/sqlite/content-db.ts` confirmed as the existing pattern this ADR's new `storage-journal-db.ts` mirrors (Drizzle + better-sqlite3, its own migrations directory, pragmas applied at open).

## Implementation Outline: PRODUCED

Triggers: Boundary Cross (crosses `core/gated-mutations`, `infra/sqlite`, a new `infra/postgres` seam, `features/storage`, and hands off to SPEC-019), Contract Change (new endpoints, new error codes, new agent tools), System Wiring (dialect-conditional state machine, boot-sequence ordering across two boot-time checks), Data And Persistence (new sidecar database entirely), Brownfield Dependency (amends a pre-existing spec file, `003-site-install-dir`, as a named follow-up), Critical Cross-Boundary Invariant (INV-01–INV-08 span the state machine and boot sequence). See `ADS-memory/reports/pipeline/017-storage-timeline/implementation-outline.md`.

## Critical Internal Constraints: PRODUCED

Designated units: U-001 (dialect-conditional state-machine legal-transition table, Stateful Protocol), U-002 (drift classification tag-identity-decisive algorithm, Algorithmic Correctness), U-003 (concurrent migration-in-flight guard — binding reference to SPEC-019 CIC U-001, not independently designated; see GOV-ADR-002), U-004 (boot-sequence ordering — reconcile before policy, Stateful Protocol / already SPEC-017's own INV-08). See `ADS-memory/reports/pipeline/017-storage-timeline/critical-internal-constraints.md`.

## Governance ADR Promotion

**Evaluated, no new promotion.** This ADR's cross-cutting concerns (use `core/gated-mutations`, never store ledger data in `content.db`) are already covered — the gateway-reuse rule by GOV-ADR-001, and the sidecar-vs-`content.db` placement rule is itself scoped to this one domain's ledger tables (not a generalizable rule beyond "don't put restore-narrating data where the restore erases it," which is domain-specific reasoning, not a reusable cross-cutting pattern). No new governance ADR promoted.
