# Implementation Outline: Core Module Auth Relocation

- Spec: SPEC-039 v1.0.0
- Status: PRODUCED (retroactive, backfilled after implementation per explicit user request)
- Trigger result: System Wiring, Critical Cross-Boundary Invariant — this is the one Phase 3 slice this session that is NOT purely mechanical. Gets the fullest outline treatment of the batch.
- Date: 2026-07-16T00:00:00Z (backfilled)
- Author: Software Architect (in-session, direct — Claude Code host, per explicit user request)

> SPEC-031 and SPEC-034 both investigated this exact relocation and declined to attempt it — this outline exists specifically to document why the deferral was correct, what changed to make it safe now (an explicit user design decision, not a new technical fact), and how the one real risk was closed with evidence rather than assumption.

## Trigger Decision Matrix

| Trigger | Applies? | Evidence |
|---|---:|---|
| Boundary Cross | yes | `src/server/modules/core.ts`, `src/server/app.ts`, plus the pre-existing `src/server/middleware/dev-auth.ts` (read, not modified) |
| Contract Change | yes | `createCoreModule()`'s signature widens from zero-argument to `(deps: RouteDeps)` — a real, disclosed breaking change to that one function's call contract |
| System Wiring | yes | The exact ordering of 3 concerns (ops routes, login registration, session-gate mount) inside one composition-root call |
| Critical Cross-Boundary Invariant | **yes — this is the load-bearing one** | Login must register before the session gate mounts, or the entire admin app becomes permanently unreachable (no session can ever be obtained). This is why 2 prior specs declined. |
| Parallelization Ambiguity | no | Single module, single ordering decision, no parallel work possible or attempted |

## The Design Decision (recorded, not re-derived)

Two options were on the table, both already investigated by SPEC-034:
1. **(chosen)** Absorb `registerAuthRoutes`/`requireAdminSession` into `core.ts`'s own `registerRoutes(app)` call, in the correct internal order. Keeps `ServerModuleHandle`'s existing single-`registerRoutes`-call shape untouched for every other module.
2. **(rejected)** Widen `ServerModuleHandle` itself to support ordered/interleaved cross-module registration. Higher blast radius — would touch the convention every other module (7 of them, after this slice) already depends on, to solve one module's edge case.

The user made this choice explicitly (recorded in SPEC-039's own Scope Note) after I presented both options with their tradeoffs via `AskUserQuestion`. This outline does not re-litigate it — it documents the choice was made deliberately, with the rejected alternative's cost stated, not silently assumed.

## Module/File Map

| File | Change | Notes |
|---|---|---|
| `src/server/modules/core.ts` | widened | `createCoreModule(deps: RouteDeps)` — registers ops routes, then `registerAuthRoutes(app, deps)`, then `app.use("/api/admin", requireAdminSession(deps))`, in that order, inside one `registerRoutes(app)` call |
| `src/server/app.ts` | changed | 2 dead imports removed (`registerAuthRoutes`/`requireAdminSession` no longer called directly); 3 separate calls collapsed into 1 `createCoreModule(routeDeps).registerRoutes?.(app)` |
| `src/server/__tests__/routes/core-module-auth-ordering.test.ts` | new | Real-HTTP proof of the load-bearing ordering property (see Test Expectations) |
| `src/server/__tests__/unit/server-modules.unit.test.ts` | changed | Existing core-module test updated to pass `createRouteDeps()` for the widened signature |

## Test Expectations (mapped to spec ACs) — the critical one

This is the one spec this session where I personally re-ran the exact test proving the risky property, rather than trusting the implementer's report alone — because the implementer's own turn ended early (mid-background-test-run) and its final report was incomplete. I independently inspected the diff, then ran the new test file myself.

| AC | Verified by |
|---|---|
| AC-01 (login still works) | `core-module-auth-ordering.test.ts`, test 1 — real HTTP `POST /api/admin/v1/auth/login` with valid credentials succeeds, `Set-Cookie` issued |
| AC-02 (gate still applies) | `core-module-auth-ordering.test.ts`, tests 2/3 — `GET /api/admin/v1/auth/me` and `GET /api/admin/v1/workspaces/.../posts` both 401 without a session cookie |
| **AC-03 (login NOT locked out by its own gate — the whole reason this spec exists)** | `core-module-auth-ordering.test.ts`, test 1 — makes the login request with **zero cookie header at all** (the exact "zero prior session" scenario), asserts `200` not `401`. **I re-ran this test myself independently** (`node --import tsx --test .../core-module-auth-ordering.test.ts`) — 3/3 pass, confirmed before committing. |
| AC-04 (auth-domain suites) | Pre-existing auth/session test files re-run unmodified — pass |
| AC-05 (full suite unchanged) | 1700/1698/2 — I re-ran this myself independently, matching the pre-slice baseline exactly |
| AC-06 (typecheck, dead imports) | `npx tsc --noEmit -p .` — I re-ran independently, clean |

## Critical Invariants

| Invariant | Rule | Enforcement | Test |
|---|---|---|---|
| INV-AUTH-ORDER | `registerAuthRoutes` must execute before `app.use("/api/admin", requireAdminSession(...))`, inside `createCoreModule`'s single `registerRoutes` call | Source order inside `core.ts`'s function body — a future edit that reorders these two lines would silently reintroduce total lockout | `core-module-auth-ordering.test.ts` test 1 (AC-03) — this test is the enforcement mechanism; it must never be deleted or weakened without deliberate review |

## Downstream Handoff Notes

- **Process note, not a code issue:** the implementer subagent's turn ended mid-task (a background `npm test` was still running when its context/turn budget ran out), leaving real, correct work uncommitted. I found it via `git status`, independently reviewed the diff line-by-line, ran the new test myself, then committed it — this is the pattern to repeat if it happens again: never trust an incomplete agent report, check the actual worktree state directly.
- If `ServerModuleHandle` is ever widened for ordered/interleaved registration in the future (option 2, above, revisited), `core.ts` could in principle be simplified back to 3 independent registrations — but there is no current driver for that; this slice's shape is stable as long as no other module needs cross-module ordering guarantees.
