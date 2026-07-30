# ADR-018: Admin Command Gateway — single mutation write path, inverse-applier registry, concurrency + permission seams

- Status: ACCEPTED
- Date: 2026-07-07T04:25:00Z
- Approved: 2026-07-07 by owner (Leon Aburime, in-session) — human ADR approval gate cleared
- Spec: SPEC-001 v1.0.0 (hash: sha256:768af10e49fcde7a6e8d9dc0f4b1193c0302201a480afc01d9fe20fafe25e5d6)
  - Authored at hash 0230e96c…c7a0; re-pointed 2026-07-07 to the audit-reconciled hash after external-audit F1–F4 was applied to the spec and Red-Team re-affirmed 0 BLOCKING. The load-bearing delta for this ADR is **F4 (gateway atomicity)** — see API/Event Contract Summary and Consequences.
- Author: Software Architect Agent (Claude Opus 4.8, AI Dev Shop pipeline)

## Constitution Check

*Constitution bootstrapped 2026-07-07 at `ADS-memory/governance/constitution.md`.*

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | No library implements change-set/inverse-capture/revert semantics; this is justified custom domain-core code built on existing `core/ports` contracts. No new dependency introduced (Drizzle/Express/in-memory adapter already decided — ADR-015/001). |
| II — Test-First | COMPLIES | TDD Agent certifies failing tests before Programmer. Pre-pipeline draft (`command.ts`/`change-set.ts`/`repo.memory.ts`) is reconciled *against* certified tests, never treated as ground truth. |
| III — Simplicity Gate | COMPLIES | Every planned module (`command.ts`, `change-set.ts`, `revert.ts`, `appliers.ts`, `repo.memory.ts`, routes) traces to REQ-01…REQ-12. Reserved-but-unused vocabulary (`proposed`/`discarded`) is explicitly reserved by ADR-008. |
| IV — Anti-Abstraction Gate | COMPLIES | `ChangeSetRepoPort` has two adapters (in-memory now, SQLite Phase 1) — rule-of-two per ADR-006. The inverse-applier registry ships with two real appliers (post, presentation-settings) — rule-of-two satisfied, not speculative. |
| V — Integration-First Testing | COMPLIES | P1 ACs (AC-05…AC-14) are specified at the HTTP route boundary; contract tests at the route + core seam. |
| VI — Security-by-Default | **EXCEPTION** | Standing Art. VI v1 carve-out: the dev server has no auth layer; endpoints are local-dev only, Security Agent review still runs, workspace scoping is structural (ADR-007). See Complexity Justification + Mitigations (RT-007 permission seam). |
| VII — Spec Integrity | COMPLIES | This ADR and all downstream stages reference SPEC-001 v1.0.0 hash `768af10e…e5d6` (audit-reconciled; was `0230e96c…c7a0` at authoring). |
| VIII — Observability | COMPLIES | Structured error registry (5 new codes), `change-set.applied`/`.reverted` domain events, `changeSetId` as the in-scope correlation id (deferred `occurredAt`/`correlationId` owned by the observability feature). |

Any EXCEPTION has a row in Complexity Justification below.

## Research Summary

- Research artifact: N/A — no library or technology choice is open. Persistence (Drizzle/SQLite behind ports) is fixed by ADR-015; transport (Express) and the in-memory adapter pattern already exist; the macro pattern is fixed by ADR-001/006/009. This ADR selects the *internal composition* of a feature within an already-chosen architecture.
- Key decision: Wrap every admin mutation in one in-process command gateway (Decorator over feature calls) that captures an inverse snapshot and records an auto-applied single-item change set behind a repo port; revert is a separate executor driving a `(entityType, operation)` inverse-applier registry under a strict version guard.

## Planning Preflight Evidence

- Coordinator Planning Preflight: PASS (2026-07-07T04:20:00Z, spec hash 0230e96c…c7a0; re-affirmed at audit-reconciled hash 768af10e…e5d6, 2026-07-07)
- Spec hash verified at: 2026-07-07T04:16:00Z (Speckit validator `--phase preflight` PASS)
- Red-Team status and artifact: PASS — 0 BLOCKING · 6 ADVISORY · 1 CONSTITUTION_FLAG; reaffirmed on the R2 delta at the current hash. `reports/pipeline/001-admin-command-gateway/red-team-findings.md`
- System Blueprint status and artifact: N/A (no blueprint). Brownfield analysis wired instead: `reports/architecture/admin-section-architecture-outline.md` (rev 3, CBM/Graphify-grounded).
- CodeBase Analyzer reports consumed: `admin-section-architecture-outline.md` rev 3 §7.
- Reverse-spec artifacts consumed: N/A.
- Validator result or waiver: Speckit `--phase spec --update-hash` and `--phase preflight` both PASS; no waiver.

## Context

SPEC-001 requires that every admin mutation — human save today, AI agent tool-call next — produce a durable, auditable, revertible change set, before the AI-controllable admin plane (ADR-013/014/016) can mutate content. Retrofitting audit/undo after agents can already write is the breaking rewrite ADR-008 set out to avoid.

System drivers:
- **Audit requirements (dominant):** every state change must leave exactly one change-set row with an inverse payload (INV-01).
- **Complexity:** moderate — two wrapped mutations today (post update, presentation active-theme), a small revert state machine (`applied → reverted`, terminal), and a version-guard invariant. Not rich enough for full DDD aggregates.
- **Coupling / Adaptability:** persistence must stay swappable (in-memory → SQLite/Drizzle → Postgres) behind ports (ADR-006/015). Business logic must not import the DB or Express.
- **Longevity:** load-bearing seam for the agent plane; this is the mutation choke point for the product's future, not throwaway.

Constraints that cannot change: existing hexagonal codebase (`core/ports.ts`, feature modules with `repo.memory`/`repo.sqlite` adapters), ADR-006 rule-of-two, ADR-007 workspace scoping, ADR-008 change-set storage shape, ADR-009 decoupling lanes (typed sync calls + outbox events + hooks), ADR-015 Drizzle. No auth layer exists (Art. VI exception).

Do-nothing cost: mutations keep writing directly to repos with no record; the agent plane cannot ship safely; audit/undo becomes a cross-cutting rewrite later.

## Decision

Implement SPEC-001 as a **command gateway inside the existing hexagonal modular monolith**: a single in-process `executeCommand` function (a Decorator wrapping feature mutation calls) that runs the fixed order — idempotency check → inverse capture → feature execute → record one auto-applied single-item change set — persisting through `ChangeSetRepoPort` and announcing via the outbox. Revert is a **separate executor** that evaluates preconditions, walks items in descending `position`, and applies inverses through a **`(entityType, operation)` inverse-applier registry** under a strict version guard.

**Pattern(s) selected:** Hexagonal / Ports-and-Adapters (retained) + Command/Decorator write-path + Registry (inverse appliers) + Transactional Outbox (retained, ADR-009). Repository pattern for change-set storage (rule-of-two).

## Default Heuristic Alignment

- Default heuristic: modular monolith at the macro level, vertical slices / owned modules, hexagonal boundaries where external I/O or business-critical logic justify them.
- Alignment: **FOLLOWS**
- Notes: The gateway is business-critical mutation logic that must stay framework- and DB-independent — exactly where the heuristic says to apply a hexagonal boundary. It lives in `core/` depending only on `core/ports` contracts; routes (Express) and repos (in-memory/Drizzle) are adapters. No new macro shape introduced.

## Rationale

- Driver *audit trail required* → the gateway makes "exactly one change set per mutation" (INV-01) a structural property of the single write path rather than a per-feature effort; the inverse payload captured pre-execute (BR-02) gives undo without revision tables.
- Driver *adaptability / swappable persistence* → `ChangeSetRepoPort` keeps the gateway ignorant of storage; in-memory now, Drizzle/SQLite next (ADR-015), Postgres later — swap cost bounded to the adapter.
- Driver *agent plane next* → one choke point (`executeCommand`) is the seam agents call through; the `CommandActor`/authorization context param (RT-007) is reserved in the signature now so authz is not a breaking retrofit.
- Driver *moderate complexity* → a registry keyed on `(entityType, operation)` scales to N entity types without branching logic in the executor, while staying far simpler than event sourcing.

## Pattern Evaluation

| Pattern | Fit Band | Adaptability | Evidence Basis | Pros | Cons | Key Tradeoffs | Verdict |
|---------|----------|--------------|----------------|------|------|---------------|---------|
| Hexagonal + Command/Decorator + inverse-applier Registry (+ Outbox) | Strong fit | High | prior_art | One enforced write path (INV-01); inverse captured inline; persistence swappable behind port; registry scales to new entity types; matches existing codebase + ADR-006/008/009/015 | Revert executor + registry is bespoke domain code (no library); concurrency isolation is app-level until SQLite | Custom revert logic vs zero suitable library; single-process serialization assumption until the SQLite adapter | **SELECTED** |
| Event Sourcing (store events, derive state) | Viable fit | Medium | analogical | Natural full audit trail; time-travel; "state at time X" | Storage grows unbounded; rebuild/snapshot machinery; every read path reworked; contradicts ADR-008's inline-inverse decision + spec "out of scope: revision tables" | Heavy infra for audit the change-set model already delivers | Not selected — ADR-008 already chose change-sets over an event log; complexity unjustified for v1 |
| CQRS (split read/write models) | Weak fit | Medium | analogical | Optimized read projections for change history | Read/write shapes are symmetric here; projection lag; second model to maintain | Consistency + maintenance cost for no asymmetric-load driver | Not selected — no read/write asymmetry driver |
| Status quo: per-route inline audit (no gateway) | Rejected | Low | prior_art | No new module | INV-01 unenforceable; audit logic duplicated per route; agents get no single seam; bypass-able | Cheap now, breaking rewrite when the agent plane lands | Rejected — violates the spec's core invariant and "why now" |

Tiebreaker note: SELECTED and Event Sourcing are not in the same fit band; the SELECTED pattern also carries higher adaptability. No hard requirement forces the heavier option.

## Quality Attribute Scorecard

| Axis | Definition | Score | Confidence | Strengths | Weaknesses | Rationale | Assumptions | Activation Source | Mitigation / Owner / Enforcement / Deadline | Review Trigger | Delta vs Runner-up |
|---|---|---|---|---|---|---|---|---|---|---|---|
| modifiability | ease of safe behavior change | 4 | prior_art | New entity types = one registry registration + one applier; no executor edits | Cross-cutting change to the change-set row shape touches port + both adapters | Registry + port localize change; matches how post/presentation repos already evolve | Entity count stays small in v1 | always-on | — | New entity type needs revert but has no snapshot | +1 vs Event Sourcing (no projection rewrites) |
| modularity | clean, isolated boundaries | 5 | prior_art | `core/commands` depends only on `core/ports`; routes + repos are adapters | Gateway is a shared dependency of all mutation routes (intentional choke point) | Hexagonal boundary already enforced across the repo | Import discipline holds (lint/review) | always-on | — | Any `core/commands` import of Express/DB | +1 vs status quo (no per-route duplication) |
| scalability | growth in load/data/org | 3 | analogical | Single-process in-memory is fine for local dev + desktop host | No multi-process idempotency/revert isolation until SQLite | v1 target is one local admin; scale deferred to persistence layer | Concurrency stays single-actor in v1 | always-on | — | Multi-process serve or concurrent agents | 0 vs runner-up |
| reliability | fault tolerance / safe degradation | 4 | analogical | Inverse captured before execute; feature throw ⇒ no row, no event (INV-01/BR-03); revert never partially applies (INV-05, compare-and-set) | Outbox is best-effort (BR-04) — event loss possible, rows remain truth | Rows are source of truth; events re-enqueueable | Outbox worker eventually drains | always-on | — | Event delivery SLO introduced | +1 vs status quo |
| security | secure boundaries / access control | 2 | prior_art | Workspace scoping structural (ADR-007); `inversePayload` never exposed over HTTP | **No authn/authz**; `revert` is destructive + unauthenticated | Art. VI standing exception; dev-server-only | Not deployed beyond local until permissions feature | always-on | Mitigation: reserve actor/authz context param in `executeCommand`/revert signature + named actions `admin.change-sets.read/revert`. Owner: Programmer (seam) + Security Agent (review). Enforcement: Code Review Required finding + Security review. Deadline/trigger: before any non-local deploy / permissions feature | Any non-local deployment | 0 vs runner-up (all share the exception) |
| operability | deploy/monitor/debug/rollback | 4 | prior_art | Change history + revert are themselves the operability surface; structured error codes | No metrics/tracing yet (deferred) | changeSetId correlates a mutation end-to-end | Local dev observability suffices for v1 | always-on | — | Production deployment | +1 vs status quo |
| cost | total ownership cost | 4 | prior_art | Reuses ports, outbox, repo pattern; no new infra | Bespoke revert/registry code to maintain | Marginal cost over existing modules is small | No new services | always-on | — | — | +1 vs Event Sourcing (no event store to run) |
| testability | supports unit/integration/contract tests | 5 | prior_art | Pure-ish core with injected clock/id/outbox/repo; deterministic; HTTP contract tests for P1 ACs | Concurrency edge (RT-003) hard to test deterministically | Existing `__tests__`/`__specs__` layout + DI make this straightforward | Fake clock/id/repo available (they are) | always-on | — | — | +1 vs Event Sourcing |
| compliance_auditability | audit-trail / evidentiary strength | 5 | prior_art | Every mutation ⇒ one immutable-intent change set with inverse; terminal `reverted` state; actor + timestamp | Revert write itself is not a new change-set row (audited only via event) — no redo in v1 | This is the feature's raison d'être (INV-01/02/03) | user-local actor until identity | Spec success signal + INV-01 (audit trail required) | — | Redo/undo-of-undo becomes a requirement | +2 vs status quo |
| data_consistency | invariants across writes/stores | 3 | analogical | Version guard (strict equality) + LIFO revert + compare-and-set status flip protect against stale/double revert | In-memory has async await points; true isolation needs SQLite transaction/row-lock | Single-process event loop + compare-and-set covers v1; RT-003/RT-004 carried to adapter | Single in-flight revert per change set in v1 | Idempotency + revert invariants + version guard (distributed-write risk) | Mitigation: compare-and-set on status in the revert flip; SQLite adapter uses txn + unique index → maps to DUPLICATE_COMMAND. Owner: Programmer. Enforcement: tests (RT-003 EC) + adapter contract. Deadline/trigger: SQLite adapter | Multi-process / concurrent-agent writes | 0 vs runner-up |

## Overall Strengths

- One enforced, testable mutation choke point that makes audit/undo a structural property, and gives the agent plane a single seam with an authz slot already carved out.
- High adaptability: persistence and transport are adapters; new revertible entity types are additive (register + applier).

## Overall Weaknesses

- Security posture is deliberately deferred (Art. VI exception) — `revert` is powerful and unauthenticated in v1.
- Concurrency isolation is app-level (single-process assumption) until the SQLite adapter; the revert path has async await points that require a compare-and-set guard rather than real locking.

## Tradeoff Tension

We are trading multi-process/concurrent write isolation (and, for v1, endpoint authorization) for delivery speed and operational simplicity — accepting a single-process, local-dev-only posture now so the audit/undo write path exists before the agent plane, with the isolation and authz seams reserved so neither becomes a breaking retrofit.

## Why This Won

The dominant driver is *auditable, revertible mutation before agents can write*. The SELECTED pattern delivers INV-01 as structure (not per-route diligence), fits the existing hexagonal codebase and every governing ADR (006/008/009/015) with zero new infrastructure, and scores highest on the axes that matter here (auditability 5, testability 5, modularity 5). Its two real weaknesses — security and multi-process consistency — are both *explicitly deferred by the spec* with reserved seams, so choosing it does not foreclose the harder version. Event Sourcing, the only other viable candidate, would re-litigate ADR-008 and impose an event store and read-projection rebuilds for audit value the change-set model already provides.

## Runner-Up Comparison

- Runner-up: Event Sourcing.
- Why it lost: ADR-008 already chose change-sets with inline inverse payloads over an event log; event sourcing adds unbounded storage, snapshotting, and a full read-path rework for no additional v1 capability, and the spec explicitly puts revision tables out of scope. Same-or-worse on cost/operability, no win on the dominant auditability driver that the change-set model doesn't already deliver.

## Consequences

**Positive:**
- INV-01 (mutation ⇔ exactly one record) is enforced at one place; no route can silently skip audit (Enforcement below). The atomicity delta (F4) makes INV-01 hold even on a change-set-persist failure: the feature mutation rolls back so "mutation without a record" cannot occur (memory: compensating `rollback()`; SQL: transaction).
- Undo works without revision tables (inline inverse payloads).
- The agent plane inherits audit/undo/idempotency for free by calling `executeCommand`.
- Persistence swap (SQLite/Drizzle → Postgres) is an adapter change (ADR-015).

**Negative / Tradeoffs:**
- Bespoke revert executor + registry to maintain (no library).
- Every mutation route now depends on the gateway (intentional coupling to the choke point).
- No redo in v1 (revert is terminal; the restore write is not itself a change set).

**Risks:**
- Risk: concurrent revert of the same change set double-applies (RT-003) → plan: compare-and-set the `applied` status inside the synchronous flip step; add the concurrency EC test; document single-in-flight assumption; real isolation with the SQLite adapter (txn + row lock).
- Risk: future SQLite `(workspaceId, idempotencyKey)` unique violation surfaces as a 500 (RT-004) → plan: the SQLite `ChangeSetRepo` adapter maps the constraint violation to `DuplicateCommandError` → `DUPLICATE_COMMAND`; in-memory keeps read-then-check.
- Risk: `revert` shipped unauthenticated becomes hard to lock down later (RT-007) → plan: actor/authz context param reserved in the gateway + revert signatures now; named actions reserved; Security Agent review required.

## Mitigations Required

- Weak axis: **security (2)** — Mitigation: reserve the actor/authorization context parameter in `executeCommand` and the revert executor from day one; reserve named actions `admin.change-sets.read` / `admin.change-sets.revert`; do not expose `inversePayload` over HTTP. Owner: Programmer (seam) + Security Agent (design-time review). Enforcement: Code Review Required finding on any bypass or exposure; Security review before non-local deploy. Deadline/trigger: permissions feature / first non-local deployment.
- Near-weak axis: **data_consistency (3)** — Mitigation: compare-and-set status flip in revert; SQLite adapter uses transaction + unique index. Owner: Programmer. Enforcement: RT-003 EC test + adapter contract test. Deadline/trigger: SQLite adapter.

## Migration Safety (brownfield)

| Safety Item | Decision / Evidence | Owner |
|---|---|---|
| Expand/contract shape | Additive only: new `change_sets`/`change_set_items` storage; `PresentationSettingsRecord` gains `version` (additive column, default 1). No column drops/renames. | Programmer |
| Dual-write or read-routing plan | None needed — new write path wraps existing feature calls; no parallel store. Existing route response shapes preserved byte-for-byte (REQ-04/REQ-05). | Programmer |
| Backfill plan | Pre-existing presentation-settings row backfills `version = 1` on read/migration (RT-006, state.spec §2/§7); posts already have `version`. | Programmer |
| Reconciliation checks | INV-01 test: every mutation in the suite leaves exactly one change-set row (spec success signal). | TDD |
| Observability proving phase health | `change-set.applied`/`.reverted` outbox events + `changeSetId` correlation; change-history endpoints are the audit surface. | Programmer |
| Rollback test | Revert restores prior post fields + bumps version (AC-10); reverting is itself the app-level rollback. Code rollback = feature is additive/behind new routes, so revertible by disabling wiring. | TDD |
| Cutover approval and timing | Per-route: wiring `PUT posts` + `PATCH presentation` through the gateway is the cutover; response contracts unchanged so consumers need no coordination. | Coordinator/human |
| Point of no return | None hard — additive. The change is behind new modules + rewired routes with identical response shapes. | — |
| Post-cutover verification | Integration test: edit via API → revert via change-sets API restores content (spec success signal). | TDD |

## Re-evaluation Triggers

- Calendar: revisit at the permissions feature kickoff (auth lands → Art. VI exception closes).
- Scale: any move to multi-process serve or concurrent agent execution (invalidates the single-process idempotency/revert isolation assumption).
- Topology: SQLite/Drizzle adapter introduction (RT-003/RT-004 isolation moves into the DB) or the SPEC-003 desktop host running multiple sites.
- Dependency: multi-item / proposed change sets (agent-plan feature) — the single-item `position 0` assumption changes.

## Module / Service Boundaries

Hexagonal, within the existing `src/` modular monolith. Dependencies point inward to `core/ports`.

```
src/
  core/
    ports.ts                     # (existing) DomainEvent{actorId,changeSetId}, Clock/Id/Outbox ports
    commands/
      change-set.ts              # (existing draft) vocabulary + ChangeSetRepoPort + errors
      command.ts                 # (existing draft) executeCommand gateway (Decorator)
      revert.ts                  # (NEW) revert executor + version guard + precondition ordering
      appliers.ts                # (NEW) inverse-applier registry: register/resolve by (entityType, operation) + post & presentation appliers
      repo.memory.ts             # (existing draft) InMemoryChangeSetRepo (adapter #1)
      # repo.sqlite.ts           # (later, ADR-015) Drizzle adapter (adapter #2) — port shaped for it now
      __specs__/  __tests__/     # co-located (matches repo convention)
  features/
    post/post.ts                 # (existing) updatePost — wrapped mutation #1 (has version)
    presentation/presentation.ts # (MODIFY) add version field + backfill (REQ-05)
  server/routes/admin/
    posts/update.ts              # (MODIFY) rewire through gateway; response shape unchanged
    presentation/patch-active-theme.ts # (MODIFY) rewire through gateway
    change-sets/{list,get,revert}.ts   # (NEW) 3 endpoints (REQ-06/07)
  server/error-mapping/          # (MODIFY) map 5 new codes → HTTP (errors.spec §2)
```

**Directory Structure Decision (required):** Co-locate `__specs__/` and `__tests__/` with the owning module — `src/core/commands/__specs__` + `__tests__`, and route/integration tests under `src/server/__tests__/routes/`. This matches the existing repo layout (`src/features/post/__specs__`, `src/server/__tests__/`), overriding the generic "top-level specs/" hexagonal convention in favor of the project's established co-location.

## API / Event Contract Summary

Contracts downstream agents must respect (full shapes in api.spec.md / state.spec.md / errors.spec.md):

- `executeCommand({ envelope: CommandEnvelope, mutation: CommandMutation<T> }, deps): Promise<T>` — the single write path. `CommandEnvelope` carries `workspaceId`, `actor: CommandActor`, non-empty `summary`, optional `idempotencyKey`, optional `intentRef`. **RT-007 seam:** `actor`/authorization context is a first-class param now (fixed to `user-local`).
  - **Atomicity (audit F4 → REQ-01/BR-04/EC-08/AC-17, added 2026-07-07):** the feature mutation + change-set header + item commit as **one unit of work**. On the SQLite adapter (deferred, RT-004) this is a real transaction. On the in-memory adapter the equivalent all-or-nothing is a **compensating rollback**: `CommandMutation` carries an optional `rollback()` that restores the entity to its exact pre-execute record (verbatim, including `version`); if `changeSets.insert()` throws after `execute()`, the gateway invokes `rollback()` and re-throws, so no change set and no outbox event survive (INV-01 holds — no mutation without a record). Only outbox enqueue sits outside the boundary (BR-04). The post route supplies `rollback` by snapshotting the full prior `PostRecord` in `captureInverse`'s closure and `postRepo.save()`-ing it back.
- `ChangeSetRepoPort` — `findById`, `findByIdempotencyKey`, `listByWorkspace`, `save`. Two adapters (memory, SQLite). **RT-004:** SQLite adapter maps `(workspaceId, idempotencyKey)` unique-violation → `DuplicateCommandError`.
- Inverse-applier registry — `registerInverseApplier(entityType, operation, applier)`, `resolveInverseApplier(entityType, operation) | undefined`. Appliers: `post/update`, `presentation-settings/update`. Missing applier ⇒ `REVERT_NOT_POSSIBLE` before any entity write.
- HTTP: `GET/POST …/change-sets[/:id[/revert]]` (3 new); `PUT …/posts/:postId` + `PATCH …/presentation` rewired (response shapes byte-for-byte unchanged, REQ-04/05).
- Events: `change-set.applied` / `change-set.reverted` (outbox), each carrying `workspaceId`, `actorId`, `changeSetId` (INV-03).
- Error codes (errors.spec §2): `DUPLICATE_COMMAND`(409), `CHANGE_SET_NOT_FOUND`(404), `CHANGE_SET_INVALID_STATUS`(409), `REVERT_CONFLICT`(409), `REVERT_NOT_POSSIBLE`(422).

Contract test approach: **integration test** for the 5 HTTP endpoints (P1 ACs at route boundary); **consumer-driven/contract test** for `ChangeSetRepoPort` (shared suite both adapters must pass); **integration test** for the inverse-applier registry against real post/presentation repos.

## Enforcement

- No mutation path in `server/routes/admin/` may bypass `executeCommand` (Agent Directive; Code Review Required finding).
- `core/commands/*` must not import Express or any DB/adapter — depends only on `core/ports` (lint/import rule + Code Review).
- `inversePayload` must never be serialized over HTTP (api.spec §5; Code Review + Security review).
- INV-01/INV-05 are Required assertions in the test suite; a mutation without exactly one change set, or a partially-applied revert, is a build failure.

## Complexity Justification

| Article Violated | Why This Complexity Is Needed | Simpler Alternative Considered | Why Simpler Alternative Was Insufficient |
|-----------------|-------------------------------|-------------------------------|------------------------------------------|
| VI — Security-by-Default | The Tovu dev server has no auth layer yet; SPEC-001 is the mutation write path that must exist before the permissions feature. Blocking on auth would stall the whole roadmap. | Ship auth first, then the gateway. | Auth is a separate, larger feature (identity + sessions + named-action authz); the standing project decision is local-dev-only v1 with the exception recorded. Mitigation reserves the authz seam so this is not a breaking retrofit (RT-007). |

## Related Decisions

- Relates to: ADR-006 (rule-of-two — satisfied by memory+SQLite adapters and 2 inverse appliers), ADR-007 (workspace scoping), ADR-008 (change-set storage shape — this ADR implements its v1), ADR-009 (decoupling lanes — typed call + outbox retained), ADR-015 (Drizzle SQL layer — the SQLite adapter target).
- Enables: ADR-013/014/016 (agent plane / agentic document editing route through this gateway).
- Supersedes: none.
