# Implementation Outline: analytics (remediation — authz gap closure)

- Spec: SPEC-014 v1.0.0 (hash: sha256:c3a7c5b1c25acfc4d4c7e13a520a5f5b7a14003319eeebf70d40cbd603a7732a)
- ADR: ADR-PIPE-014 (Analytics Remediation — Close the `recent-hits` Authorization Gap; Defer Tier-3 Storage/Dashboard Build-Out)
- Status: PRODUCED
- Trigger result: Boundary Cross, Contract Change, Critical Cross-Boundary Invariant
- Date: 2026-07-13
- Author: Software Architect Agent

> Use this artifact only for post-ADR, pre-tasks structure. It defines module boundaries, public/exported contracts, wiring, data boundaries, and critical invariants. It must not contain pseudo-code, private helper inventories, or task sequencing.

## Trigger Decision Matrix

| Trigger | Applies? | Evidence | Source Trace |
|---|---:|---|---|
| Boundary Cross | yes | The fix crosses `src/identity` (permission registration) and `src/server/routes/admin/analytics` (route/handler) | ADR-PIPE-014 §1 |
| Contract Change | yes | New exported permission string `analytics.read`; `AdminAnalyticsRecentHitsDeps` gains a required field (`authorize`) | ADR-PIPE-014 Module/Service Boundaries |
| System Wiring | no | No queues, webhooks, async jobs, or new route registration — `server/app.ts`'s existing `registerAdminAnalyticsRecentHitsRoute(app, routeDeps)` call is untouched | ADR-PIPE-014 Module/Service Boundaries |
| Data And Persistence | no | No table, schema, or persisted-data shape changes; the fix is a request-time authorization check only | ADR-PIPE-014 Migration Safety |
| Brownfield Dependency | no | No existing consumer is retired or re-pointed; this is additive-only (see Migration Safety: Expand/contract shape) | ADR-PIPE-014 Migration Safety |
| Reverse-Spec Or Migration | no | Not a migration in the schema/consumer-retirement sense — see Data And Persistence row | — |
| Critical Cross-Boundary Invariant | yes | New invariant: the route must never serve hits to a principal lacking `analytics.read` (and no wildcard grant) — spans route handler + `identity.authorize()` | ADR-PIPE-014 Consequences/Mitigations Required |
| Parallelization Ambiguity | no | Single, self-contained slice (permission registration + route change + one test-file rewrite); no sequencing ambiguity for `/tasks` to resolve | ADR-PIPE-014 Migration Safety: Cutover approval and timing |

## Module Map

| Module/Domain | Owns | Responsibility | Public Contracts | Dependencies | Notes |
|---|---|---|---|---|---|
| `identity` (existing, extended) | Permission catalog | Registers `analytics.read` (new), unchanged `authorize()`/`PermissionCatalog` | C-001 | — | No new dependency direction — `identity` still depends on nothing new; `analytics` gains a dependency on `identity`, the universal pattern every other feature already has |
| `analytics` route layer (`src/server/routes/admin/analytics/`, existing, extended) | HTTP wiring for the recent-hits read | Route registration + `authorize()` gating (new) + existing workspace-guard/limit-parsing (unchanged) | C-002 | `identity` (`authorize()`, via `RouteDeps`), `analytics` domain (`LocalBufferSink`, unchanged) | Mirrors `routes/admin/settings/get-effective.ts` and `routes/admin/integrations/list.ts` shape exactly |
| `server` composition root (`src/server/app.ts`, unchanged) | Wires `RouteDeps` into every route registrar | No change needed — `authorize` is already a `RouteDeps` field and is already passed to this registrar | — | — | Confirmed by direct inspection: `registerAdminAnalyticsRecentHitsRoute(app, routeDeps)` (line 225) already receives the full `routeDeps` object |

## File Map

| File Path | Module | Creates / Changes | Public Contracts Housed | Responsibility | Why This Separation Exists | Notes |
|---|---|---|---|---|---|---|
| `src/identity/permissions.ts` | identity | changes | C-001 `analytics.read` registration | Registers the new permission string at module load, in the same block as `navigation.manage`/`integration.manage` | Existing single registration point for all permission strings beyond `BASE_CATALOG`; keeps the "one place to look" property intact | Follows the existing `registerPermission({...})` call shape immediately below the `navigation.manage`/`integration.manage` calls (or immediately after — ordering is not semantically significant, only registration completeness at module load) |
| `src/server/routes/admin/analytics/recent-hits.ts` | server routes | changes | C-002 `registerAdminAnalyticsRecentHitsRoute` (contract shape changes: `AdminAnalyticsRecentHitsDeps` gains `authorize`) | Adds the authorize-then-serve gate ahead of the existing workspace-id check and `list()` call | Isolating the check inline in the same handler (not a separate middleware) matches every other admin route in this codebase — no route in `src/server/routes/admin/**` uses route-level middleware for permission checks; all use the inline `getAuthedPrincipal` + `authorize()` dance | The existing `:workspaceId` 404 check and `?limit=` parsing are unchanged and untouched by this fix — only a new block is inserted between "resolve principal" and "call `analyticsSink.list()`" |
| `src/server/__tests__/routes/analytics-recent-hits.test.ts` | server routes (tests) | changes | (test-only, no public contract) | Rewritten to the real-session harness (`createRouteDeps()` + `registerAuthRoutes` + `requireAdminSession`) instead of the current bare no-auth standalone Express app | The current file's own header comment ("Not wired into `createApp()` yet... Auth is intentionally NOT re-tested here") is now false on two counts: the route *is* wired (see spec-manifest.md's already-recorded stale-comment finding) and, after this fix, auth genuinely must be tested here — it is no longer true that "this route registers no auth logic of its own" | Mirrors `src/server/__tests__/admin-integrations-routes.test.ts`'s exact harness-construction pattern (`buildTestApp()`-equivalent using `createRouteDeps()`, then layering `registerAuthRoutes`/`requireAdminSession`, then a real login to get a session cookie before calling the route under test) |

No changes to `src/server/app.ts`, `src/server/routes/types.ts` (`RouteDeps`), `src/analytics/*` (ingest/domain layer, untouched), or `apps/admin/src/sections/Analytics.tsx` (UI is unaffected — a 403 surfaces through the screen's existing `ErrorBanner`/error-state path, already covered by AC-36, no new UI state needed).

## Contract Map

| Contract ID / Name | File | Owner Module | Kind | Why Needed | Job | Inputs | Outputs | Validation | Errors | Effect Boundary | Complexity / Resource View | Aggregate-Risk Note | Spec/ADR Trace | Test Seam / Expectation |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| C-001 `analytics.read` permission registration | `permissions.ts` | identity | registered catalog entry (not a function) | The `authorize()` mechanism requires every checked permission string to exist in the code-side catalog (REQ-03's catalog-validation rule) — an unregistered string would make `authorize()` reject every caller, including the wildcard owner, as a broken/unknown permission | Declare `{ id: "analytics.read", owner: "analytics", description: "..." }` in the module-load registration block | N/A (static registration) | N/A | Must be a unique `id` string not already in `BASE_CATALOG` or the feature-registered block (verified: no `analytics.*` string exists today) | N/A | None (pure registration, runs once at module load) | O(1) | **Aggregate-risk:** if this registration is skipped but the route's `authorize()` call ships anyway, every caller (including the wildcard owner) is denied — a fail-closed but functionally broken route. Registration and the route change must land in the same commit. | REQ-14 (amended), ADR-PIPE-014 §1 | Unit/registration test: `isKnownPermission("analytics.read") === true` after module load (mirrors how `navigation.manage`/`integration.manage` are implicitly proven by the routes that use them succeeding in tests) |
| C-002 `registerAdminAnalyticsRecentHitsRoute` (amended) | `recent-hits.ts` | server routes | exported function (existing, contract amended) | The route's job changes from "serve any authenticated admin" to "serve only a principal holding `analytics.read` (or a wildcard grant)" — REQ-14's amended text | Given a request, resolve the authed principal, `authorize({principalId, permission: "analytics.read", workspaceId, entityType: "analytics-hit"})`; on denial return `403` with the standard `FORBIDDEN` envelope; on success, proceed exactly as today (workspace-id 404 check, `?limit=` parse, `list()`, project to 7 fields) | HTTP request (unchanged path/query shape) + `res.locals.principal` (set by `requireAdminSession`, already required ahead of this route in `server/app.ts`) | `200 { hits: [...] }` (unchanged shape) on success; `403 { error, code: "FORBIDDEN", details: { permission, reason } }` on denial (new) | `authorize()` runs before the existing workspace-id/limit logic — fail-closed ordering, matching `get-effective.ts`/`list.ts` | New: `FORBIDDEN` (403). Unchanged: implicit 404 via the existing workspace-id mismatch check | Explicit side effect: none beyond the existing read (`analyticsSink.list()`) — `authorize()` itself is a read-only check | O(1) added (one `authorize()` call; already O(1)-ish per existing route conventions) | **Aggregate-risk:** this is the single call site closing the Constitution Article VI EXCEPTION for this route — an incorrect `entityType`/`permission` string here would either fail-open (wrong permission always granted) or fail-closed-incorrectly (deny the legitimate owner); both are tested explicitly (see Test Seam) | REQ-14 (amended), AC-29 (unchanged: workspace mismatch → 404, now only reachable *after* passing authz — order matters, see Wiring Map), new AC (owner → 200, ungranted principal → 403) | Integration test at the real HTTP route + real session, per ADR-PIPE-014 Migration Safety Reconciliation checks: (a) seeded owner (wildcard) → `200`; (b) a principal with no `analytics.read`/wildcard grant → `403` with the `FORBIDDEN` envelope; (c) existing AC-27/28/29/30-33 all still pass once called through an authorized principal |

## Wiring Map

| Flow ID | Source | Transport/Call Type | Target | Payload/Contract | Ordering/Retry/Idempotency | Failure Handling | Trace |
|---|---|---|---|---|---|---|---|
| W-001 | `recent-hits.ts` handler | direct call | `identity.authorize()` (via `RouteDeps.authorize`) | `{ principalId, permission: "analytics.read", workspaceId, entityType: "analytics-hit" }` → `{ allowed, reason }` | Runs **first**, before the existing `:workspaceId` path-param match and before `?limit=` parsing — fail-closed ordering, matching `get-effective.ts`. This changes observable behavior for one edge case: a caller with a *mismatched* workspaceId **and** no `analytics.read` grant now gets `403` (authz-first) instead of `404` (workspace-check-first) — see Critical Invariants row INV-R1 for why this ordering choice is deliberate, not incidental. | Any thrown/rejected `authorize()` call is not expected (the existing pattern in `get-effective.ts`/`list.ts` does not special-case an `authorize()` throw) — mirrors existing sibling routes exactly, no new error-handling shape invented here | ADR-PIPE-014 §1, REQ-14 |
| W-002 | `recent-hits.ts` handler (post-authz) | direct call | `LocalBufferSink.list({ limit })` | unchanged from today | Unchanged — read-only, no retry needed | Unchanged | REQ-13, REQ-15 (unchanged) |
| W-003 | `src/server/__tests__/routes/analytics-recent-hits.test.ts` | test harness construction | `createRouteDeps()` + `registerAuthRoutes` + `requireAdminSession` + real login | Mirrors `admin-integrations-routes.test.ts`'s `buildTestApp()`-equivalent pattern | One-time per test-file setup; each test case logs in (or reuses a session cookie) before calling the route under test | N/A (test infrastructure) | ADR-PIPE-014 Migration Safety: Reconciliation checks |

## Data And Side-Effect Boundaries

| Boundary | Owner | Reads | Writes | Side Effects | Consistency / Transaction Rule | Migration / Dual-Write Path |
|---|---|---|---|---|---|---|
| `PermissionCatalog` (in-process `Map`, `identity/permissions.ts`) | identity | `authorize()` (unchanged), `isKnownPermission()` | `registerPermission({ id: "analytics.read", ... })` at module load (new entry, additive — `register()` is documented idempotent-overwrite, so re-registration on hot reload is safe) | None beyond the in-memory map insert | N/A — no transaction, in-process only | N/A — no persisted table backs this catalog; nothing to migrate |
| `analytics` in-memory hit buffer (`LocalBufferSink`) | analytics | `recent-hits.ts` (unchanged, now gated) | Unchanged — ingest path only, untouched by this ADR | None new | Unchanged | N/A |
| `identity.principals` / grants | identity (unchanged) | `authorize()` (unchanged mechanism, new permission string argument) | Not written by this change | None | N/A — read-only | N/A — the wildcard `"*"` grant on the seeded owner already covers the new string; no grant backfill (see ADR-PIPE-014 Migration Safety: Backfill plan) |

## Observability And Operational Expectations

| Surface / Flow | Required Signals | Correlation / Trace Context | Metrics | Logs | Alert / Runbook Need | Privacy / Secret Constraints | Trace |
|---|---|---|---|---|---|---|---|
| `GET .../analytics/recent-hits` 403 path | Standard `FORBIDDEN` envelope (`error`, `code`, `details: {permission, reason}`) — same shape every other gated admin route already emits | None new — no correlation id is added by this ADR (matches `settings`/`integrations`, which also carry none on this specific envelope) | None new required — no NFR discovery flagged a metric for this pass | Standard request logging (existing server middleware, unchanged) | N/A — no new alerting surface; a 403 here is operationally identical to a 403 on any other gated admin route | `details.reason` must never leak more than `authorize()` already discloses elsewhere (unchanged mechanism) — no new privacy surface | ADR-PIPE-014 Enforcement |

## Critical Invariants

| Invariant ID | Scope | Rule | Reason | Enforcement Surface | Test Expectation | Trace |
|---|---|---|---|---|---|---|
| INV-R1 (new) | `recent-hits.ts` handler | `authorize()` must run and must deny before any buffered hit data is read or returned to a principal lacking `analytics.read` (or a wildcard grant) | This is the exact security property Constitution Article VI's EXCEPTION-to-remediation closes; a bug that reorders this (e.g. reading `list()` before checking authz, or short-circuiting the check) reopens the original finding | `recent-hits.ts` (authorize-first ordering, matching `get-effective.ts`/`list.ts`) | Integration test: an ungranted principal's request results in zero observable hit data in the response body (403, no `hits` field), not merely a "checked but still returned" outcome | ADR-PIPE-014 Consequences, Constitution Article VI |
| INV-R2 (new, ordering note) | `recent-hits.ts` handler | Workspace-id mismatch (existing AC-29/404 check) is now evaluated **after** the authz check, per W-001's ordering — a caller with both a mismatched workspace id and no `analytics.read` grant receives `403`, not `404` | Fail-closed authorization must not depend on request shape the caller can manipulate cheaply (an attacker should not be able to distinguish "wrong permission" from "wrong workspace" by observing whether they get 403 vs 404 first) — matches the ordering already used by `get-effective.ts` (authorize before any request-shape validation) | `recent-hits.ts` | Integration test: request with mismatched `:workspaceId` **and** no grant → assert `403`, not `404`; separate test with matching `:workspaceId` **and** no grant → assert `403`; separate test with mismatched `:workspaceId` **and** a valid grant → assert `404` (existing AC-29, unchanged once authz passes) | ADR-PIPE-014 Wiring Map W-001 |
| INV-R3 (existing, unchanged, re-confirmed) | `LocalBufferSink.list()` | Never returns more than 500 rows (`MAX_LIST_LIMIT`), regardless of caller-supplied limit | INV-04 in feature.spec.md — unaffected by this ADR, re-confirmed here so the outline doesn't silently drop a previously-certified invariant while touching the same handler | `repo.memory.ts` (unchanged) | Existing AC-31 test continues to pass, now reachable only through an authorized caller | feature.spec.md INV-04, unaffected by this ADR |

## Brownfield / Migration Mapping (if applicable)

N/A in the schema/consumer-retirement sense — see ADR-PIPE-014 Migration Safety for the full narrative (Expand/contract shape: expand-only, no contract step exists because there is no prior authorization code path to retire).

| Source Behavior / Contract | Target Module / Contract | Preserve / Change | Characterization Evidence | Migration Safety Note |
|---|---|---|---|---|
| `recent-hits.ts` — no authz, session-gate only | `recent-hits.ts` — `authorize("analytics.read")` + session-gate | **Change** (the entire point of this ADR) — narrowing-only: every caller who could reach `200` before and holds `analytics.read`/wildcard still gets `200`; every caller who could reach `200` before but lacks the grant now gets `403` | Existing AC-27/28/29/30-33 (unchanged assertions) become the "preserve" half — they must all still pass once called through an authorized principal, proving the fix does not change response *shape*, only *reachability* | See ADR-PIPE-014 Migration Safety in full — no dual-write, no backfill, no phased cutover needed given the additive, narrowing-only nature of the change |

## Test Expectations

- Contract tests: N/A — no new port, no rule-of-two adapter pair introduced.
- Integration tests: C-002's authorize-then-403 path (new), re-verification of AC-27/28/29/30-33 through an authorized caller (regression), INV-R2's ordering pair (new).
- Property/invariant tests: INV-R1 (zero hit data leaks past a denial), INV-R2 (403-before-404 ordering), INV-R3 (500-row cap, re-confirmed unaffected).
- Characterization tests: The "preserve" row in Brownfield/Migration Mapping above — existing AC-27/28/29/30-33 assertions re-run unchanged through the new authorized-caller path is the characterization check proving no behavior other than reachability changed.
- Explicitly N/A suites with reason: No storage/rollup/dashboard test suite of any kind — ADR-PIPE-014 §2 defers that surface entirely; there is nothing to test because nothing is built.

## Downstream Handoff Notes

- Coordinator task-generation constraints: This is a single, non-parallelizable slice (permission registration + route change + one test-file rewrite must land together — see ADR-PIPE-014 Migration Safety: Reconciliation checks, which requires both the registration and the call site in the same commit to avoid a fail-closed-but-broken intermediate state). Do not split this into separate `[P]` tasks that could land out of order.
- TDD focus: Certify the failing `403`-for-ungranted-principal case **first** (Article II — behavior specified as a test before implementation), then the `200`-for-owner regression case, then INV-R2's ordering pair. Only after these are certified should the Programmer add the `authorize()` call to `recent-hits.ts`.
- Programmer architecture audit focus: Verify the new call matches `get-effective.ts`/`list.ts`'s exact shape (principal resolution → `authorize()` → 403-on-denial → proceed); verify `permissions.ts`'s new registration is additive (no existing entry edited); verify `analytics-recent-hits.test.ts`'s rewrite fully replaces the bare no-auth harness rather than layering auth on top of it inconsistently.
- Open risks or ambiguities: None beyond what ADR-PIPE-014's Consequences/Risks already names (the unresolved permission-namespace governance question; the fact that ADR-035/ADR-INDEX.md's prose still says `admin.analytics.view` and is now stale relative to this ADR's actual choice). Both are flagged for a follow-up documentation/governance pass, not blocking for this remediation.
