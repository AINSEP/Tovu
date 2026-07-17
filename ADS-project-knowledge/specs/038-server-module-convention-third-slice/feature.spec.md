# Feature Spec: Server Module Convention — Third Slice (ADR-046 Phase 3)

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-038 |
| version | 1.0.0 |
| status | APPROVED |
| feature_name | FEAT-038-server-module-convention-third-slice |
| last_edited | 2026-07-16T00:00:00Z |
| owner | Leon Aburime |
| spec_agent | Spec Agent (in-session, direct — Claude Code host, dispatched subagent) |
| spec_mode | brownfield |

## Scope Note (disclosed — read this before assuming Phase 3 is "done")

SPEC-031 shipped the `ServerModuleHandle` convention's first slice (`core`, `forms`, `integrations`); SPEC-034 shipped the second slice (`media`, `taxonomy`, `integrations-admin`). This spec pulls the next 2 domains SPEC-034's own "Suggested next assignee" names as the natural continuation: **content** (posts/pages/change-sets/presentation — 11 route registrations, one cohesive admin-content concern) and **members** (admin CRUD + public sign-in — 6 route registrations, already narrow-typed via pre-existing `MembersRouteDeps`/`MemberPublicRouteDeps`).

**What did NOT move in this slice (explicit, not an oversight):** `requireAdminSession`'s `app.use("/api/admin", ...)` mounting — SPEC-034 investigated this and found it genuinely order-entangled with `registerAuthRoutes` (login must register before the gate mounts, or authentication breaks). Pulling it requires an actual design decision (absorb `registerAuthRoutes` into `core.ts` too, vs. widen `ServerModuleHandle` past its single-`registerRoutes`-call shape) that SPEC-034 correctly declined to make unilaterally. That decision is being raised to the user separately, not bundled into this mechanical slice. The remaining ~33 other `app.ts` route registrations (menus, users/roles/policies, settings, forms admin, redirects, storage/recovery, content-types/entries, SEO, comments moderation, analytics) stay inline — future slices, demand-paged.

## Problem Statement

**Current state:** the 11 posts/pages/change-sets/presentation admin routes and the 6 members admin+public routes are registered inline in `app.ts`'s `createApp()`, each imported individually (17 import lines total) — the same anti-pattern SPEC-031/034 already closed for 6 other domains: modules should "receive only the dependencies [they] need," not the full `RouteDeps` service locator.

**Desired state:** two new `ServerModuleHandle` factories — `createContentModule` and `createMembersModule` — each constructed from a genuinely narrow deps type, each calling the exact same pre-existing registrar function bodies (moved, not rewritten), wired into `createApp()` at the same relative position the inline blocks used to occupy.

## Requirements

- REQ-01: `src/server/routes/admin/content/deps.ts` (new) shall define `ContentRouteDeps` — a `Pick<RouteDeps, ...>` covering exactly what the 11 posts/pages/change-sets/presentation registrars read (read each registrar file directly to determine the exact field set; do not guess — likely candidates based on each domain's existing repo/port fields are `workspaceId`, `authorize`, `clock`, `idGen`, `postRepo`, `changeSets`, `outbox`, `presentationRepo`, plus whatever change-set revert's own dependencies are, confirm by reading `change-sets/revert.ts` directly since revert is the most complex of the 11).
- REQ-02: `src/server/modules/content.ts` (new) shall export `createContentModule(deps: ContentRouteDeps)` whose `registerRoutes(app)` calls all 11 registrars (4 posts, 2 pages, 3 change-sets, 2 presentation), byte-identical behavior to the pre-slice inline calls, same relative order.
- REQ-03: `src/server/modules/members.ts` (new) shall export `createMembersModule(deps: { admin: MembersRouteDeps; public: MemberPublicRouteDeps })` whose `registerRoutes(app)` calls all 6 registrars (4 admin, 2 public) — note this domain genuinely needs TWO deps objects (already split as `MembersRouteDeps`/`MemberPublicRouteDeps` in current `app.ts`, since the public sign-in routes have a different, narrower auth/rate-limit surface than the admin CRUD routes) — do not force them into one shape, preserve the existing two-type split.
- REQ-04: `app.ts`'s `createApp()` shall call the 2 new module factories instead of the 17 inline registrar calls they replace, at the same relative registration position, and shall remove the now-dead direct registrar imports.
- REQ-05: Behavior must be byte-identical from any external caller's perspective — same routes, same responses, same status codes, same auth gating. This is a refactor, not a behavior change.

## Acceptance Criteria

- AC-01 (REQ-01/02) [P1]: The full existing content-domain test suites (posts, pages, change-sets, presentation — find and run whatever `.test.ts` files already cover these routes, unmodified) still pass against the real `createApp()` composition, proving behavior is unchanged after retyping + module extraction.
- AC-02 (REQ-03) [P1]: The full existing members-domain test suites (admin members routes + public sign-in routes, unmodified) still pass against the real `createApp()` composition.
- AC-03 (REQ-04) [P1]: The full existing test suite passes unchanged after the extraction (exact same pass/fail counts as pre-slice, only the 2 known pre-existing unrelated failures) — this is a refactor, not a behavior change.
- AC-04 (REQ-04) [P1]: `npx tsc --noEmit -p .` stays clean; no dead imports remain (grep for the old direct registrar import paths in `app.ts` after the change — zero matches).

## Non-Goals

- `requireAdminSession`/`registerAuthRoutes` relocation — a real design decision, raised separately, not attempted here.
- Any other domain's route registrations (menus, users/roles/policies, settings, forms admin, redirects, storage/recovery, content-types/entries, SEO, comments moderation, analytics) — future slices.
- Any `deps.ts` (composition-root) change — the 2 new modules' factories receive already-built `RouteDeps` slices, same non-goal SPEC-031/034 established.
- A `content.ts` module covering entries/content-types (the ADR-043 Collections domain) — "content" here means posts/pages/change-sets/presentation specifically, matching SPEC-034's own naming of this as the next slice; Collections' own admin routes are a separate, not-yet-pulled domain.

## Constitution Compliance

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | No new dependency. |
| II — Test-First | COMPLIES | Every touched domain's pre-existing test suite re-run unmodified as the regression gate (AC-01/02/03) — same discipline SPEC-031/034 used. |
| III — Simplicity Gate | COMPLIES | 2 modules, narrow `Pick`-based deps types, no new abstraction beyond what SPEC-031/034 already established. |
| IV — Anti-Abstraction Gate | COMPLIES | Extends `ServerModuleHandle`'s existing consumer set (8 total after this slice); no new port, no new generic mechanism. |
| V — Integration-First Testing | COMPLIES | AC-01/02 both exercise the real `createApp()` composition against real (in-memory) adapters, not mocks. |
| VI — Security-by-Default | N/A | No authz surface change — same routes, same permission strings, same gates, unmoved. |
| VII — Spec Integrity | COMPLIES | This spec is the reference for the implementation it accompanies, including its own explicit scope limit (the auth-relocation non-goal). |
| VIII — Observability | N/A | No new observable signal. |
