# Feature Spec: Server Module Convention — Sixth Slice (ADR-046 Phase 3, final)

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-042 |
| version | 1.0.0 |
| status | APPROVED |
| feature_name | FEAT-042-server-module-convention-sixth-slice |
| last_edited | 2026-07-16T00:00:00Z |
| owner | Leon Aburime |
| spec_agent | Spec Agent (in-session, direct — Claude Code host, dispatched subagent) |
| spec_mode | brownfield |

## Scope Note (disclosed — extra care domain)

This is the FINAL slice of the ADR-046 Phase 3 sweep (SPEC-031 → 034 → 038 → 039 → 040 → 041), pulling the last 3 domains: **storage/recovery** (7 registrations — Storage Timeline + Restore Points list/create, plus Recovery disclosure/deep-link/status), **content-types/entries** (8 — the ADR-043 Collections backend), **SEO** (10 — 8 admin + 2 public: `sitemap.xml`/`robots.txt`).

**Storage/recovery gets extra scrutiny, not less, despite being "just" a mechanical move:** this domain (ADR-041/043/044/045) was the subject of an extensive multi-round external audit earlier this same session (`TM-adr041-043-044-045-audit-001`, 7 rounds, converged PASS 9.2/10) — including a real bug (`R6-F1`) where a seemingly-safe refactor of THIS EXACT domain's composition wiring introduced a silent-data-loss window. This slice is a narrower, purely additive Pick-type extraction (no logic change, no reordering of gates/middleware), which is a fundamentally lower-risk shape than that prior bug (which changed actual control flow) — but given the domain's history this session, the verification bar (AC-01/02 below) is non-negotiable, not a rubber stamp.

None of these 3 domains have narrow deps types yet — all currently use plain `RouteRegistrar`/full `RouteDeps`.

**What stays inline (unchanged from every prior slice's same non-goal):** `registerAdminTaxonomyMergeTermRoutes`, `registerAdminStorageMigrateForwardRoutes`, `registerAdminRecoveryRestoreRoutes` — the 3 gated-mutation ceremonies sharing `core/gated-mutations` construction, deliberately left inline since SPEC-031.

## Requirements

- REQ-01: `src/server/routes/admin/storage-recovery/deps.ts` (new) shall define a narrow `StorageRecoveryRouteDeps` type covering exactly what the 7 registrars read (read all 7 files directly: `storage/timeline.ts`, `storage/restore-points.ts` [2 registrars], `recovery/disclosure.ts`, `recovery/deep-link.ts`, `recovery/status.ts` — note `status.ts` reads `core/operation-lock`'s `isOperationInFlight`, confirmed live-wired this session, make sure that dependency is captured correctly, not dropped).
- REQ-02: `src/server/modules/storage-recovery.ts` (new) shall export `createStorageRecoveryModule(deps: StorageRecoveryRouteDeps)` wrapping all 7 registrars (`registerAdminStorageTimelineRoute`, `registerAdminStorageRestorePointsListRoute`, `registerAdminStorageRestorePointsCreateRoute`, `registerAdminRecoveryDisclosureRoute`, `registerAdminRecoveryDeepLinkRoute`, `registerAdminRecoveryStatusRoute`) — NOT including `registerAdminStorageMigrateForwardRoutes`/`registerAdminRecoveryRestoreRoutes` (the ceremonies, stay inline per Scope Note).
- REQ-03: `src/server/routes/admin/content-types/deps.ts` (new) shall define a narrow `ContentTypesRouteDeps` type covering the 4 content-types registrars (`list.ts`, `register.ts`, `update-fields.ts`, `lifecycle.ts`) AND the 4 entries registrars (`entries/list.ts`, `create.ts`, `update.ts`, `lifecycle.ts` — read all 8 files directly; entries and content-types are one cohesive ADR-043 domain, one deps type is appropriate unless the field sets genuinely diverge enough to warrant two, use judgment and document the choice).
- REQ-04: `src/server/modules/content.ts` — **NAME COLLISION WARNING:** SPEC-038 already created `src/server/modules/content.ts` for posts/pages/change-sets/presentation. This spec's content-types/entries module must NOT reuse that filename. Name it `src/server/modules/content-types.ts` instead, exporting `createContentTypesModule(deps: ContentTypesRouteDeps)` wrapping all 8 registrars.
- REQ-05: `src/server/routes/admin/seo/deps.ts` (new) shall define a narrow `SeoRouteDeps` type covering the 8 admin SEO registrars (`get-entry.ts`, `put-entry.ts`, `get-entry-analyze.ts`, `get-settings.ts`, `put-settings.ts`, `post-sitemap-regenerate.ts`) plus the 2 public registrars (`registerSeoSitemapRoute` in `routes/site/sitemap.ts`, `registerSeoRobotsRoute` in `routes/site/robots.ts` — read both, these live outside `routes/admin/seo/`, mirrors `media.ts`'s precedent of bundling a public route into an otherwise-admin module).
- REQ-06: `src/server/modules/seo.ts` (new) shall export `createSeoModule(deps: SeoRouteDeps)` wrapping all 8 admin + 2 public registrars. The 2 public routes MUST still register before the site's `GET /:slug` catch-all — verify their position in the module's `registerRoutes(app)` body matches where they currently sit in `app.ts` relative to `registerSiteRoutes`, and confirm `route-class-precedence.unit.test.ts` still passes after the move (it structurally asserts `/:slug` is last; do not let this module accidentally break that by registering something after the catch-all).
- REQ-07: `app.ts`'s `createApp()` shall call the 3 new module factories instead of the 25 inline registrar calls they replace, at the same relative registration position(s) — note storage-recovery, content-types, and seo may not all sit contiguously in the current `app.ts`; preserve each one's own relative position, do not consolidate them into one block if they aren't already adjacent.
- REQ-08: Behavior must be byte-identical from any external caller's perspective. This is a refactor, not a behavior change.

## Acceptance Criteria

- AC-01 (REQ-01/02) [P1]: Existing storage AND recovery backend test suites — INCLUDING `src/server/__tests__/integration/storage-migration-reconciliation-boot.integration.test.ts` (this session's own extensive crash-recovery test file) and `src/server/__tests__/routes/recovery-routes.test.ts` — still pass unmodified against the real `createApp()` composition. This is the non-negotiable check named in the Scope Note; do not skip or weaken it.
- AC-02 (REQ-01/02) [P1]: The Recovery status route's `operationInFlight` field still correctly reflects real `core/operation-lock` state after the move (spot-check: acquire a lock, hit the status route, confirm `operationInFlight: true`; release it, confirm `false`) — this exact wiring was a hard-won fix earlier this session (Finding 3, TM-adr041-043-044-045-audit-001) and must not silently regress.
- AC-03 (REQ-03/04) [P1]: Existing content-types/entries (ADR-043 Collections) backend test suites still pass unmodified against the real composition.
- AC-04 (REQ-05/06) [P1]: Existing SEO backend test suites still pass unmodified against the real composition, AND `route-class-precedence.unit.test.ts` still passes (proving the public sitemap/robots routes didn't get reordered relative to the site catch-all).
- AC-05 (REQ-07) [P1]: Full test suite passes with the exact same pass/fail counts as the branch this slice forks from.
- AC-06 (REQ-07) [P1]: `npx tsc --noEmit -p .` stays clean; no dead imports remain in `app.ts` for the 25 relocated registrars; confirm the 3 gated-mutation ceremonies (`registerAdminTaxonomyMergeTermRoutes`/`registerAdminStorageMigrateForwardRoutes`/`registerAdminRecoveryRestoreRoutes`) are still registered inline exactly as before (grep confirms they're untouched).

## Non-Goals

- The 3 gated-mutation ceremonies — stay inline, unchanged non-goal since SPEC-031.
- Any `deps.ts` (composition-root, `server/deps.ts`) change.
- Any backend behavior change anywhere in these 3 domains.
- After this slice, ADR-046 Phase 3's route-registration sweep is COMPLETE — no further slices are anticipated (only `requireAdminSession`... already done in SPEC-039). Confirm via a final grep of `app.ts` that no bare `register*` calls remain outside the gated-mutation ceremonies and non-admin site/public routes (`registerStoreRoutes`, `registerCommentsSubmitRoute`, `registerAnalyticsIngestRoute`, `registerFormsSubmitRoute`, `registerSiteRoutes`, etc. — these were never in scope for Phase 3's admin-route-modularization effort and stay exactly where they are).

## Constitution Compliance

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | No new dependency. |
| II — Test-First | COMPLIES | Every touched domain's pre-existing test suite re-run unmodified as the regression gate — with extra emphasis on storage/recovery per the Scope Note. |
| III — Simplicity Gate | COMPLIES | 3 modules, narrow `Pick`-based deps types, no new abstraction. |
| IV — Anti-Abstraction Gate | COMPLIES | Extends `ServerModuleHandle`'s existing consumer set; no new port. |
| V — Integration-First Testing | COMPLIES | AC-01–04 all exercise the real `createApp()` composition, including a live operation-lock state check (AC-02). |
| VI — Security-by-Default | N/A | No authz surface change. |
| VII — Spec Integrity | COMPLIES | This spec is the reference for the implementation it accompanies, including its explicit heightened-scrutiny note for storage/recovery. |
| VIII — Observability | N/A | No new observable signal. |
