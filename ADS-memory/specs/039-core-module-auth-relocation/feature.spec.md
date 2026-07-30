# Feature Spec: Core Module Auth Relocation (ADR-046 Phase 3)

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-039 |
| version | 1.0.0 |
| status | APPROVED |
| feature_name | FEAT-039-core-module-auth-relocation |
| last_edited | 2026-07-16T00:00:00Z |
| owner | Leon Aburime |
| spec_agent | Spec Agent (in-session, direct — Claude Code host, dispatched subagent) |
| spec_mode | brownfield |

## Scope Note (disclosed — this is a design decision, not a mechanical move)

SPEC-031's `createCoreModule()` explicitly declined to move `requireAdminSession`'s `app.use("/api/admin", ...)` mounting: `registerAuthRoutes` registers `POST /api/admin/v1/auth/login` (an `/api/admin`-prefixed route) BEFORE the session gate mounts — Express matches by registration order, so login must stay registered ahead of the gate or authentication breaks entirely (no way to obtain a session without an already-gated login route). SPEC-034 investigated this again and confirmed the same blocker, correctly declining to attempt it unilaterally.

**User decision (2026-07-16):** absorb `registerAuthRoutes` into `core.ts` too, so `core.ts` owns both the login routes AND the session-gate mount together, in the correct order — keeping `ServerModuleHandle`'s existing single-`registerRoutes`-call shape untouched for every other module. The alternative considered (widening `ServerModuleHandle` to support ordered/interleaved cross-module registration) was explicitly rejected as higher blast radius for one edge case.

## Problem Statement

**Current state:** `createCoreModule()` takes zero arguments and only registers 3 standalone ops routes (`/`, `/healthz`, `/readyz`). `registerAuthRoutes(app, routeDeps)` and `app.use("/api/admin", requireAdminSession(routeDeps))` are called separately, inline in `app.ts`, immediately after `createCoreModule().registerRoutes?.(app)` — both order-sensitive relative to every subsequent admin route registration.

**Desired state:** `createCoreModule(deps: RouteDeps)` (now taking deps, since auth needs them) registers ops routes, then auth routes, then mounts the session gate — all three in the exact same relative order as today, as one `registerRoutes(app)` call. `app.ts` calls `createCoreModule(routeDeps).registerRoutes?.(app)` once; nothing else in `app.ts` calls `registerAuthRoutes`/`requireAdminSession` directly anymore.

## Requirements

- REQ-01: `src/server/modules/core.ts`'s `createCoreModule` shall accept a `deps: RouteDeps` parameter (widened from zero-argument — this is the one module in this repo's `ServerModuleHandle` convention that genuinely needs the full `RouteDeps`, not a narrow `Pick`, since `requireAdminSession`/`registerAuthRoutes` themselves are typed against full `RouteDeps` upstream in `middleware/dev-auth.ts` — do not attempt to narrow that file's own signature as part of this spec, out of scope).
- REQ-02: `createCoreModule`'s `registerRoutes(app)` shall call, in this exact order: (1) `registerHealthRoute`/`registerHealthzRoute`/`registerReadyzRoute` (unchanged), (2) `registerAuthRoutes(app, deps)`, (3) `app.use("/api/admin", requireAdminSession(deps))`. This order is load-bearing — verify by reading `middleware/dev-auth.ts`'s own `registerAuthRoutes`/`requireAdminSession` bodies before implementing, don't just copy the order from `app.ts` without understanding why login must precede the gate.
- REQ-03: `app.ts` shall remove its own direct `registerAuthRoutes(app, routeDeps)` call and `app.use("/api/admin", requireAdminSession(routeDeps))` call, replacing both with the single `createCoreModule(routeDeps).registerRoutes?.(app)` call, at the same relative position those three concerns (ops routes, auth routes, session gate) currently occupy as a block.
- REQ-04: `app.ts`'s now-dead direct imports of `registerAuthRoutes`/`requireAdminSession` from `middleware/dev-auth` shall be removed IF `dev-auth` exports nothing else `app.ts` still needs directly (check first — `dev-auth.ts` may export other things like `getAuthedPrincipal` that individual route files import separately, which is fine and unrelated to this spec; only remove the specific imports this spec makes dead).
- REQ-05: Behavior must be byte-identical from any external caller's perspective: same login/logout/me routes, same 401-on-missing-session behavior for every `/api/admin` route, same ordering guarantees. This is a refactor, not a behavior change.

## Acceptance Criteria

- AC-01 (REQ-02) [P1]: A request to `POST /api/admin/v1/auth/login` with valid credentials still succeeds and returns a session, proving login itself still works post-relocation.
- AC-02 (REQ-02) [P1]: A request to any gated `/api/admin/...` route WITHOUT a session cookie still returns `401 UNAUTHENTICATED`, proving the gate still mounts and still applies.
- AC-03 (REQ-02) [P1]: A request to `POST /api/admin/v1/auth/login` itself, made WITHOUT any prior session, still succeeds (i.e. login is NOT accidentally caught by its own gate) — this is the exact ordering property SPEC-031/034 both flagged as the reason this couldn't be a naive move; prove it explicitly with a real HTTP test, not just by code inspection.
- AC-04 (REQ-01/03) [P1]: The full existing auth-domain test suites (whatever `.test.ts` files already cover login/session/`requireAdminSession` — find and run them unmodified) still pass against the real `createApp()` composition.
- AC-05 (REQ-03/04) [P1]: The full existing test suite passes with the exact same pass/fail counts as before this slice (2 known pre-existing failures, nothing else) — verify by comparing counts before/after, same method as SPEC-038.
- AC-06 (REQ-04) [P1]: `npx tsc --noEmit -p .` stays clean; no dead imports remain in `app.ts` for the two specific relocated calls.

## Non-Goals

- Narrowing `requireAdminSession`/`registerAuthRoutes`'s own signature away from full `RouteDeps` — out of scope, a separate concern from where the CALL SITE lives.
- Any other domain's route registrations — this spec is scoped to exactly the auth/session relocation, nothing else.
- Any change to session/auth BEHAVIOR (token format, cookie settings, rate limiting) — purely a call-site relocation.

## Constitution Compliance

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | No new dependency. |
| II — Test-First | COMPLIES | AC-01–05 verified against the real `createApp()` composition, including the specific ordering property (AC-03) that made this risky enough to defer twice before. |
| III — Simplicity Gate | COMPLIES | `core.ts` grows to own auth registration + the session gate together — a genuine, disclosed widening of one module's scope, not a new abstraction. |
| IV — Anti-Abstraction Gate | N/A | No new port/adapter. |
| V — Integration-First Testing | COMPLIES | AC-01–03 are all real-HTTP-boundary proofs, especially the ordering property in AC-03. |
| VI — Security-by-Default | COMPLIES | The session gate's actual enforcement is unchanged — this spec only moves WHERE the mount call happens, verified by AC-02 continuing to 401 correctly. |
| VII — Spec Integrity | COMPLIES | This spec is the reference for the implementation it accompanies, including the explicit user decision it records. |
| VIII — Observability | N/A | No new observable signal. |
