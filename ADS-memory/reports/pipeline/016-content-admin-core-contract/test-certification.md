# Test Certification Record

- Test Suite: content-admin-core-contract (`core/gated-mutations`)
- Spec ID: SPEC-016
- Spec Version: 1.4.0
- Spec Hash: sha256:eade503dc1cc72dddad16eb54f3098dada29954493b6d8f964ac51ca0e06194f
- Spec Hash Verification: `python3 AI-Dev-Shop/framework/spec-providers/speckit/validators/validate_spec_package.py ADS-memory/specs/016-content-admin-core-contract --phase preflight` → `PASS: strict Speckit package passed mechanical validation.` (exit 0), run 2026-07-15 by TDD Agent. Matches `pipeline-state.md`'s recorded `spec_hash` and `planning_preflight_spec_hash`.
- ADR: `ADS-memory/reports/pipeline/016-content-admin-core-contract/adr.md` (ADR-PIPE-016)
- Implementation Outline: `ADS-memory/reports/pipeline/016-content-admin-core-contract/implementation-outline.md` (PRODUCED)
- Critical Internal Constraints: `ADS-memory/reports/pipeline/016-content-admin-core-contract/critical-internal-constraints.md` (PRODUCED — U-001–U-004)
- Tasks: `ADS-memory/reports/pipeline/016-content-admin-core-contract/tasks.md`
- Certified At: 2026-07-15T00:00:00Z
- Certified By: TDD Agent
- Naming Convention: `__tests__/unit/*.unit.test.ts` / `__tests__/integration/*.integration.test.ts` — new-pipeline-work convention recorded in `ADS-memory/knowledge/project_memory.md` (2026-07-15 entry); import style / assertion library (`node:test` + `node:assert/strict`) and flat spec-ref-named `test()` blocks match this repo's existing convention (see `src/core/commands/__tests__/authorize-gateway.test.ts`).

## Test File Inventory

| Test File | Type | Spec Refs | sha256 | Expected Test Count | Red Evidence |
|---|---|---|---|---:|---|
| `src/core/gated-mutations/__tests__/unit/token.unit.test.ts` | unit | C-005, U-003, INV-03, INV-04, AC-14, AC-35, state.spec.md §3 | sha256:e70d9f325ad7ddc4d65d3dd83cd65456eda597efdf9589695a314e26bbe9d8cf | 10 | Fails to resolve `../../token` (module does not exist yet — no implementation has been written); expected compile/import failure, not a setup typo |
| `src/core/gated-mutations/__tests__/unit/watermark.unit.test.ts` | unit | C-004, U-002-B1, REQ-01, AC-02 | sha256:82c9ef7074f54960479d97b70840db2ca01ad22d8237fb2c8f21cb28c6c7c7ae | 2 | Fails to resolve `../../watermark` |
| `src/core/gated-mutations/__tests__/unit/gateway.unit.test.ts` | unit | C-001, C-002, C-003, U-001, INV-05, INV-08, REQ-09–REQ-15, REQ-22-adjacent (AC-09 architectural guard), AC-09–AC-22, AC-35, AC-38 | sha256:d2fe046a7f459759fd8ba8341b784c7a5b2de812dd9c21d4481c42d14b8d1817 | 17 | Fails to resolve `../../gateway` |
| `src/core/gated-mutations/__tests__/unit/actor-identity.unit.test.ts` | unit | C-006, REQ-16–REQ-18, INV-06, AC-23, AC-24 | sha256:e495153d95cb677785162a6c56321a204d3c37f9cd7c38330c5fae12e3e5bd41 | 6 | Fails to resolve `../../actor-identity` |
| `src/core/gated-mutations/__tests__/integration/watermark-transaction.integration.test.ts` | integration | C-004, U-002, INV-01, EC-01, AC-01, U-004/REQ-04 (shared setup) | sha256:4ca137c7908731832d50559f2b0b2bf25f2c14d6ea1cbd188e68cf1a04143c6c | 5 | Fails to resolve `../../watermark`; `stampWatermarkTx`/`getCurrentWatermark`/`reconcileMirror` do not exist |
| `src/core/gated-mutations/__tests__/integration/boot-reconciliation.integration.test.ts` | integration | U-004, REQ-03–REQ-05, EC-05, AC-06 | sha256:f9eeb9f114cd89e94e65c8af1c0470ec6a6a7866688522809c969e26f8c3372a | 4 | Fails to resolve `../../watermark` |
| `src/core/gated-mutations/__tests__/integration/db-ops.integration.test.ts` | integration | C-007, REQ-19–REQ-21, AC-28, AC-29, AC-30, AC-33, AC-36, AC-37 | sha256:2e4a87ee7a5efc768311e0057925b512e7eb845170e79d8a4a031f1e3d7f1304 | 7 | Fails to resolve `../../../../infra/sqlite/db-ops` and `../../../../infra/postgres/db-ops` (neither exists yet) |

**Total expected runnable tests: 51.** All seven files currently fail at import/module-resolution time because no implementation exists yet (`src/core/gated-mutations/{gateway,watermark,token,actor-identity,ports}.ts`, `src/infra/sqlite/db-ops.ts`, `src/infra/postgres/db-ops.ts` are all pending — this is the expected TDD red phase, verified by running `node --import tsx --test "src/core/gated-mutations/**/*.test.ts"` and observing `ERR_MODULE_NOT_FOUND`/TS resolution failures for each file, not an assertion failure).

## Assumed Seam Design (Programmer Contract)

No implementation exists yet, so each test file's header docstring records the exact assumed
TypeScript interface the Programmer should implement to satisfy the Contract Map (C-001–C-008).
These are TDD-authored seam proposals consistent with `implementation-outline.md`'s Inputs/Outputs/
Validation/Errors columns and CIC's designated units — not a mandated internal design. A Programmer
who needs a different shape to satisfy the same observable contract should record a `[CIC_DEVIATION]`
(for CIC-designated units U-001–U-004) or simply adjust non-CIC-governed seams, in either case
without changing the certified tests' observable assertions.

Key exported surfaces assumed:
- `src/core/gated-mutations/ports.ts`: `PrincipalKind`, `AuthorizeFn`, `RestoreCapability`, `DbOpsPort`
- `src/core/gated-mutations/token.ts`: `ConfirmationTokenRecord`, `TokenStorePort`, `InMemoryTokenStore`, `mintToken`, `isRedeemable`, `redeemToken`, `expireToken`, `TokenExpiredError`, `TokenAlreadyRedeemedError`
- `src/core/gated-mutations/watermark.ts`: `stampWatermark` (unit-level, fake tx), `stampWatermarkTx` (real Drizzle tx callback), `getCurrentWatermark`, `reconcileMirror`, `WatermarkTransactionRequiredError`
- `src/core/gated-mutations/gateway.ts`: `plan`, `confirm`, `execute`, `GatedMutationHooks<TDetails,TResult>`, `GatewayDeps`, `ForbiddenError`, `PlanStaleError`, `UnauthenticatedError`, `ValidationError`
- `src/core/gated-mutations/actor-identity.ts`: `appendActorReference`, `WorkspaceMismatchError`
- `src/infra/sqlite/db-ops.ts`: `SqliteDbOpsAdapter`
- `src/infra/postgres/db-ops.ts`: `evaluatePostgresRestoreCapability` (pure capability-decision logic only — full adapter execution deferred, see Known Gaps)
- `src/infra/db/schema.ts`: additive `storage_write_watermark` singleton-row table

## Covered Requirements

| Spec Ref | Priority | Test File | Test Name (excerpt) | Type | Assertion Summary | Status |
|---|---|---|---|---|---|---|
| REQ-01 / AC-01 | P1 | watermark-transaction.integration.test.ts | `AC-01 / U-002-B1: stampWatermarkTx inside a real transaction advances...` | Integration | Watermark advances by exactly 1 atomically with a same-transaction sibling write | Certified |
| REQ-01 / AC-02 | P1 | watermark.unit.test.ts | `AC-02 / U-002-B1: stampWatermark rejects when called outside an open transaction` | Unit | Throws `WatermarkTransactionRequiredError` outside a transaction | Certified |
| REQ-01 / AC-39, AC-40 | P1/P2 | — | — | — | Postgres-backed watermark stamping — see Known Gaps (deferred, Medium risk) | Gap |
| REQ-02 / AC-03 | P1 | — | — | — | Requires a real dependent-domain write-service (Collections/Taxonomy) which does not exist in this package's scope — see Known Gaps | Gap |
| REQ-02 / AC-34 | P2 | — | — | — | Doc-audit-only AC (spec-completeness check on dependent domains' own `api.spec.md`), not code-observable — see Known Gaps | Gap |
| REQ-03 / AC-04 | P2 | boot-reconciliation.integration.test.ts | (mirror reconciliation coverage) | Integration | Mirror refreshed to authoritative value at next reconciliation opportunity | Certified (via reconcileMirror's boot-path test; periodic-tick trigger itself is a caller/scheduler concern outside this module's own contract) |
| REQ-04 / AC-05 | P1 | watermark-transaction.integration.test.ts, boot-reconciliation.integration.test.ts | `U-004 / REQ-04: reconcileMirror sets the mirror to content.db's authoritative value...`, `U-004-B1 / REQ-04: ...unconditionally overwrites...` | Integration | Mirror set to `content.db`'s live value, never from `storage_ledger` | Certified |
| REQ-05 / AC-06 | P1 | boot-reconciliation.integration.test.ts | `U-004-B2 / U-004-F1 / REQ-05 / EC-05: content.db failing to open...`, `AC-06 / REQ-05: mirror.staleness === 'unrefreshable'...` | Integration | Failed open leaves mirror untouched, `staleness='unrefreshable'` | Certified |
| REQ-06 / AC-07 | P1 | db-ops.integration.test.ts | `AC-30: capturing a restore point...` (asserts `watermarkAtCapture`) | Integration | Captured restore-point artifact records `watermarkAtCapture` | Certified |
| REQ-07 / AC-08 | P1 | — | — | — | Disclosure copy/labeling itself is dependent-domain UI (SPEC-017/019) — see Known Gaps | Gap |
| REQ-08 / AC-09 | P1 | gateway.unit.test.ts | `AC-09: plan() rejects when the caller lacks {domain}.read`, `architectural guard (AC-09): gateway.ts exposes no direct single-call mutation entry point...` | Unit | No bypass entry point exists; unauthorized plan() rejected | Certified |
| REQ-09 / AC-10 | P1 | gateway.unit.test.ts | `AC-10: plan() succeeds for a principal holding only {domain}.read...` | Unit | plan() succeeds, no mutation invoked | Certified |
| REQ-09 / AC-11 | P2 | gateway.unit.test.ts | `AC-11: plan() returns an identical planHash for user, agent, and api_key...` | Unit | Identical `planHash` across principal kinds | Certified |
| REQ-10 / AC-12 | P1 | gateway.unit.test.ts | `AC-12: an agent principal calling confirm()...` | Unit | Agent rejected regardless of permission | Certified |
| REQ-10 / AC-13 | P1 | gateway.unit.test.ts | `AC-13 / INV-04: a user lacking the gated mutation's permission...` | Unit | No token minted on denial | Certified |
| REQ-10 / AC-14 | P1 | gateway.unit.test.ts, token.unit.test.ts | `AC-14: an authorized user's confirm() mints a token with exactly a 600-second TTL...` | Unit | Exact 600s TTL, bound fields | Certified |
| REQ-11 / AC-15 | P1 | gateway.unit.test.ts | `AC-15 / U-001-B1 / U-001-ORD1: authorize() is evaluated fresh...` | Unit | FORBIDDEN before TOKEN_EXPIRED when both fail | Certified |
| REQ-11 / AC-16 | P1 | gateway.unit.test.ts | `AC-16 / AC-17 / U-001-B3: a recomputed plan hash mismatch...` | Unit | Hash mismatch rejects before mutation | Certified |
| REQ-11 / AC-35 | P1 | gateway.unit.test.ts, token.unit.test.ts | `REQ-11 / AC-35: execute() with a confirmationToken string never minted...` | Unit | Unknown token → `TOKEN_EXPIRED` | Certified |
| REQ-12 / AC-17 | P1 | gateway.unit.test.ts | (same as AC-16 test) | Unit | `PlanStaleError`, no durable mutation | Certified |
| REQ-13 / AC-18 | P1 | gateway.unit.test.ts | `AC-18 / EC-08: a user redeeming a token minted by a different user...` | Unit | `FORBIDDEN`/`ACTOR_CLASS_MISMATCH` | Certified |
| REQ-13 / AC-19 | P1 | gateway.unit.test.ts | `AC-19 / EC-07: an agent redeeming a token whose confirmerPrincipalId is not its current delegatedBy...` | Unit | `FORBIDDEN`/`ACTOR_CLASS_MISMATCH` | Certified |
| REQ-13 / AC-20 | P1 | gateway.unit.test.ts | `AC-20: an agent redeeming a token whose confirmerPrincipalId equals its current delegatedBy succeeds` | Unit | Redemption succeeds | Certified |
| REQ-13 / AC-38 | P1 | gateway.unit.test.ts | `AC-38 / U-001-B2 / U-001-ORD3: actor-class mismatch AND a stale plan together...` | Unit | `FORBIDDEN`, never `PLAN_STALE` | Certified |
| REQ-14 / AC-21 | P1 | gateway.unit.test.ts (indirect) | `AC-15`'s ordering test proves authorize-before-token-state; no idempotency-key field exists at this layer per `api.spec.md` | Unit | Ordering proven at the layer that exists; see Known Gaps note | Certified (indirect) |
| REQ-15 / AC-22 | P1 | gateway.unit.test.ts | `AC-22 / REQ-15: execute() re-evaluates authorize() fresh...` | Unit | Fresh (uncached) authorize() call at execute()-time | Certified |
| REQ-16 / AC-23 | P1 | actor-identity.unit.test.ts | `AC-23 / REQ-16: the populated reference carries the composite...` (×3 variants: direct, agent-delegated, api_key) | Unit | Composite pair shape for all 3 principal kinds | Certified |
| REQ-17 / AC-24 | P1 | actor-identity.unit.test.ts | `AC-24 / REQ-17: the returned reference is a plain value object with no DB-level FK metadata...` | Unit | Pure value object, no FK coupling | Certified |
| REQ-18 / AC-25, AC-26, AC-27 | P1 | — | — | — | Orphan-tolerant read filtering and reconciliation sweep require a real dependent-domain referencing table (none exists in this package) — see Known Gaps | Gap |
| REQ-19 / AC-28 | P1 | db-ops.integration.test.ts | `AC-28: a SQLite-backed site's getCapabilities()...` | Integration | `cheap`/`file-snapshot` | Certified |
| REQ-19 / AC-29 | P1 | db-ops.integration.test.ts | `AC-29: a Postgres-backed site with no dump/blue-green tooling...` | Integration | `unavailable` | Certified |
| REQ-19 / AC-33 | P1 | db-ops.integration.test.ts | `AC-33: a Postgres-backed site with pg_dump/blue-green tooling configured...` | Integration | `expensive`/`logical-dump` | Certified |
| REQ-19 / AC-36 | P2 | db-ops.integration.test.ts | `AC-36: ...tooling present but non-functional...` | Integration | `unavailable`, identical to never-configured | Certified |
| REQ-19 / AC-37 | P2 | db-ops.integration.test.ts | `AC-37: a site whose only configured restore mechanism is an externally-managed PITR...` | Integration | `kind='external'`, `costClass='unavailable'` | Certified |
| REQ-20 / AC-30 | P1 | db-ops.integration.test.ts | `AC-30: capturing a restore point for a SQLite-backed site...` | Integration | Whole-file online-backup copy | Certified |
| REQ-21 / AC-31 | P1 | — | — | — | Postgres capture/restore execution + blue-green repoint — see Known Gaps (deferred) | Gap |
| REQ-22 / AC-32 | P1 | — | — | — | Agent-tool catalog is instantiated per dependent domain, not by this package's own code — see Known Gaps | Gap |

## Outcome Matrix

| Module | State | Input | Expected Outcome | Spec Ref |
|---|---|---|---|---|
| `gateway.ts` (`execute`) | valid token, authorize denies | any `confirmationToken` | `ForbiddenError` (never `TokenExpiredError`) | AC-15, U-001-ORD1 |
| `gateway.ts` (`execute`) | already-redeemed token, actor-class also mismatched | valid principal/token | `TokenAlreadyRedeemedError` (never `ForbiddenError`) | U-001-ORD2 |
| `gateway.ts` (`execute`) | actor-class mismatch, plan also stale | valid unexpired unredeemed token | `ForbiddenError`/`ACTOR_CLASS_MISMATCH` (never `PlanStaleError`) | AC-38, U-001-B2/ORD3 |
| `gateway.ts` (`execute`) | every check passes | valid token | domain mutation runs exactly once | INV-03 |
| `gateway.ts` (`confirm`) | `principalKind='agent'` | any permission state | `ForbiddenError` | AC-12 |
| `gateway.ts` (`confirm`) | `principalKind='user'`, authorize denies | `{planId, planHash}` | `ForbiddenError`, no token created | AC-13, INV-04 |
| `watermark.ts` (`stampWatermark`) | `tx=null` | none | `WatermarkTransactionRequiredError` | AC-02, U-002-B1 |
| `watermark.ts` (`stampWatermarkTx`) | open real transaction | none | counter +1, same commit as sibling write | AC-01, U-002-B2 |
| `watermark.ts` (`reconcileMirror`) | `db` opens successfully | mirror's stale prior value | mirror overwritten to authoritative value | REQ-04, U-004-B1 |
| `watermark.ts` (`reconcileMirror`) | `db=null` (failed open) | mirror's prior value | mirror untouched, `staleness='unrefreshable'` | REQ-05, U-004-B2/F1 |
| `token.ts` (`redeemToken`) | token `status='minted'`, unexpired | valid token string | transitions to `redeemed`, returns record | (baseline) |
| `token.ts` (`redeemToken`) | token `status='redeemed'` | same token string, second call | `TokenAlreadyRedeemedError` | INV-03 |
| `token.ts` (`redeemToken`) | token string never minted | garbage/forged string | `TokenExpiredError` (indistinguishable from real expiry) | REQ-11, AC-35 |
| `token.ts` (`redeemToken`) | N concurrent callers, one minted token | same token string ×N | exactly 1 success, N-1 `TokenAlreadyRedeemedError` | U-003-B1, INV-03 |
| `actor-identity.ts` (`appendActorReference`) | `actorWorkspaceId !== referencingRowWorkspaceId` | any actor id | `WorkspaceMismatchError` | INV-06 |
| `infra/sqlite/db-ops.ts` (`getCapabilities`) | SQLite-backed | none | `{costClass:'cheap', kind:'file-snapshot'}` | AC-28 |
| `infra/postgres/db-ops.ts` (`evaluatePostgresRestoreCapability`) | tooling configured+valid | config object | `{costClass:'expensive', kind:'logical-dump'}` | AC-33 |
| `infra/postgres/db-ops.ts` (`evaluatePostgresRestoreCapability`) | tooling present but broken | config object | `{costClass:'unavailable'}` (same as never-configured) | AC-36 |
| `infra/postgres/db-ops.ts` (`evaluatePostgresRestoreCapability`) | only external PITR configured | config object | `{kind:'external', costClass:'unavailable'}` | AC-37 |

## Property-Based Tests

No property-testing library exists in this repo's `package.json` (no `fast-check`/`jsverify`
dependency) — property tests below are hand-rolled generative loops over a range of concurrency
levels, consistent with `test-design` skill's Property-Based Testing section in spirit (iterating
the invariant across a generated domain rather than one fixed example).

| Spec Ref | Property / Invariant | Generator Domain | Test Name | Status |
|---|---|---|---|---|
| INV-03 / U-003-B1 | Exactly one winner under N-way concurrent redemption of one token | concurrency ∈ {2, 5, 10} | `U-003-B1 / INV-03 (property): under N concurrent redemption attempts...` | Certified |
| INV-01 | Watermark never decreases across any sequence of stamps | 10 sequential stamps, value observed after each | `INV-01: storage_write_watermark's value is never observed to decrease...` | Certified |
| INV-01 (sequential correctness) | Final value = initial + N after N sequential single-increment transactions | N=25 | `INV-01 (sequential correctness): N transactions each incrementing once...` | Certified |

## Contract Tests

| Contract Source | Testing Approach | Test Name | Status | Gap / Waiver |
|---|---|---|---|---|
| C-001 `plan()` | integration-style (real fakes, no external service) | `AC-11: plan() returns an identical planHash for user, agent, and api_key...` | Certified | N/A |
| C-002 `confirm()` | integration-style | `AC-14: an authorized user's confirm() mints a token...` | Certified | N/A |
| C-003 `execute()` | integration-style, exhaustive 2-failure-combination per outline's Test Expectations | `AC-38`, `U-001-ORD2` tests | Certified | N/A |
| C-004 `stampWatermark()` | integration (real SQLite via `better-sqlite3`) | `watermark-transaction.integration.test.ts` (whole file) | Certified | N/A |
| C-005 token lifecycle | unit (state-transition table) | `token.unit.test.ts` (whole file) | Certified | N/A |
| C-006 `appendActorReference()` | unit | `actor-identity.unit.test.ts` (whole file) | Certified | N/A |
| C-007 `DbOpsPort` | integration (real SQLite adapter; pure-function Postgres capability logic) | `db-ops.integration.test.ts` (whole file) | Certified (SQLite + capability-decision logic); Postgres adapter execution itself deferred | See Known Gaps |
| C-008 `AuthorizeFn`-shaped closure | N/A per outline ("reuses `identity/authorize`'s own existing test suite; no new test surface") | — | N/A | N/A |

## Known Gaps

| Spec Ref | Reason Not Covered | Risk | Resolution |
|---|---|---|---|
| AC-03 (REQ-02) | Requires a real dependent-domain write-service (Collections entries or Taxonomy terms) calling `stampWatermark()` inside its own commit — that write-service does not exist in this package's scope (owned by SPEC-018/SPEC-020) | Medium | Each dependent domain's own TDD pass must add an integration test proving its write-service calls `stampWatermark()` in the same transaction; tracked here so it isn't silently assumed covered |
| AC-34 (REQ-02) | Doc-completeness check on a dependent domain spec's own `## Integration Contracts` section — not code-observable, an audit-checklist item | Low | Verified by Red-Team/Architecture Audit of each dependent spec, not a TDD test |
| AC-39, AC-40 (REQ-01, Postgres) | No Postgres adapter/connection exists in this codebase yet (confirmed absent); same-transaction atomicity and MVCC row-locking serialization can only be tested against a real Postgres instance | Medium | Deferred to whenever the Postgres adapter is built (SPEC-017's own OQ-03-adjacent scope); this is an architected deferral (`implementation-outline.md`'s own Test Expectations section), not an oversight |
| AC-08 (REQ-07) | Disclosure copy/labeling ("states partial coverage explicitly") is UI text owned by SPEC-017 (Timeline)/SPEC-019 (Recovery) | Low | Covered by those packages' own TDD passes |
| AC-25, AC-26, AC-27 (REQ-18) | Orphan-tolerant read filtering and reconciliation-sweep behavior require a real polymorphic/actor-identity referencing table in a dependent domain; this core package defines only the pure population helper (`appendActorReference`), not a read path or sweep job | Medium | Each dependent domain's own TDD pass (SPEC-017/018/019/020) must test read-time orphan tolerance and its own reconciliation sweep against this rule |
| AC-31 (REQ-21) | Postgres restore-point capture (`pg_dump -Fc`) and blue-green restore execution — architecturally deferred, no adapter exists | Medium | Deferred to the Postgres adapter's own future implementation + TDD pass |
| AC-32 (REQ-22) | Agent-tool catalog naming/callability is instantiated per dependent domain (e.g. SPEC-017's `storage_plan_migrate_forward`); this core package defines the rule but produces no catalog of its own | Low | Each dependent domain's own TDD pass tests its own catalog against this rule |
| AC-21 (REQ-14) indirect coverage | This package's own 3 endpoints have no idempotency-key field (per `api.spec.md`'s own note); the underlying `authorize()`-before-shortcut ordering is proven only at the token-state-check boundary (AC-15), not against a literal idempotency-key short-circuit | Low | Dependent domains that add idempotency-key fields to their own ordinary-mutation endpoints must test REQ-14 directly, mirroring `src/core/commands/__tests__/authorize-gateway.test.ts`'s existing EC-08/INV-04 pattern for `core/commands` |
| EC-06 (restore point predates `watermarkAtCapture` column) | No `restore_points` table exists in this package (owned by SPEC-019); legacy-row backward-compatibility is that domain's own migration concern | Low | SPEC-019's own TDD pass |
| U-002-B2 (Postgres half) / EC-01 (Postgres half) | Same as AC-39/AC-40 above | Medium | Same resolution |
| U-002-B2 (SQLite half), true concurrent-process interleaving | A single synchronous Node test process cannot produce genuine concurrent-thread interleaving; `watermark-transaction.integration.test.ts` demonstrates SQLite's WAL single-writer serialization via a second `Database` connection's `BEGIN IMMEDIATE` contention (a real, if not fully representative, proxy) rather than a true concurrent-load benchmark | Medium | SPEC-016's own OQ-01 already tracks the unbenchmarked concurrent-writer cost question, owed at SPEC-017 sign-off; this is a pre-existing open question, not a new gap this TDD pass introduces |

No High-risk gaps exist. All P1 acceptance criteria for code that exists in this package's own
module boundary (per `implementation-outline.md`'s Module Map) have test coverage; every
documented gap above is either (a) architecturally deferred per the outline's own Test
Expectations section, (b) owned by a dependent domain's own module boundary and TDD pass, or (c)
a doc-completeness/audit-only check that is not code-observable.

## Drift Status

- [x] Current spec hash matches certified hash above (`sha256:eade503dc1cc72dddad16eb54f3098dada29954493b6d8f964ac51ca0e06194f`)
- [x] Current spec hash was verified mechanically via the provider-local validator, not by visual comparison
- [x] Current test file hashes match the Test File Inventory (computed via `shasum -a 256`, this run)
- [x] Expected test count (51) is greater than zero and matches the runnable suite inventory (sum of per-file `test(` counts)
- [x] All High-risk gaps have been reviewed by Coordinator — none exist
- [x] No test asserts implementation internals (only observable behavior — public function results, thrown typed errors, persisted state)
- [x] All P1 acceptance criteria in this package's own module boundary have semantic assertion coverage, not only structural test-name mapping
