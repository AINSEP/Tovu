# Tasks: seo

- Spec: SPEC-008 v1.0.0 (hash: sha256:5647a1176b49a39923b174865ecebeec4115078ec0625c6a58087815c4e0e128)
- ADR: ADR-PIPE-008 (ACCEPTED 2026-07-13)
- Outline: ADS-project-knowledge/reports/pipeline/008-seo/implementation-outline.md (Status: PRODUCED)
- Date: 2026-07-13T21:00:00Z
- Author: Coordinator

## ⚠ Coordinator Audit (2026-07-13, post-session-limit termination) — UPDATED, Phase 7 completed directly

The implementation agent was killed by an API session limit mid-run. Audited by direct file inspection + scoped test runs. **Individual task checkboxes below are NOT updated** — verified at phase/module level. Findings, after the Coordinator completed Phase 7 directly:

- **Done and verified (984/984 full-suite passing, `tsc` clean):** Phase 0-6 (schema, settings schema variant, outbox extension, `page-head.ts` registry, write chokepoint, site settings, effective meta evaluator, sitemap/robots, media helper) — as before. **Phase 7, completed by the Coordinator 2026-07-13**: all 6 admin routes (`get-entry`/`put-entry`/`get-entry-analyze`/`get-settings`/`put-settings`/`post-sitemap-regenerate`) + 2 public routes (`sitemap.xml`/`robots.txt`), all wired into `server/app.ts`; `page-head`'s fold is now actually called from the real site route (`pages.ts`) and `render.ts`'s `pageShell` suppresses its own hardcoded `<title>` when the fold provides one; `ensureSeoSettingDefinitions()` now runs at real boot (was a `Promise.resolve()` placeholder). New test file `src/server/__tests__/routes/seo-site-serving.test.ts` (4 tests) proves auth gating, the entry-meta round trip through the real chokepoint, and that `/sitemap.xml`/`/robots.txt`/the folded `<title>` are reachable through the real running app, not just unit-testable in isolation.
- **A real bug found and fixed during this pass (not a pre-existing issue, introduced by wiring `seoReady` naively):** `seoReady` and `settingsReady` are both boot-time SQLite writers sharing one `better-sqlite3` connection; firing them in parallel threw `SqliteError: cannot start a transaction within a transaction` (caught by the pre-existing `settings-principal-check.test.ts` suite, not a new test) — fixed by chaining `seoReady` after `settingsReady` resolves, in both `app.ts` and `deps.ts`.
- **Phase 8, partially completed by the Coordinator 2026-07-13**: `apps/admin/src/sections/Seo.tsx` (`SeoSettingsScreen` per ui.spec.md §2.4 — title template, default description/OG image/Twitter handle, default robots noindex/nofollow, sitemap-enabled toggle, `SitemapRegenerateButton` §2.6), mounted in `App.tsx` + `nav.ts` (was `soon: true`, now a real link). Verified via Haiku test-runner subagent: 984/984 passing, root + `apps/admin` `tsc --noEmit` both clean. **NOT built**: `SeoEntryPanel` (§2.1, per-entry meta editing embedded inside `PostEditor.tsx`) and the full `RobotsRuleEditor` add/edit/remove control (§2.5, a minimal settings-only form shipped instead) — both explicitly out of scope for this pass, noted in `Seo.tsx`'s own header comment.
- **Unknown:** Phase N Polish.

## Format

`[ID] [P?] [Story ref] Description` — [P] = parallel-safe (different files, no shared mutable state within the phase). Phases + order derived from the implementation outline's Module Map, Contract Map, Wiring Map, and Downstream Handoff Notes (the outline's own 4-stage build order: (1) schema column + settings-vocabulary variant + `post.ts` outbox extension + `page-head.ts` registry, ahead of (2) the `seo` module's own files, ahead of (3) API routes + `render.ts`/`pages.ts` wiring, ahead of (4) admin UI).

Task checkboxes are **Coordinator-owned state**. TDD, Programmer, TestRunner, and Code Review treat this file as **read-only** unless the Coordinator explicitly delegates a task-list update.

**Note for parallel dispatch across sibling features:** Redirects (FEAT-009), Forms (FEAT-010), and Integrations (FEAT-015) are being planned concurrently by sibling Coordinator instances. SEO does not touch `server/app.ts`'s Forms/Integrations wiring sections, `routes/types.ts` beyond its own `seoReady` field addition, or any file those features own — no coordination needed for this file's own task list. (Forms and Integrations both touch `server/app.ts`/`routes/types.ts` themselves; SEO's own touches to those two files — T012's `seoReady` field, T050's 8 route registrations/subscriptions — are additive and independent of their sections.)

---

## Constraints

### Coverage Profile

- Unit minimums: defaults `98/98/98/98` (lines/branches/functions/statements).
- Integration minimums: defaults `90/90/90/90`.
- E2E minimums: N/A — no automated browser E2E suite for this backend+admin-screen feature; the `/admin/seo` screen and the entry panel get a manual `/verify` pass (T056) per the same posture ADR-PIPE-007/SPEC-007 used for Settings, not an automated E2E suite in this pass.
- Convergence threshold before Code Review: default `100%` of P1 acceptance tests (AC-01…04, 05…07, 09…13, 16…20, 22…24, 26, 27, 29…31) and all invariants (INV-01…09, INV-010) passing. No lower threshold requested.
- **Contract Tests** (from outline, Test Expectations section): `setEntrySeoOverrides` (C-004) and `setSeoSettings` (C-006) must each have a contract-level test run against the real SQLite adapter (`repo.sqlite.ts` for posts, the existing settings SQLite adapter), not just in-memory fixtures — not a new shared-port contract suite, since this feature introduces no new port.

### Required Suites

- Unit: **required** — effective-meta precedence (behavior.spec.md §1.1), `foldPageHead` dedup/tie-break, the `updatePost` transition table, settings/entry field validators, sitemap eligibility filtering.
- Integration: **required** — all 8 HTTP routes via the existing `src/server/__tests__/routes/` harness; `setEntrySeoOverrides`/`setSeoSettings` at the real SQLite adapter; the real `pageShell()`/`renderSite()` render path with SEO's contributor registered; the outbox publish/unpublish → cache-invalidation chain.
- E2E: **not applicable** — no automated browser/CLI E2E suite in this slice; the two admin UI surfaces are manually `/verify`-checked (T056).

### Coverage Tool

- Tool: node:test built-in coverage, already wired in this repo (`npm run test:cov` in `package.json`, added in SPEC-007 Phase 0) — reused unmodified, no new coverage tooling added by this feature.
- Machine-readable output path: `coverage/lcov.info`.
- Cleanup paths before run: `coverage/`.
- Per-suite output: unit + integration share the node:test run (co-located `*.test.ts`); split reporting by path glob if TestRunner needs per-suite numbers.

### Performance (optional)

- N/A — SPEC-008 has no latency/throughput NFRs beyond the existing `ADMIN_STANDARD`/`PUBLIC_READ` rate-limit profiles (api.spec.md §3), which are reserved-but-unenforced in this dev server, matching every other admin section.

---

## Named Risks (ADR-PIPE-008 Consequences → explicit test-first tasks, not just implementation tasks)

1. **Transition-table misclassification in `updatePost`** — T004 certifies all 4 rows of the status-transition table (INV-010) as an isolated, directly-testable unit BEFORE T010 implements it or T036/T038 wire any SEO-side subscription to depend on it.
2. **Head-fold dedup/tie-break correctness** — T005 certifies `foldPageHead`'s last-writer-wins-by-priority + later-registration tie-break rule (behavior.spec.md §5/§6.1) as a standalone pure-function unit BEFORE T009 implements it or T030/T031/T048/T049 depend on it.
3. **JSON-schema-variant scope creep** — T006 certifies `validateValueAgainstSchema({type:"json"})` accepts only what it should BEFORE T008 implements it; T058 (Polish, Code Review) verifies the variant is used exactly once (`site.seo.robots_rules`) and that SEO's own write-path validator — not the ledger schema — enforces `robotsRules`' internal shape/length.

---

## Phase 0 — Setup

No story dependencies.

- [ ] T001 [P] Create directory structure: `src/seo/__tests__/`, `src/server/http/site/__tests__/`, `src/server/routes/admin/seo/`, `src/server/routes/site/` (extend existing)
- [ ] T002 [P] Confirm `npm run test:cov` (node:test `--experimental-test-coverage` → `coverage/lcov.info`) covers new `src/seo/**` and `src/server/http/site/page-head.ts` glob paths — no script changes expected, verification only (script already added in SPEC-007 Phase 0)
- [ ] T003 [P] Add the nullable `posts.seo_ext_json` Drizzle column definition scaffold note to `src/infra/db/schema.ts` review pass (actual column addition is T007 in Phase 1 — this task is directory/tooling setup only, confirming the migration path exists)

---

## Phase 1 — Foundational (blocks all stories)

The four mutually-independent prerequisites the outline's Downstream Handoff Notes require ahead of everything else: the schema column, the settings-vocabulary variant, the render-seam registry, and the `post.ts` outbox extension. **No story phase begins until this checkpoint.** Per TDD focus, C-023 (`updatePost`'s transition table) and C-014 (`foldPageHead`'s dedup/tie-break) are certified FIRST — both are aggregate-risk, pure, and isolated, and multiple downstream pieces depend on their exact behavior being locked before integration.

- [ ] T004 [P] [REQ-10, INV-010, AC-22, AC-23, EC-05] Write failing unit tests for `updatePost`'s 4-row status-transition table: not-published→published emits `entry.published`; published→published (edited) emits `entry.updated`; published→not-published emits `entry.unpublished`; not-published→not-published emits none — `src/features/post/__tests__/post.transition-events.test.ts`
- [ ] T005 [P] [REQ-06, REQ-16, INV-03, AC-31, EC-06, behavior.spec.md §2.1/§5/§6.1] Write failing unit tests for `page-head.ts`: `foldPageHead` ascending-priority ordering, dedup by `HeadElementKey` (last-writer-wins-by-priority, later-registration tie-break), fail-closed-per-contributor (a throwing contributor's output dropped, fold itself never throws), `serializeHeadElements` escapes every `HeadElement` kind (incl. `jsonld` via `JSON.stringify` inside a `<script>` tag, never string-concatenated) — `src/server/http/site/__tests__/page-head.test.ts`
- [ ] T006 [P] [REQ-11, C-024] Write failing unit test: `validateValueAgainstSchema({type:"json"})` accepts object/array/scalar values and `null` when `nullable:true` — `src/features/settings/__tests__/settings.json-schema-variant.test.ts`
- [ ] T007 [P] [REQ-02, AC-03] Add nullable `seoExtJson: text("seo_ext_json")` column to the `posts` Drizzle table — additive, no default/backfill needed (per Migration Safety, `null` means "derive everything") — `src/infra/db/schema.ts`
- [ ] T008 [P] [REQ-11, C-024] Implement `SettingValueSchema` `{type:"json", nullable?: boolean}` variant + `validateValueAgainstSchema`'s `case "json": return true;` branch — `src/features/settings/types.ts`, `src/features/settings/settings.ts` (depends on T006)
- [ ] T009 [P] [REQ-06, REQ-16, INV-03, C-012, C-014] Implement `page-head.ts`: `registerPageHeadContributor`/`foldPageHead`/`serializeHeadElements`/a reset-for-tests helper — core-owned in-module ordered-array registry, mirrors `routing.ts`'s `phaseRegistry`/`namedRoutes` shape — `src/server/http/site/page-head.ts` (depends on T005)
- [ ] T010 [P] [REQ-10, INV-010, C-023] Implement `updatePost`'s outbox extension: `UpdatePostDeps` gains `outbox: OutboxPort`; compare `existing.status` vs `input.status` and enqueue at most one of `entry.published`/`entry.updated`/`entry.unpublished` per the transition table; update every existing `updatePost` call site to supply `outbox` — `src/features/post/post.ts`, `src/server/routes/admin/posts/update.ts` (depends on T004)
- [ ] T011 [P] [REQ-15] Register `admin.seo.manage` permission (single new catalog entry, mirrors the `navigation.manage`/`integration.manage` registration block) — `src/identity/permissions.ts`
- [ ] T012 [P] Add `seoReady: Promise<void>` to `RouteDeps` (mirrors `settingsReady`'s exact shape) — `src/server/routes/types.ts`
- [ ] T013 Run Phase 1 tests to convergence

**Checkpoint**: Schema column + settings JSON variant + `page-head.ts` registry + `post.ts` outbox extension + permission + `RouteDeps.seoReady` all green — story phases can now begin (Phase 2 and Phase 3 are parallelizable with each other per the outline).

---

## Phase 2 — [Story: REQ-01/02/03/15] Per-entry SEO override write chokepoint (P1) — [P] with Phase 3

**Goal**: `setEntrySeoOverrides` is the sole chokepoint for `posts.seo_ext_json` — authorize → validate (registered-key-only, length/URL-scheme) → merge → save, with nothing persisted on any rejection.
**Independent test**: PUT an entry with an unregistered key → rejected, existing row unchanged (AC-04); PUT valid fields → GET round-trips them (AC-01) against the real SQLite `PostRepoPort` adapter.

- [ ] T014 [P] [REQ-01, REQ-03, REQ-15, AC-01, AC-04, AC-29, AC-30, INV-01, INV-06, EC-03, behavior.spec.md §4/§7] Write failing unit tests: `setEntrySeoOverrides` — `authorize("admin.seo.manage")` runs first (unauthorized → `FORBIDDEN`/`UNAUTHENTICATED`, zero writes); registered-key-only validation (unregistered key → `SeoFieldValidationError`, nothing persisted); 500-char string / 2048-char URL boundary (500 ok, 501 rejected); unsafe URL scheme (`javascript:`/`data:`) → `SeoInvalidCanonicalUrlError` — `src/seo/__tests__/write-service.test.ts`
- [ ] T015 [P] [REQ-01, REQ-02, AC-01, AC-03] Write failing integration test: PUT-then-GET round trip against the real SQLite `PostRepoPort` adapter persists into `posts.seo_ext_json`; entry-not-found → `SeoEntryNotFoundError` — `src/seo/__tests__/write-service.sqlite.test.ts`
- [ ] T016 Implement typed error classes: `SeoFieldValidationError`, `SeoInvalidCanonicalUrlError`, `SeoEntryNotFoundError`, `SeoSettingsValidationError` — `src/seo/errors.ts`
- [ ] T017 [REQ-01, REQ-02, REQ-03, REQ-15, AC-01, AC-03, AC-04, AC-29, AC-30, INV-01, INV-06] Implement `setEntrySeoOverrides` chokepoint: `authorize` → validate → `postRepo.findById` → merge patch into existing/empty `seo_ext_json` → `postRepo.save` → conditional direct sitemap-cache invalidation call on a `noindex`/canonical-affecting write — `src/seo/write-service.ts` (depends on T007, T011, T016, T014, T015)
- [ ] T018 Run Phase 2 tests to convergence

**Checkpoint**: AC-01/03/04/29/30 + INV-01/06 passing — per-entry write chokepoint independently testable.

---

## Phase 3 — [Story: REQ-11/12/15] Site-level SEO settings storage (P1) — [P] with Phase 2

**Goal**: `getSeoSettings`/`setSeoSettings` map the 7 `site.seo.*` ledger definitions to/from `SeoSettings`, validating `titleTemplate`/`robotsRules` before ANY key is written (all-or-nothing).
**Independent test**: PUT an invalid `titleTemplate` (no `%s`) → zero settings changed (AC-25); PUT valid settings → GET round-trips them (AC-24).

- [ ] T019 [P] [REQ-11, REQ-15, AC-24, AC-25, AC-29, AC-30, INV-06, INV-07, behavior.spec.md §3/§4/§7] Write failing unit tests: `getSeoSettings`/`setSeoSettings` — `titleTemplate` must contain `%s` (incl. 500/501-char boundary), `robotsRules.length <= 50` (incl. 50/51-rule boundary) + per-rule shape, all-or-nothing validation (one invalid field → zero keys written), `defaultRobots` decompose/recompose via its 2 booleans, no `baseUrl`/`seo.base_url`-shaped field exists anywhere in `SeoSettings`, unauthorized write → `FORBIDDEN`/`UNAUTHENTICATED` with zero writes — `src/seo/__tests__/settings.test.ts`
- [ ] T020 [P] [C-007] Write failing test: `ensureSeoSettingDefinitions` is idempotent — call twice, assert exactly 7 `setting_definitions` rows exist, not 14 — `src/seo/__tests__/settings.definitions.test.ts`
- [ ] T021 [REQ-11, REQ-15, AC-24, AC-25, INV-06, INV-07] Implement `settings.ts`: `getSeoSettings`/`setSeoSettings` (namespace `site.seo`, ownerKind `site`, workspace-only scope, per ADR-PIPE-008 Decision §3's 7-key mapping table) + `ensureSeoSettingDefinitions()` (idempotent, mirrors `migration.ts`'s skip-if-registered pattern) — `src/seo/settings.ts` (depends on T008, T011, T019, T020)
- [ ] T022 Run Phase 3 tests to convergence

**Checkpoint**: AC-24/25/29/30 + INV-07 passing — settings storage independently testable.

---

## Phase 4 — [Story: REQ-04/05/12] Effective SEO meta evaluator (P1) — depends on Phase 2, Phase 3

**Goal**: One pure evaluator (`getEntryMeta`) resolves override ▸ site default ▸ derived per field, consumed identically by every future caller (admin preview, public render, analyze).
**Independent test**: an entry with no overrides and no site defaults resolves fully derived meta (AC-07); an override always wins over a site default (AC-06); canonical/OG/sitemap origin always comes from `routing.urlFor`, never a SEO setting (AC-26/INV-07).

- [ ] T023 [P] [EC-07] Write failing unit tests: `resolveSeoImageRef` — valid `{assetId}:{transformName}` ref → composed URL; deleted asset / unregistered transform → `undefined` (never throws); already-absolute URL → pass-through unchanged — `src/seo/__tests__/media.test.ts`
- [ ] T024 [P] [REQ-04, REQ-05, REQ-12, AC-05, AC-06, AC-07, AC-08, AC-09, AC-26, INV-02, INV-07, EC-01, EC-02, EC-10, EC-11, behavior.spec.md §1.1/§3/§7] Write failing unit tests: `getEntryMeta` — per-field precedence (override wins, site-default wins when no override, derived-from-excerpt fallback when both absent), `title` never resolves empty even when all three sources are absent, canonical override accepted cross-domain as-is (EC-10), no-canonical-override → routing-resolved canonical, draft with no explicit `noindex` override defaults to `noindex:true` (EC-11) but an explicit `noindex:false` on a draft still wins (behavior.spec.md §7), entry override `noindex:false` beats a workspace default `true` (EC-02) — `src/seo/__tests__/seo.test.ts`
- [ ] T025 [P] [REQ-14, AC-28] Write failing unit tests: `analyzeEntry` — missing title/description → issue present; nothing missing → `score: 100, issues: []` — `src/seo/__tests__/seo.analyze.test.ts`
- [ ] T026 [EC-07] Implement `resolveSeoImageRef` over existing read-only `MediaRepoPort`/`AssetRenditionRepoPort`/`TransformDefinitionRepoPort` — `src/seo/media.ts` (depends on T023)
- [ ] T027 [REQ-04, REQ-05, REQ-12, AC-05..09, AC-26, INV-02, INV-07] Implement `getEntryMeta` pure evaluator (reads `PostRepoPort`, `getSeoSettings`, `routing.urlFor`, `resolveSeoImageRef`; never writes) — `src/seo/seo.ts` (depends on T017, T021, T026, T024)
- [ ] T028 [REQ-14, AC-28] Implement `analyzeEntry` over `getEntryMeta`'s resolved result — `src/seo/seo.ts` (depends on T027, T025)
- [ ] T029 Run Phase 4 tests to convergence

**Checkpoint**: AC-05..09/26/28 + INV-02/07 passing — evaluator independently testable.

---

## Phase 5 — [Story: REQ-06/07/16] `page.head` SEO contributor + JSON-LD (P1) — depends on Phase 1 (`page-head.ts`), Phase 4 (evaluator)

**Goal**: SEO's own `PageHeadHook` maps `getEntryMeta`'s resolved `SeoMeta` into ordered, deduped `HeadElement[]` per the fixed priority bands, including content-type → JSON-LD `@type` mapping and `BreadcrumbList` inclusion.
**Independent test**: a `post`-kind entry with no `schemaType` override emits `@type: "Article"` (AC-13); a `schemaType` override changes the emitted `@type` (AC-14); a throwing contributor is dropped by the fold, not fatal (AC-31/EC-06).

- [ ] T030 [REQ-06, REQ-07, REQ-16, AC-10, AC-12, AC-13, AC-14, AC-15, AC-31, EC-06] Write failing unit tests: `seoPageHeadHook` — maps `SeoMeta` into `HeadElement[]` per fixed priority bands (title=100, meta-desc=110, canonical=120, robots=130, og=140-149, twitter=150-159, jsonld=900); `page` kind → `WebPage`, `post` kind → `Article`, `schemaType` override changes `@type`; ancestor chain in context → `BreadcrumbList` included; never throws for a normal case — `src/seo/__tests__/page-head-contributor.test.ts`
- [ ] T031 [REQ-06, REQ-07, C-003] Implement `seoPageHeadHook` — `src/seo/page-head-contributor.ts` (depends on T027, T009, T030)
- [ ] T032 Run Phase 5 tests to convergence

**Checkpoint**: AC-10/12/13/14/15/31 passing — SEO's head contributor independently testable (unit-level; real-render integration is Phase 7's T045).

---

## Phase 6 — [Story: REQ-08/09/10/13] Sitemap/robots + cache invalidation + manual regenerate (P1) — depends on Phase 1 (`post.ts` outbox events), Phase 3 (settings)

**Goal**: `buildSitemap`/`buildRobots` are cache-backed, never leak non-published or `noindex` entries, invalidate correctly on publish/update/unpublish via the outbox, and support a manual force-rebuild.
**Independent test**: a mixed workspace (draft/published/noindex posts) → sitemap includes only eligible entries (AC-16/17); unpublishing a post is reflected in the next sitemap fetch (AC-23); two concurrent regenerate calls converge to one deterministic cache value (EC-08).

- [ ] T033 [P] [REQ-08, AC-16, AC-17, INV-04, INV-05, EC-04, behavior.spec.md §2.2] Write failing unit tests: `buildSitemap` excludes effective-`noindex` and non-`published` entries; empty workspace → valid empty `<urlset>` (`[]`, never `null`); entries ordered by keyset `id` — `src/seo/__tests__/sitemap.test.ts`
- [ ] T034 [P] [REQ-09, AC-19, AC-20, AC-21, EC-09] Write failing unit tests: `buildRobots` — `sitemapEnabled: true` → `Sitemap:` line present; `false` → line absent — `src/seo/__tests__/robots.test.ts`
- [ ] T035 [P] [REQ-13, AC-27, INV-08, EC-08] Write failing unit tests: `regenerateSitemapCache` force-rebuilds bypassing cache-hit; `invalidateSitemapCache` is idempotent (repeat call on an already-clear key is a no-op, never an error); two concurrent regenerate calls for the same workspace converge to one final value, no torn write; two different `workspaceId`s produce two independent cache entries — `src/seo/__tests__/sitemap-cache.test.ts`
- [ ] T036 [P] [REQ-10, AC-22, AC-23, EC-05] Write failing integration test: publish → `entry.published` → sitemap cache invalidated; unpublish → `entry.unpublished` → sitemap cache invalidated; draft→draft edit emits no event and cache stays untouched — `src/seo/__tests__/sitemap-invalidation.integration.test.ts`
- [ ] T037 [REQ-08, REQ-09, REQ-13, INV-04, INV-05, INV-08] Implement `sitemap.ts`: `buildSitemap`/`buildRobots`/`regenerateSitemapCache`/`invalidateSitemapCache` over an in-module `Map<string,string>` keyed `ws:{workspaceId}:seo:sitemap`; the empty `seo.sitemap.collect` registry (OQ-01, live-but-empty, no real registrant in v1) — `src/seo/sitemap.ts` (depends on T021, T033, T034, T035)
- [ ] T038 [REQ-10, AC-22, AC-23] Wire `SeoEventSubscriptions` handlers subscribing to `entry.published`/`entry.updated`/`entry.unpublished`, invalidating the workspace's sitemap cache entry on delivery (idempotent per ADR-009) — `src/server/app.ts` (depends on T010, T037, T036)
- [ ] T039 Run Phase 6 tests to convergence

**Checkpoint**: AC-16/17/19/20/22/23/27 + INV-04/05/08 passing — sitemap/robots/cache independently testable.

---

## Phase 7 — [Story: Admin + public HTTP API surface + render wiring] (P1) — depends on Phase 2, 3, 4, 5, 6

**Goal**: The 8 HTTP endpoints (6 admin, 2 public) are wired with correct auth gating and error-code mapping; `render.ts`/`pages.ts` fold and serialize SEO's head elements into the real render path.
**Independent test**: each admin route without `admin.seo.manage` → 403 (AC-29); `GET /sitemap.xml`/`GET /robots.txt` require no auth and return 200 (AC-18/19); the real `pageShell()` render includes SEO's folded head elements and survives a throwing contributor (AC-10/11/31).

- [ ] T040 [P] [REQ-08, AC-16, AC-18] Write failing integration test: `GET /sitemap.xml` — no auth required, 200, `text/xml` body — `src/server/__tests__/routes/seo-sitemap.test.ts`
- [ ] T041 [P] [REQ-09, AC-19] Write failing integration test: `GET /robots.txt` — no auth required, 200, `text/plain` body — `src/server/__tests__/routes/seo-robots.test.ts`
- [ ] T042 [P] [REQ-01, AC-01, AC-04, AC-29, AC-30, SEO_FIELD_VALIDATION_ERROR, SEO_INVALID_CANONICAL_URL, SEO_ENTRY_NOT_FOUND, FORBIDDEN, UNAUTHENTICATED] Write failing integration tests: `GET`/`PUT` entry-meta + `GET` entry-analyze routes — auth gating (401/403), error-code→HTTP mapping, round trip via the real SQLite adapter — `src/server/__tests__/routes/seo-entry.test.ts`
- [ ] T043 [P] [REQ-11, AC-24, AC-25, AC-29, AC-30, SEO_SETTINGS_VALIDATION_ERROR] Write failing integration tests: `GET`/`PUT` settings routes — auth gating, validation-error mapping, round trip — `src/server/__tests__/routes/seo-settings.test.ts`
- [ ] T044 [P] [REQ-13, AC-27] Write failing integration test: `POST` sitemap/regenerate — 202, auth gating — `src/server/__tests__/routes/seo-sitemap-regenerate.test.ts`
- [ ] T045 [P] [REQ-06, REQ-16, AC-10, AC-11, AC-31, EC-06] Write failing integration test: the real `pageShell()`/`renderSite()` render path (home + `:slug`) includes SEO's folded head elements when SEO's contributor is registered; a throwing contributor doesn't break the page (still 200) — `src/server/http/site/__tests__/render.seo-head.test.ts`
- [ ] T046 [REQ-08, REQ-09, INTERNAL_ERROR] Implement `registerSeoSitemapRoute`/`registerSeoRobotsRoute` — `src/server/routes/site/sitemap.ts`, `src/server/routes/site/robots.ts` (depends on T037, T040, T041)
- [ ] T047 [REQ-01, REQ-11, REQ-13, REQ-14, REQ-15, INTERNAL_ERROR] Implement the 6 admin route registrars (`get-entry`, `put-entry`, `get-entry-analyze`, `get-settings`, `put-settings`, `post-sitemap-regenerate`) including full error-code→HTTP mapping per api.spec.md §6; `get-settings`/`put-settings` await `deps.seoReady` first (mirrors `settings/get-effective.ts`) — `src/server/routes/admin/seo/*.ts` (depends on T017, T021, T027, T028, T037, T042, T043, T044)
- [ ] T048 [REQ-06, INV-03] Wire `pageShell()` to accept a pre-serialized head-elements string, suppressing its hardcoded `<title>` when the fold already produced a `kind:"title"` element — `src/server/http/site/render.ts` (depends on T009, T045)
- [ ] T049 [REQ-06, REQ-12] Wire `routes/site/pages.ts` to build `PageHeadContext` (`canonicalUrl` via `routing.urlFor`) and call `foldPageHead()` + `serializeHeadElements()` before `renderSite()` on both the home and `:slug` routes — `src/server/routes/site/pages.ts` (depends on T031, T048)
- [ ] T050 [REQ-01, REQ-06, REQ-08, REQ-09, REQ-10, REQ-11, REQ-13] Wire `server/app.ts`: register the 8 SEO route registrars, subscribe `SeoEventSubscriptions` to the 3 entry events, call `ensureSeoSettingDefinitions()` at boot (resolves `seoReady`), register SEO's `PageHeadHook` contributor — `src/server/app.ts` (depends on T012, T021, T031, T046, T047)
- [ ] T051 Run Phase 7 tests to convergence

**Checkpoint**: AC-01/04/10/11/16/18/19/24/25/27/29/30/31 passing end-to-end against the real SQLite adapter and the real render path.

---

## Phase 8 — [Story: Admin UI] Per-entry SEO panel + site-settings screen (P1/P2) — depends on Phase 7

**Goal**: `Seo.tsx` (site-settings screen) and the embedded `SeoEntryPanel` (in `PostEditor.tsx`) let a permitted operator manage SEO end-to-end through the admin API.
**Independent test**: open `/admin/seo`, edit `titleTemplate`/`robotsRules`, save, see round-tripped values; open a post's editor, edit an SEO override, save, see the effective-meta preview update.

- [ ] T052 [P] Implement `Seo.tsx`: `SeoSettingsScreen`, `RobotsRuleEditor` (disables add at 50 rules), `SitemapRegenerateButton`, `ErrorBanner` per ui.spec.md §2.4–2.7/§3.4–3.7 — `apps/admin/src/sections/Seo.tsx` (depends on T050)
- [ ] T053 [P] Implement `SeoEntryPanel` + `SeoMetaPreview` + `SeoAnalysisPanel`, embedded as a tab/section (never mounted standalone, per ui.spec.md §6) — `apps/admin/src/sections/PostEditor.tsx` (depends on T050)
- [ ] T054 [P] Add the 6 admin-route client wrapper functions — `apps/admin/src/lib/api.ts` (depends on T050)
- [ ] T055 Mount `<Seo />` in the admin route table — `apps/admin/src/App.tsx` (depends on T052)
- [ ] T056 Manual `/verify` pass: exercise per-entry SEO save + effective-meta preview, site-settings save, `RobotsRuleEditor` at the 50-rule limit, sitemap regenerate, in a running browser session

**Checkpoint**: AC-24/25/27 (UI round trip) + accessibility checklist (ui.spec.md §5) verified manually — admin UI complete.

---

## Phase N — Polish

Cross-cutting improvements after all required stories pass.

- [ ] T057 [P] Add `src/seo/INFO.md` documenting module purpose, mirroring `settings`/`identity` `INFO.md` convention
- [ ] T058 [P] Code Review architecture check: confirm no route/hook reads `posts.seo_ext_json` or `site.seo.*` settings other than through `seo.ts`/`write-service.ts`/`settings.ts` (INV-09); confirm no second `page.head`-shaped injection point exists outside `page-head.ts`'s registry; confirm the `{type:"json"}` schema variant is used exactly once (`site.seo.robots_rules`) and that SEO's own write-path validator — not the ledger schema — enforces `robotsRules`' shape/length; confirm no `seo.base_url`-shaped setting or raw request-host read exists anywhere (INV-07)
- [ ] T059 [P] Additional unit tests for any pure-logic gaps found during TestRunner coverage report (behavior.spec.md §7 boundary cases not already covered by Phase 2–6 tasks)
- [ ] T060 Full `npm run test:cov` pass — confirm coverage minimums (98/98/98/98 unit, 90/90/90/90 integration) or file a human-approved override with TestRunner's actual measured numbers
- [ ] T061 Update `ADS-project-knowledge/specs/008-seo/traceability.spec.md` impl/test columns from `pending` to real file/function/test references; update `traceability_status`

---

## Parallelization Rules

- Tasks marked [P] in the same phase can be dispatched simultaneously
- Modules must have no shared mutable state during parallel execution
- No Programmer instance writes to a file another instance reads
- If a shared utility needs changes, serialize — do not parallelize writes to shared code
- Phase 2 (write-service.ts) and Phase 3 (settings.ts) are parallelizable with each other (disjoint files, both depend only on the Phase 1 checkpoint)
- Phase 4 depends on both Phase 2 (override storage) and Phase 3 (settings) — do not start Phase 4 implementation tasks (T026–T028) before both checkpoints pass, though Phase 4's test-writing tasks (T023–T025) may be drafted in parallel with Phase 2/3
- Phase 5 depends on Phase 1 (`page-head.ts`) and Phase 4 (evaluator) — do not start before both checkpoints
- Phase 6 depends on Phase 1 (`post.ts` outbox events) and Phase 3 (settings for `robotsRules`/`sitemapEnabled`) — parallelizable with Phase 4/5 (disjoint files: `sitemap.ts` vs `seo.ts`/`page-head-contributor.ts`)
- Phase 7 depends on Phase 2, 3, 4, 5, and 6 all being green — it is the integration layer, not parallelizable against any of them
- Phase 8 depends on Phase 7 (routes must exist for the UI to call)
- Do not parallelize T007 (schema.ts) against any other schema.ts edit in this feature — it is the only touch this feature makes to that shared file

## Execution Strategies

**Sequential (single agent):** Phase 0 → Phase 1 checkpoint → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase 8 → Phase N

**Parallel (multiple Programmer instances):** Phase 0 → Phase 1 checkpoint → {Phase 2, Phase 3} simultaneously → Phase 4 (needs both) → {Phase 5, Phase 6} simultaneously (Phase 5 needs Phase 4; Phase 6 needs Phase 1+3 only, so it can actually start alongside Phase 4 once Phase 1/3 are green — the safe conservative ordering above still holds if in doubt) → Phase 7 (needs 2,3,4,5,6) → Phase 8 (needs 7) → TestRunner aggregates → Phase N

---

## Coverage Summary Against SPEC-008 v1.0.0

Every P1 AC, invariant, edge case, and error code has explicit task coverage. No ADR-backed deferrals were needed beyond the two already recorded in ADR-PIPE-008/traceability.spec.md §6.4 (OQ-01's empty `seo.sitemap.collect` registry — task exists for the empty registry itself, not a real second registrant; and `analyze_seo` protocol/MCP exposure, explicitly out of scope for this pass).

| Spec Item | Priority | Task Coverage |
|---|---|---|
| REQ-01 / AC-01, AC-04 | P1 | T014, T015, T017, T042 |
| REQ-02 / AC-03 | P1 | T007, T014, T015, T017, T042 |
| REQ-03 / AC-04 | P1 | T014, T017, T042 |
| REQ-04 / AC-05, AC-06, AC-07 | P1 | T024, T027 |
| REQ-04 / AC-08 | P2 | T024, T027 |
| REQ-05 / AC-09 | P1 | T027, T031, T045 |
| REQ-06 / AC-10, AC-11 | P1 | T005, T009, T030, T048, T049, T045 |
| REQ-07 / AC-12, AC-13 | P1 | T030, T031 |
| REQ-07 / AC-14, AC-15 | P2 | T030, T031 |
| REQ-08 / AC-16, AC-17, AC-18 | P1 | T033, T037, T040, T046 |
| REQ-09 / AC-19, AC-20 | P1 | T034, T037, T041, T046 |
| REQ-09 / AC-21 | P2 | T034, T037 |
| REQ-10 / AC-22, AC-23 | P1 | T004, T010, T035, T036, T038 |
| REQ-11 / AC-24, AC-25 | P1 | T006, T008, T019, T020, T021, T043 |
| REQ-12 / AC-26 | P1 | T024, T027 |
| REQ-13 / AC-27 | P1 | T035, T037, T044, T047 |
| REQ-14 / AC-28 | P2 | T025, T028 |
| REQ-15 / AC-29, AC-30 | P1 | T014, T017, T019, T021, T042, T043 |
| REQ-16 / AC-31 | P1 | T005, T009, T030, T045 |
| INV-01 | — | T014, T017 |
| INV-02 | — | T024, T027 |
| INV-03 | — | T005, T009, T045 |
| INV-04 | — | T033, T037 |
| INV-05 | — | T033, T037 |
| INV-06 | — | T014, T017, T019, T021 |
| INV-07 | — | T019, T021, T024, T027 |
| INV-08 | — | T035, T037 |
| INV-09 | — | T047, T058 (Code Review architecture check) |
| INV-010 (internal, transition-table) | — | T004, T010 |
| EC-01, EC-02, EC-10, EC-11 | — | T024, T027 |
| EC-03 | — | T014, T017 |
| EC-04 | — | T033, T037 |
| EC-05 | — | T004, T010, T036, T038 |
| EC-06 | — | T005, T009, T030, T045 |
| EC-07 | — | T023, T026 |
| EC-08 | — | T035, T037 |
| EC-09 | — | T034, T037 |
| `SEO_FIELD_VALIDATION_ERROR` | — | T014, T017, T042 |
| `SEO_INVALID_CANONICAL_URL` | — | T014, T017, T042 |
| `SEO_SETTINGS_VALIDATION_ERROR` | — | T019, T021, T043 |
| `SEO_ENTRY_NOT_FOUND` | — | T024, T027, T042 |
| `UNAUTHENTICATED` | — | T014, T017, T019, T021, T042, T043 |
| `FORBIDDEN` | — | T014, T017, T019, T021, T042, T043 |
| `INTERNAL_ERROR` | — | T046, T047 |
| behavior.spec.md §1.1 (precedence) | — | T024, T027 |
| behavior.spec.md §2.1 (`page.head` priority order) | — | T005, T009 |
| behavior.spec.md §2.2 (sitemap keyset order) | — | T033, T037 |
| behavior.spec.md §3 (defaults: `title_template`, `default_robots`) | — | T019, T021 |
| behavior.spec.md §3 (default: non-published derived `noindex=true`) | — | T024, T027 |
| behavior.spec.md §4 (500/2048-char limits) | — | T014, T017, T019, T021 |
| behavior.spec.md §4 (50 `robotsRules` max) | — | T019, T021 |
| behavior.spec.md §5 (dedup) | — | T005, T009 |
| behavior.spec.md §6.1 (tie-break) | — | T005, T009 |
| behavior.spec.md §7 (500/501 boundary) | — | T014, T019 |
| behavior.spec.md §7 (50/51-rule boundary) | — | T019 |
| behavior.spec.md §7 (`noindex:false` draft wins) | — | T024 |

---

## Deferred (ADR-backed, not a coverage gap)

- `seo.sitemap.collect`'s real second registrant — `OQ-01` per feature.spec.md Scope and ADR-PIPE-008 Decision §7: the registry ships live-but-empty (T037); no task exists for a real second collector because none is in scope for this feature.
- No bespoke `CAST(json_extract(...))` partial expression index for sitemap queries — `OQ-02` per ADR-PIPE-008 Decision §7/Re-evaluation Triggers: deferred to a future scale-triggered pass, not a v1 requirement; no task exists for it here by design.
- `analyze_seo` protocol/MCP exposure — deferred to ADR-032 §8 "Phase-5", explicitly out of scope for this pass per traceability.spec.md §6.4.
