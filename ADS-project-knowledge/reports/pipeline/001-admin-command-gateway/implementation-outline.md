# Implementation Outline: admin-command-gateway

- Spec: SPEC-001 v1.0.0 (hash: sha256:768af10e49fcde7a6e8d9dc0f4b1193c0302201a480afc01d9fe20fafe25e5d6) — audit-reconciled 2026-07-07 (was 0230e96c…c7a0; external-audit F1–F4 applied + Red-Team re-affirmed)
- ADR: ADR-018
- Status: PRODUCED
- Trigger result: Boundary Cross, Contract Change, System Wiring, Data And Persistence, Brownfield Dependency, Critical Cross-Boundary Invariant, Parallelization Ambiguity
- Date: 2026-07-07T04:30:00Z
- Author: Software Architect

> Structural + contractual bridge from ADR-018 to tasks.md. No pseudo-code, no private helpers.

## Trigger Decision Matrix

| Trigger | Applies? | Evidence | Source Trace |
|---|---:|---|---|
| Boundary Cross | yes | Spans `core/commands` + `features/{post,presentation}` + `server/routes/admin` + `server/error-mapping` + `core/events` (outbox) | ADR-018 Module Boundaries; REQ-04/05/06/07/09 |
| Contract Change | yes | 3 new HTTP endpoints, 2 rewired endpoints, new `ChangeSetRepoPort`, inverse-applier registry, 2 new events, 5 new error codes | api.spec §1; REQ-06/07/09; errors.spec §2 |
| System Wiring | yes | Route → gateway → repo + outbox; revert → registry → feature repos → outbox | BR-01…BR-09; ADR-009 lanes |
| Data And Persistence | yes | New change-set storage; idempotency uniqueness; presentation `version` column + backfill; inverse payload | state.spec §1/§2/§7; REQ-02/03/05; RT-004/RT-006 |
| Brownfield Dependency | yes | Wraps existing `updatePost`/`setActiveTheme`; preserves route response shapes byte-for-byte | REQ-04/05; spec-manifest Brownfield refs |
| Reverse-Spec Or Migration | no | No reverse-spec; brownfield extension only | — |
| Critical Cross-Boundary Invariant | yes | INV-01 (mutation ⇔ one record), INV-05 (no partial revert), version-guard equality | INV-01…INV-05; BR-05/BR-06 |
| Parallelization Ambiguity | yes | Slices share the `ChangeSetRepoPort`/gateway contract; safe `[P]` order needs the wiring map | ADR-018 parallel plan |

## Module Map

| Module/Domain | Owns | Responsibility | Public Contracts | Dependencies | Notes |
|---|---|---|---|---|---|
| `core/commands` | mutation write path | Gateway, change-set vocabulary + port, revert executor, inverse-applier registry, in-memory adapter | C-001…C-006 | `core/ports` only | Must NOT import Express/DB (ADR-018 Enforcement) |
| `features/post` | post entity | Provides `updatePost` + `version`; post inverse applier target | existing `updatePost`, `PostRepoPort` | `core/ports` | Unchanged except consumed by applier |
| `features/presentation` | presentation settings | Adds `version` field + backfill; presentation inverse applier target | `setActiveTheme`, `PresentationSettingsRecord.version` | `core/ports` | REQ-05 modify |
| `server/routes/admin` | HTTP transport | 3 new change-set routes; rewire 2 mutation routes through gateway | C-007…C-011 (endpoints) | `core/commands`, features, error-mapping | No domain logic in handlers; no gateway bypass |
| `server/error-mapping` | error → HTTP | Map 5 new codes to status + body | errors.spec §2 | `core/commands` errors | Additive `code` field |
| `core/events` (existing) | async delivery | Deliver `change-set.applied`/`.reverted` | `OutboxPort` | — | Best-effort (BR-04) |

## File Map

| File Path | Module | Creates / Changes | Public Contracts Housed | Responsibility | Why This Separation Exists | Notes |
|---|---|---|---|---|---|---|
| `src/core/commands/command.ts` | core/commands | changes (draft exists) | C-001 `executeCommand`, C-002 `CommandEnvelope`/`CommandMutation`/`CommandActor` | The single mutation write path (Decorator) | Choke point enforcing INV-01; actor/authz seam (RT-007) | Reconcile draft vs certified tests |
| `src/core/commands/change-set.ts` | core/commands | changes (draft exists) | C-003 `ChangeSetRepoPort`, change-set/​item record types, `DuplicateCommandError` | Storage vocabulary + port contract | Rule-of-two port (memory + SQLite) | ADR-008 shape |
| `src/core/commands/revert.ts` | core/commands | **creates** | C-004 `revertChangeSet` | Precondition-ordered, guarded revert executor | Separate from gateway; owns INV-05 + version guard | BR-05…BR-09 |
| `src/core/commands/appliers.ts` | core/commands | **creates** | C-005 inverse-applier registry (`register`/`resolve`), C-006 post + presentation appliers | Map `(entityType, operation)` → inverse applier | Registry scales to N entity types w/o executor branching | 2 appliers = rule-of-two |
| `src/core/commands/repo.memory.ts` | core/commands | changes (draft exists) | `InMemoryChangeSetRepo` (adapter #1 of C-003) | In-memory persistence | Matches every existing Tovu repo | read-then-check idempotency |
| `src/features/presentation/presentation.ts` | features/presentation | changes | `PresentationSettingsRecord.version` | Add version field + backfill default 1 | REQ-05 guard input | additive column |
| `src/server/routes/admin/change-sets/list.ts` | server/routes/admin | **creates** | C-007 `CHANGE_SETS_LIST` | GET list newest-first, workspace-scoped | REQ-06 | no `inversePayload` exposure |
| `src/server/routes/admin/change-sets/get.ts` | server/routes/admin | **creates** | C-008 `CHANGE_SET_GET` | GET one + items | REQ-06 | items expose `revertible`, not payload |
| `src/server/routes/admin/change-sets/revert.ts` | server/routes/admin | **creates** | C-009 `CHANGE_SET_REVERT` | POST revert | REQ-07/08/10 | calls C-004 |
| `src/server/routes/admin/posts/update.ts` | server/routes/admin | changes | C-010 `POST_UPDATE` (rewired) | Wrap `updatePost` in gateway; summary `Update post {postId}` | REQ-04; response shape unchanged | RT-001 |
| `src/server/routes/admin/presentation/patch-active-theme.ts` | server/routes/admin | changes | C-011 `PRESENTATION_PATCH` (rewired) | Wrap `setActiveTheme`; summary `Set active theme {activeThemeId}`; item `entityType presentation-settings`/`entityId=workspaceId` | REQ-05; RT-001/RT-002 | response shape unchanged |
| `src/server/error-mapping/*` | server/error-mapping | changes | 5 code→HTTP mappings | Map new errors incl. `DUPLICATE_COMMAND` w/ `changeSetId` | errors.spec §2/§4 | additive |

## Contract Map

| Contract ID / Name | File | Owner Module | Kind | Why Needed | Job | Inputs | Outputs | Validation | Errors | Effect Boundary | Complexity/Resource | Aggregate-Risk Note | Spec/ADR Trace | Test Seam |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| C-001 `executeCommand` | command.ts | core/commands | exported fn | Single audited write path | Run idempotency→inverse-capture→execute→record-one-change-set | required `{ envelope: CommandEnvelope, mutation: CommandMutation<T> }`, deps `{ repo, clock, id, outbox? }` | `Promise<T>` (feature result) | summary 1..500 non-empty; idempotencyKey ≤200 | `DuplicateCommandError`; feature errors rethrown unmodified | Writes 1 change set + 1 item; enqueues `change-set.applied`; feature side effects | O(1) + 1 findByIdempotencyKey read | Ordering: idempotency BEFORE capture BEFORE execute (BR-01/02); throw ⇒ no row/no event (BR-03) | REQ-01/02/03/11/12; INV-01; ADR-018 | unit w/ fake repo/clock/id/outbox; assert one row + event ordering |
| C-002 `CommandEnvelope`/`CommandMutation`/`CommandActor` | command.ts | core/commands | exported types | Cross-cutting command metadata + inverse capture seam | Carry workspace/actor/summary/idempotency/intent; `captureInverse()` | see state.spec §2 | — | actor present (fixed `user-local`, kind `user`) | — | `captureInverse` reads pre-mutation state | — | RT-007: actor/authz first-class now | REQ-02/12 | type/contract test |
| C-003 `ChangeSetRepoPort` | change-set.ts | core/commands | port interface | Swappable persistence (rule-of-two) | Persist/read change sets + items | `findById(ws,id)`, `findByIdempotencyKey(ws,key)`, `listByWorkspace(ws)`, `save(record)` | records / null / array | `(workspaceId,idempotencyKey)` unique when key present | — | Adapter I/O | list O(n) v1 (in-memory) | **RT-004:** SQLite adapter maps unique-violation → `DuplicateCommandError` | REQ-02/03/06; state.spec §5/§6; ADR-006/015 | shared contract-test suite both adapters pass |
| C-004 `revertChangeSet` | revert.ts | core/commands | exported fn | Guarded, atomic undo | Evaluate preconditions in order, walk items desc `position`, apply inverses, flip status | required `{ workspaceId, changeSetId }`, deps `{ repo, registry, clock, outbox? }` | `Promise<ChangeSetRecord>` (reverted) | precondition order BR-05; strict version equality BR-06 | `CHANGE_SET_NOT_FOUND`, `CHANGE_SET_INVALID_STATUS`, `REVERT_NOT_POSSIBLE`, `REVERT_CONFLICT` | Entity restore writes (+1 version) + status flip + `change-set.reverted` | O(items); v1 items=1 | **INV-05** no partial apply; **RT-003** compare-and-set status flip so concurrent 2nd revert loses (`CHANGE_SET_INVALID_STATUS`) | REQ-07/08/10; INV-04/05; BR-05…09 | integration + concurrency EC test |
| C-005 inverse-applier registry | appliers.ts | core/commands | exported fns | Decouple executor from entity types | `registerInverseApplier(entityType,operation,fn)`, `resolveInverseApplier(entityType,operation)` | keys + applier fn | applier or `undefined` | resolve miss ⇒ caller raises `REVERT_NOT_POSSIBLE` BEFORE any write | — | none (pure lookup) | O(1) | Missing applier must be detected in precondition phase (BR-05 step 3) | REQ-07/10; EC-06; ADR-018 | unit; resolve/miss |
| C-006 post & presentation appliers | appliers.ts | core/commands | applier fns | Restore inverse for the 2 v1 entity types | Apply `inversePayload` as a new write, +1 version | `(item, deps)` | `Promise<void>` | entity exists + version guard passed (caller) | via C-004 | Writes entity (+1 version, refresh updatedAt BR-08) | O(1) | post restores title/slug/bodyJson/status; presentation restores activeThemeId | AC-10/AC-07; REQ-07 | integration vs real repos |
| C-007 `CHANGE_SETS_LIST` | change-sets/list.ts | server/routes/admin | HTTP GET | Change history | List newest-first, workspace-scoped | path `workspaceId` | 200 `{changeSets[]}` (no payload) | — | 404 unknown workspace; 500 | Read | O(n) | TB-01 tie-break `createdAt` desc then `id` desc | REQ-06; AC-08; api.spec §5 | integration |
| C-008 `CHANGE_SET_GET` | change-sets/get.ts | server/routes/admin | HTTP GET | Inspect one change set | Return header + items (`revertible` bool) | path `workspaceId,changeSetId` | 200 `{changeSet, items[]}` | — | 404 `CHANGE_SET_NOT_FOUND` | Read | O(items) | `inversePayload` NEVER serialized (api.spec §5) | REQ-06; AC-09 | integration |
| C-009 `CHANGE_SET_REVERT` | change-sets/revert.ts | server/routes/admin | HTTP POST | Undo | Invoke C-004, map result/errors | path params; empty body | 200 `{changeSet reverted}` | — | 409 CONFLICT/INVALID_STATUS, 422 NOT_POSSIBLE, 404 | Delegates to C-004 | — | — | REQ-07/08/10; AC-10/11/12/14 | integration |
| C-010 `POST_UPDATE` (rewired) | posts/update.ts | server/routes/admin | HTTP PUT | Audited post update | Wrap `updatePost` in gateway w/ summary + optional Idempotency-Key | body unchanged; header `Idempotency-Key?` | 200 pre-feature shape | body validation unchanged | 409 `DUPLICATE_COMMAND` (w/ changeSetId), existing 400/404/500 | Gateway write | — | **Response shape byte-for-byte unchanged (REQ-04)**; summary `Update post {postId}` | REQ-04; AC-05/06; RT-001 | integration + compat assertion |
| C-011 `PRESENTATION_PATCH` (rewired) | presentation/patch-active-theme.ts | server/routes/admin | HTTP PATCH | Audited theme set | Wrap `setActiveTheme`; item identity + summary | body unchanged; `Idempotency-Key?` | 200 pre-feature shape (+`version` iff serializer already full) | unchanged | 409 `DUPLICATE_COMMAND` | Gateway write | — | item `entityType presentation-settings`/`entityId=workspaceId` (RT-002); summary (RT-001) | REQ-05; AC-07; RT-001/002 | integration |

## Wiring Map

| Flow ID | Source | Transport/Call Type | Target | Payload/Contract | Ordering/Retry/Idempotency | Failure Handling | Trace |
|---|---|---|---|---|---|---|---|
| W-001 | `posts/update.ts` / `presentation/patch-active-theme.ts` | direct sync call | `executeCommand` (C-001) | `CommandEnvelope` + `CommandMutation` | idempotency by `(ws, Idempotency-Key)`; dup ⇒ reject | feature throw ⇒ rethrow, no row/event (BR-03) | REQ-04/05/11 |
| W-002 | `executeCommand` | direct sync call | `ChangeSetRepoPort.save` (C-003) | change-set + item | 1 header + 1 item, same logical step (BR-04) | — | REQ-01/02 |
| W-003 | `executeCommand` / `revertChangeSet` | outbox enqueue (async) | `OutboxPort` → `core/events` | `change-set.applied` / `.reverted` w/ ws/actor/changeSetId | best-effort; enqueue failure does NOT roll back row (BR-04) | rows remain source of truth; re-enqueueable | REQ-09; INV-03; ADR-009 |
| W-004 | `revertChangeSet` (C-004) | direct sync call | `resolveInverseApplier` (C-005) → applier (C-006) → feature repo | inverse payload | walk items desc `position`; version guard strict-eq (BR-06/07) | precondition fail ⇒ zero writes (INV-05); compare-and-set flip (RT-003) | REQ-07/08/10 |
| W-005 | routes | direct call | `server/error-mapping` | typed errors → HTTP+code | — | 500 catch-all unchanged | errors.spec §4 |

## Data And Side-Effect Boundaries

| Boundary | Owner | Reads | Writes | Side Effects | Consistency / Transaction Rule | Migration / Dual-Write Path |
|---|---|---|---|---|---|---|
| `change_sets` / `change_set_items` (in-memory v1; Drizzle SQLite later) | core/commands | change-set routes, revert executor | `executeCommand`, `revertChangeSet` only | `change-set.applied`/`.reverted` events | 1 mutation ⇔ 1 change set (INV-01); `(ws,idempotencyKey)` unique; item↔header FK; positions contiguous from 0 | New tables (additive); SQLite adapter = drop-in per ADR-015 |
| `posts` (existing) | features/post | gateway/applier via `PostRepoPort` | `updatePost` + post applier | — | version +1 per write; never decreases (INV-04) | unchanged |
| `presentation_settings` (existing) | features/presentation | gateway/applier | `setActiveTheme` + presentation applier | — | version +1 per write; **backfill existing row → 1** (RT-006) | additive `version` column, default 1 (Drizzle migration) |
| outbox (existing) | core/events | worker | gateway/revert enqueue | delivery | at-least-once, best-effort in v1 | unchanged |

## Observability And Operational Expectations

| Surface / Flow | Required Signals | Correlation / Trace Context | Metrics | Logs | Alert / Runbook Need | Privacy / Secret Constraints | Trace |
|---|---|---|---|---|---|---|---|
| `executeCommand` / revert write path | structured error codes; `change-set.applied`/`.reverted` events | `changeSetId` is the in-scope correlation id | N/A v1 (local dev; deferred to observability feature) | error taxonomy from errors.spec §2 | N/A local dev | `inversePayload` may hold full content snapshots — NEVER log or serialize over HTTP | REQ-09; INV-03; VIII |
| 5 HTTP endpoints | HTTP status + `code` body | `changeSetId` on DUPLICATE_COMMAND | N/A v1 | request/response error only | N/A | no payload in responses (api.spec §5) | api.spec §5/§6 |

## Critical Invariants

| Invariant ID | Scope | Rule | Reason | Enforcement Surface | Test Expectation | Trace |
|---|---|---|---|---|---|---|
| INV-01 | gateway write path | Mutation ⇔ exactly one change set; never one without the other | Audit trail integrity is the feature's purpose | `executeCommand` | property/integration: every suite mutation leaves exactly 1 row | INV-01; spec success signal |
| INV-02 | change-set status | Only `applied → reverted`; `reverted` terminal | No resurrecting/redoing reverted state in v1 | `revertChangeSet` | unit: illegal transitions rejected | INV-02 |
| INV-03 | emitted events | Every event carries non-empty ws/actor/changeSetId | Correlation + downstream projections | gateway/revert enqueue | assert event envelope fields | INV-03; AC-13 |
| INV-04 | entity version | Version never decreases; revert writes higher version | Optimistic-concurrency guard integrity | appliers (C-006) | unit: post/presentation version monotonic | INV-04; AC-10 |
| INV-05 | revert executor | No partial apply: any precondition/guard/applier failure ⇒ zero item writes | Prevent half-reverted corruption | `revertChangeSet` | integration: failure paths leave entity + status unchanged | INV-05; BR-05 |
| INV-006 `[internal-invariant]` | revert status flip | Re-assert `applied` in the same synchronous step as the flip to `reverted` (compare-and-set) | RT-003: async await points let two concurrent reverts both pass; CAS makes the 2nd lose with `CHANGE_SET_INVALID_STATUS` | `revertChangeSet` | concurrency test: two concurrent reverts of one change set ⇒ one succeeds, one 409 | RT-003; EC-01 |

## Brownfield / Migration Mapping

| Source Behavior / Contract | Target Module / Contract | Preserve / Change | Characterization Evidence | Migration Safety Note |
|---|---|---|---|---|
| `PUT posts` response shape | C-010 | **Preserve** byte-for-byte | AC-05 asserts pre-feature shape | compat test guards regression |
| `PATCH presentation` response shape | C-011 | **Preserve** (version only if serializer already full) | AC-07 | additive |
| `updatePost` (has `version`) | wrapped by gateway + post applier | Preserve signature | existing tests | consumed, not modified |
| `setActiveTheme` (no `version`) | +`version` field + backfill | **Change** (additive) | AC-07 seed=1 | backfill existing row → 1 (RT-006) |
| Draft `command.ts`/`change-set.ts`/`repo.memory.ts` | C-001/C-002/C-003 + adapter | **Reconcile** against certified tests | draft = VibeCoder-grade input | not ground truth (Const. Art. II) |

## Test Expectations

- Contract tests: `ChangeSetRepoPort` shared suite (C-003) both adapters must pass; inverse-applier registry (C-005) resolve/miss.
- Integration tests: all 5 HTTP endpoints (C-007…C-011) at route boundary — P1 ACs AC-05…AC-14; compat assertions on C-010/C-011 response shapes.
- Property/invariant tests: INV-01 (one-row), INV-05 (no partial revert), INV-004 version monotonicity, INV-006 concurrent-revert CAS (RT-003).
- Characterization tests: pre-feature response shapes for the two rewired routes (regression guard).
- Explicitly N/A suites: production metrics/tracing → deferred to observability feature (VIII note); multi-process idempotency → deferred to SQLite adapter (RT-004).

## Downstream Handoff Notes

- Coordinator task-generation constraints: **Phase order** — (1) core: C-003 port + in-memory adapter + C-001 gateway [highest risk, do first, reconcile draft]; (2) C-004 revert + C-005/C-006 registry+appliers [depends on 1]; (3) [P] presentation `version`+backfill (C-011 data), [P] outbox event wiring (W-003) [both after gateway contract]; (4) HTTP routes C-007…C-011 + error mapping [after 1+2 contracts]. `[P]` only within a phase; the shared `ChangeSetRepoPort`/gateway contract is the sequencing pin.
- TDD focus: Outcome Matrix from AC-01…AC-16 + INV-01…INV-05 + INV-006; prioritize INV-01 one-row property, version-guard equality (BR-06), and the RT-003 concurrency EC.
- Programmer architecture audit focus: no route bypasses `executeCommand`; `core/commands` imports only `core/ports`; `inversePayload` never leaves the process boundary; actor/authz param present in gateway + revert signatures (RT-007).
- Open risks or ambiguities: none blocking. Carried (adapter-stage): RT-004 SQLite unique→`DUPLICATE_COMMAND` mapping is an adapter contract, not wireable against the in-memory adapter now.
