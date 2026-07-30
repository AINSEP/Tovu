# Feature Spec: Server Module Convention — Fifth Slice (ADR-046 Phase 3)

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-041 |
| version | 1.0.0 |
| status | APPROVED |
| feature_name | FEAT-041-server-module-convention-fifth-slice |
| last_edited | 2026-07-16T00:00:00Z |
| owner | Leon Aburime |
| spec_agent | Spec Agent (in-session, direct — Claude Code host, dispatched subagent) |
| spec_mode | brownfield |

## Scope Note

Continuing the ADR-046 Phase 3 sweep (SPEC-031 → 034 → 038 → 039 → 040). This slice pulls **forms admin** (7 registrations), **redirects** (7), and **analytics** (1) — 15 registrations total, leaving only storage/recovery + content-types/entries + SEO after this.

- Forms admin routes currently use plain `RouteRegistrar`/full `RouteDeps` — no narrow type exists yet, create one.
- Redirects already has a narrow `RedirectRouteRegistrar`/`RedirectRouteDeps` type, defined (same unusual-location pattern as menus) in `src/server/http/admin/redirects.ts`, not a `deps.ts` in the redirects route dir — reuse it, don't redefine.
- Analytics' single route (`recent-hits.ts`) already has its own narrow `AdminAnalyticsRecentHitsDeps` type — reuse it directly, this module is nearly trivial (one registrar, already-typed).

## Requirements

- REQ-01: `src/server/routes/admin/forms/deps.ts` (new) shall define a narrow `FormsRouteDeps` type covering exactly what the 7 forms registrars read (read all 7 files directly: `list.ts`, `create.ts`, `get-by-id.ts`, `update.ts`, `list-submissions.ts`, `get-submission.ts`, `delete-submission.ts`).
- REQ-02: `src/server/modules/forms-admin.ts` (new — named distinctly from `src/server/modules/forms.ts`, which already exists from SPEC-031 and owns the Forms-to-webhook fan-out SUBSCRIBER, an unrelated non-HTTP concern; this new module owns the admin CRUD HTTP surface only, mirroring how `integrations.ts` vs `integrations-admin.ts` already split the identical shape in SPEC-034) shall export `createFormsAdminModule(deps: FormsRouteDeps)` wrapping all 7 registrars.
- REQ-03: `src/server/modules/redirects.ts` (new) shall export `createRedirectsModule(deps: RedirectRouteDeps)` wrapping all 7 redirects registrars (`list.ts`, `get.ts`... read `app.ts`'s current inline block for the exact 7 names), reusing the already-existing `RedirectRouteDeps`/`RedirectRouteRegistrar` type from `src/server/http/admin/redirects.ts` — do not redefine it.
- REQ-04: `src/server/modules/analytics.ts` (new) shall export `createAnalyticsModule(deps: AdminAnalyticsRecentHitsDeps)` wrapping the single `registerAdminAnalyticsRecentHitsRoute` registrar, reusing its already-existing deps type.
- REQ-05: `app.ts`'s `createApp()` shall call the 3 new module factories instead of the 15 inline registrar calls they replace, at the same relative registration position, and shall remove the now-dead direct registrar imports.
- REQ-06: Behavior must be byte-identical from any external caller's perspective. This is a refactor, not a behavior change.

## Acceptance Criteria

- AC-01 (REQ-01/02) [P1]: Existing forms admin route tests still pass unmodified against the real `createApp()` composition.
- AC-02 (REQ-03) [P1]: Existing redirects route tests still pass unmodified against the real composition.
- AC-03 (REQ-04) [P1]: Existing analytics route tests still pass unmodified against the real composition.
- AC-04 (REQ-05) [P1]: Full test suite passes with the exact same pass/fail counts as the branch this slice forks from.
- AC-05 (REQ-05) [P1]: `npx tsc --noEmit -p .` stays clean; no dead imports remain in `app.ts` for the 15 relocated registrars.

## Non-Goals

- The remaining domains after this slice (storage/recovery, content-types/entries, SEO) — a later slice.
- `src/server/modules/forms.ts` (the existing SPEC-031 fan-out-subscriber module) — untouched, unrelated concern despite the similar name to this spec's new `forms-admin.ts`.
- Any backend behavior change.

## Constitution Compliance

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | No new dependency. |
| II — Test-First | COMPLIES | Every touched domain's pre-existing test suite re-run unmodified as the regression gate. |
| III — Simplicity Gate | COMPLIES | 3 modules, narrow `Pick`-based deps types, no new abstraction. |
| IV — Anti-Abstraction Gate | COMPLIES | Extends `ServerModuleHandle`'s existing consumer set; no new port. |
| V — Integration-First Testing | COMPLIES | AC-01–03 all exercise the real `createApp()` composition. |
| VI — Security-by-Default | N/A | No authz surface change. |
| VII — Spec Integrity | COMPLIES | This spec is the reference for the implementation it accompanies. |
| VIII — Observability | N/A | No new observable signal. |
