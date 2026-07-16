# Feature Spec: Boot, Readiness, and Shutdown Lifecycle (ADR-046 Phase 2)

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-030 |
| version | 1.0.0 |
| status | APPROVED |
| feature_name | FEAT-030-boot-readiness-lifecycle |
| last_edited | 2026-07-16T00:00:00Z |
| owner | Leon Aburime |
| spec_agent | Spec Agent (in-session, direct — Claude Code host) |
| spec_mode | brownfield |

## Scope Note (disclosed)

ADR-046 Phase 2, scoped to the CONCRETE gap that exists in this codebase today, not a speculative
general framework. Investigation of `src/server/deps.ts` found exactly the failure mode the ADR
describes: `settingsReady`, `seoReady`, and `newsletterReady` are fire-and-forget promises
attached to `RouteDeps`, awaited only ad hoc per-route (`sitemap.ts`/`robots.ts` await `seoReady`;
`settings/get-effective.ts` awaits `settingsReady`) — never awaited at boot before
`app.listen()` binds the socket. Worse: `settingsReady`/`seoReady` have no `.catch()` anywhere in
their chain (unlike `newsletterReady`/`menuBindingsReady`, which self-swallow and log) — a
rejection there is an unhandled-promise-rejection today, not a clean boot failure.

Phase 3 (the `src/server/modules/*` composition split) has NOT happened yet, so this spec does
NOT introduce per-feature bootstrap modules — that is Phase 3's job. This spec introduces the
generic `prepare`/`start`/`stop` lifecycle CONVENTION (`boot-lifecycle.ts`) plus its FIRST four
concrete users, all defined in `index.ts` (the one real top-level boot path, matching SPEC-022's
own precedent for where boot-only logic must live so `deps.ts`/`app.ts` stay synchronous and
every existing hermetic test call site is untouched — INV-06).

`menuBindingsReady` (`deps.ts`) is explicitly OUT of scope — see Non-Goals.

## Problem Statement

**Current state:** the process becomes reachable (accepts HTTP traffic) before `settingsReady`/
`seoReady`/`newsletterReady` are known to have succeeded. A slow or failing settings/SEO seed at
boot is invisible until a request happens to hit a route that awaits it, or (for
`settingsReady`/`seoReady` specifically) becomes an unhandled rejection with no clean shutdown or
diagnostic. There is no `/readyz`, no typed module-status view, and no boot-failure rollback.

**Desired state:** `index.ts`'s `main()` runs a typed boot lifecycle before `app.listen()`.
Critical modules (settings, SEO) block boot on failure with a clear, structured log and
`process.exit(1)` — never an unhandled rejection, never a socket bound on broken critical state.
Optional modules (newsletter, the store plugin) get the same typed status reporting but a failure
only disables that module. `/readyz` reports aggregate critical readiness; `/healthz` reports
process liveness only; an authenticated admin route reports full per-module status.

## Requirements

- REQ-01: `src/server/boot-lifecycle.ts` shall define `ModuleLifecycleStatus`
  (`ready` | `disabled` | `failed`, the latter two carrying `reasonCode` + `remediationHint`), a
  `BootModule` contract (`name`, `owner`, `criticality`, `prepare`, `start`, `stop`), and
  `runBootLifecycle()`.
- REQ-02: `runBootLifecycle()` shall run every module's `prepare()` in array order, then every
  successfully-prepared module's `start()` in array order (two-stage, per the ADR's
  reversible-resource-then-external-work split).
- REQ-03: On a CRITICAL module's `prepare()` or `start()` failure, `runBootLifecycle()` shall call
  `stop()` on every module that already completed `prepare` and/or `start`, in REVERSE array
  order, wait for completion, and return `{ ok: false, ... }` — no further modules start.
- REQ-04: On an OPTIONAL module's `prepare()` or `start()` failure, that module is recorded
  `failed` and the lifecycle continues with the remaining modules; overall `ok` is unaffected.
- REQ-05: `runBootLifecycle()` shall NOT call `stop()` on a module whose own `prepare()` threw
  before returning (per the ADR's round-2 correction: a module's own `prepare` implementation, not
  the orchestrator, is responsible for cleaning up whatever it acquired before throwing).
- REQ-06: `index.ts`'s `main()` shall build 4 `BootModule`s — `settings` (critical,
  `deps.settingsReady`), `seo` (critical, `deps.seoReady`), `newsletter` (optional,
  `deps.newsletterReady`), `store-plugin` (optional, wraps the existing `bootstrapStore()` call) —
  run them through `runBootLifecycle()`, and `process.exit(1)` with a structured failure log if
  the result is not `ok`, BEFORE calling `createApp()`/`app.listen()`.
- REQ-07: `src/server/readiness-state.ts` shall hold the latest `BootResult` (module-level, not
  request-scoped), defaulting to `{ ok: true, modules: [] }` so hermetic test app construction
  (`createApp(createRouteDeps())`, which never calls `runBootLifecycle`) never sees a stale or
  undefined readiness state.
- REQ-08: `GET /healthz` shall report process liveness only (no dependency checks), mirroring the
  existing `/health` route's behavior exactly (both remain registered — no route removal).
- REQ-09: `GET /readyz` shall return HTTP 200 with `{ ready: true }` when every CRITICAL module in
  the current readiness snapshot is `ready`, else HTTP 503 with `{ ready: false, failures: [...] }`
  listing only critical failures' `name`/`reasonCode` (no remediation hints, no owner internals —
  a public-adjacent operational endpoint, minimize leaked detail).
- REQ-10: `GET /api/admin/v1/system/module-status` shall be an authenticated,
  `system.read`-gated route returning every module's full status (`name`, `owner`, `criticality`,
  `lifecycle`), mirroring the admin route authorization shape used throughout this session
  (workspace-id 404 check, then `authorize()`, then 403-on-denial).
- REQ-11: `src/identity/permissions.ts` shall register `system.read`.

## Acceptance Criteria

- AC-01 (REQ-01/02) [P1]: unit tests prove prepare-then-start ordering and that `start()` is never
  called for a module whose `prepare()` failed.
- AC-02 (REQ-03) [P1] — fault-injection case (a): 3 critical modules where the 3rd's `start()`
  throws; assert modules 1 and 2's `stop()` are both called, in reverse order (2 before 1), and
  module 3's `stop()` is NOT called (it never completed `start`).
- AC-03 (REQ-05) [P1] — fault-injection case (b): a critical module whose `prepare()` acquires a
  fake resource then throws; assert the module's own cleanup ran (proves self-cleanup
  responsibility) and the orchestrator's reverse-order `stop()` loop did NOT call `stop()` on that
  same module.
- AC-04 (REQ-04) [P1]: an optional module's `prepare()` failure is recorded `failed`, the next
  module still runs, and overall `ok` is `true` when no critical module failed.
- AC-05 (REQ-06) [P2]: `index.ts`'s wiring type-checks and an integration test (constructing the
  same 4-module shape against real `deps.ts` promises) proves settings/SEO seeding still succeeds
  end-to-end through the new lifecycle wrapper.
- AC-06 (REQ-08/09) [P1]: `/healthz` always 200s; `/readyz` 200s when the readiness snapshot has
  no critical failures, 503s with a failures array when it does, and defaults to 200 when no
  snapshot was ever set (hermetic test app).
- AC-07 (REQ-10/11) [P2]: `/api/admin/v1/system/module-status` 403s an unauthorized principal and
  200s with the full module list for one holding `system.read` (or `*`).

## Non-Goals

- Splitting `deps.ts`/`app.ts` into `src/server/modules/*` — that is Phase 3, a separate SPEC.
- `menuBindingsReady` (`deps.ts`) — not exposed on `RouteDeps` today; folding it into the typed
  lifecycle would require widening `RouteDeps`/`app.ts` for a module that already self-swallows
  and logs identically to what the new "optional" status would report. Left as-is; a natural
  follow-up when `RouteDeps` needs to grow for another reason anyway.
- Any REAL background interval worker (outbox claim loop, webhook delivery worker) — none exists
  in this codebase yet; `processOutbox()` is entirely request-driven today (fire-and-forget after
  specific writes), and ADR-046's own fold-in item 2 demand-pages a durable/running outbox worker
  to "activation of the first production SMTP mailer adapter," which has not happened. The
  `prepare`/`start`/`stop` convention this spec introduces is exactly what such a worker would
  plug into later — this spec builds the socket, not a worker to put in it.
- Graceful `SIGTERM` shutdown wiring in `index.ts` (calling `stop()` on every started module on
  process shutdown) — the orchestrator's `stop()` semantics support it, but `index.ts` does not
  yet install a signal handler; today's process model has no long-lived workers to drain, so there
  is nothing a shutdown handler would currently need to wait for. Follow-up once a real worker
  exists.
- `resolveRuntimeMode()`-conditional behavior for critical-failure handling — critical boot
  failures `process.exit(1)` in every mode, not just production (this fixes a real defect —
  today's unhandled rejection on `settingsReady`/`seoReady` failure — universally, not only under
  the separate, pre-existing, production-only `runProductionReadinessGate`).

## Constitution Compliance

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | No new dependency; plain async/await orchestration. |
| II — Test-First | COMPLIES | Unit suite covers ordering, both required fault-injection cases, and the readiness-route status codes before this doc was finalized. |
| III — Simplicity Gate | COMPLIES | No generic topological dependency resolver — the 2 critical modules' real dependency (SEO defs need settings migrated first) is already encoded in `deps.ts`'s own promise chaining (`seoReady = settingsReady.then(...)`), so array order alone is sufficient; not a speculative general scheduler. |
| IV — Anti-Abstraction Gate | COMPLIES | `BootModule` has exactly 4 concrete implementations at introduction (rule-of-two and beyond), all in `index.ts`, not a new port with zero consumers. |
| V — Integration-First Testing | COMPLIES | AC-05 runs the wrapper against real `deps.ts` promises, not only mocks. |
| VI — Security-by-Default | COMPLIES | `/readyz`'s 503 body is deliberately minimized (names + reason codes only, no remediation hints/owners) to avoid leaking internal boot detail on a lower-trust endpoint; the full detail lives behind `system.read` admin auth. |
| VII — Spec Integrity | COMPLIES | This spec is the reference for the implementation it accompanies. |
| VIII — Observability | COMPLIES | This IS the observability gain the ADR asks for: typed lifecycle status, `/readyz`, module-status admin view, replacing swallowed/unhandled boot failures. |

## Implementation Record

- `src/server/boot-lifecycle.ts`: `ModuleLifecycleStatus`, `BootModule`, `BootModuleResult`,
  `BootResult`, `runBootLifecycle()`.
- `src/server/readiness-state.ts`: `setReadinessSnapshot()`/`getReadinessSnapshot()`.
- `src/server/routes/ops/health.ts`: adds `registerHealthzRoute`, `registerReadyzRoute`.
- `src/server/routes/admin/system/module-status.ts`: new admin route.
- `src/identity/permissions.ts`: `system.read`.
- `src/index.ts`: `main()` rewritten to build the 4 boot modules, run `runBootLifecycle()`, exit
  on critical failure, set the readiness snapshot, then proceed to `createApp()`/`listen()`.
- Tests: `src/server/__tests__/unit/boot-lifecycle.unit.test.ts`,
  `src/server/__tests__/integration/boot-lifecycle-real-deps.integration.test.ts`,
  `src/server/__tests__/routes/readiness-routes.test.ts`,
  `src/server/__tests__/routes/module-status-route.test.ts`.

## Handoff Contract

- **Inputs used:** direct inspection of `index.ts`'s `main()`, `deps.ts`'s fire-and-forget boot
  promises (confirmed which have `.catch()` and which don't), `routes/ops/health.ts`,
  `identity/permissions.ts`'s existing `storage.read` precedent for adding a narrowly-scoped
  ops-style permission.
- **Output summary:** the concrete boot-ordering defect (unhandled rejection risk on
  settings/SEO seed failure; process reachable before critical seeding is known-good) is fixed.
  `/readyz` and the module-status admin view give an operator the visibility ADR-046 Phase 2 asks
  for.
- **Risks:** the two Non-Goals around graceful shutdown and a real background worker are
  disclosed, deliberate deferrals, not gaps discovered after the fact.
- **Suggested next assignee:** Coordinator, for ADR-046 Phase 3 (composition-root split) — likely
  the first phase in this program where a `/debate` earns its cost, per this session's
  discussion of module-boundary design latitude.
