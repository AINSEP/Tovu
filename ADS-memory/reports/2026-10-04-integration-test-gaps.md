# Integration test gap map — 2026-10-04

Author: QA(Execution) subagent (owner directive 2026-10-04: author missing integration tests, do NOT run them).
Scope: `apps/website/src` server routes and composition. Newsletter and browser-side timing excluded per owner.

## Method

- Inventoried every `app.<verb>("<path>")` registration under `server/inbound/**` (270 routes).
- For each route, counted test files that reference its path (any tier), test files that reference it AND boot a real store
  (`createSiteRouteDeps` / `bootSiteDir` / `createSiteRouteDepsForWorkspace`, 49 files), and PGlite-booting test files (6).
- Cross-checked repo-level dialect coverage: 69 files use `describeEachDialect`/`eachDialect`
  (`platform/db/kernel/__tests__/dialect-matrix.ts`).
- Matching is by path string, so a test that builds a URL from constants can be missed (counts are a map, not a fact).

## Headline

1. **Repo level is well covered on both dialects.** Almost every Kysely repo has a `describeEachDialect` suite.
2. **Route level runs almost entirely on the hermetic in-memory root.** ~237 of 270 routes have no test that reaches them
   through a real-store composition; the in-memory repos are a different implementation (e.g. `app.ts` binds an inert
   `findForTrash` stub for taxonomy), so a route test passing there proves nothing about the shipped wiring.
3. **PGlite composition is proven by ONE smoke test** (`create-site-route-deps.pglite.integration.test.ts`: create/list/delete
   posts, pages, media, settings, taxonomy, chat). Every other admin route is unproven over Postgres through HTTP.
4. **8 routes are referenced by no test at all** (see gap 6).

## Ranked gaps

| # | Gap | Why it matters | Status tonight |
|---|-----|----------------|----------------|
| 1 | Trash purge / restore through the real composition (SQLite + PGlite) | The only human-triggered hard delete in the product. `admin-trash-routes.test.ts` uses a hand-assembled trash module on SQLite; the PGlite smoke test trashes but never purges or restores. | AUTHORED `server/__tests__/integration/trash-purge-real-composition.unrun.integration.test.ts` |
| 2 | Change-set record → revert through the real composition (SQLite + PGlite), Idempotency-Key replay on the persisted column | ADR-046 moved change-sets off the in-memory repo; revert success path is only tested with fake reverters on the hermetic root. | AUTHORED `server/__tests__/integration/change-set-revert-real-composition.unrun.integration.test.ts` |
| 3 | `POST /api/admin/v1/auth/logout` | Zero references in any test. Must revoke the persisted session row, not just clear the cookie. | AUTHORED `server/__tests__/integration/admin-logout-session.unrun.integration.test.ts` |
| 4 | Admin CRUD families on PGlite through HTTP: menus, redirects, forms, content-types → entries lifecycle, users/roles/policies | Only in-memory route tests exist; Postgres type/constraint differences (JSONB, booleans, unique violations → 409 mapping) surface only here. | AUTHORED: `redirects-real-composition` (admin write → live 301 → Trash → restore), `collections-entries-real-composition` (type → entry → JSON round-trip → publish, slug/version conflicts), `menus-real-composition` (nested tree round-trip, stale version). Forms, users/roles/policies NOT authored. |
| 5 | Taxonomy term merge plan → confirm → execute; database migrate-forward plan → confirm → execute; publish-content import plan → confirm → execute — gated-mutation token flows on a real store | Token rows live in `gated_mutation_tokens`; in-memory tests can't catch a dialect bug in single-use consumption. | NOT authored (next wave) |
| 6 | Routes with ZERO test references. The path-string scan flagged 8; on inspection 6 are false positives (tests build the URL from constants: tool-approvals, oauth device poll, themes file delete, themes page publish, widgets trash all have tests). Truly untested: `POST /auth/logout` (gap 3) and newsletter list archive (excluded). | Untested at every tier. | logout AUTHORED (gap 3) |
| 7 | Member sign-in → magic link → complete → member session on the real composition (real mailer resolution, `magic_links` table) | Existing tests use `createRouteDeps()` and capture the console mailer. | NOT authored — `members-magiclink-red` agent is active in this area tonight; avoid collision |
| 8 | Plugin install → enable → render on the real composition (declared content types persisted, then rendered by the site) | `testimonials-faq-sample.integration.test.ts` proves it on the hermetic root only. | NOT authored — AW-7 agents are active in this area tonight |
| 9 | Users / roles / policies RBAC routes on a real store (grant → effective permission → 403/200 on a gated route) | 20 route tests, all hermetic. | AUTHORED `server/__tests__/integration/rbac-grants-real-composition.unrun.integration.test.ts` |
| 10 | Recovery restore-points / restore and database timeline on SQLite through HTTP | Restore is destructive; only route-level tests with in-memory deps exist. | NOT authored |
| 11 | Assistant execution credential / site credential PUT→GET→DELETE on a real store (sealed credential repos) | Repos are dialect-tested; the route→sealing→repo seam is not. | NOT authored |
| 12 | Boot wiring on PGlite: `runBootLifecycle` modules (reconciliation, settings/seo critical failures) | `boot-lifecycle-real-deps.integration.test.ts` is SQLite only. | NOT authored |

## Round 4 (2026-10-04) — real-DB route groups, authored NOT RUN

| Route group | File (`server/__tests__/integration/`) | Tests |
|---|---|---|
| Pages: draft/publish visibility on `/<slug>`, slug change → 301 capture, version CAS, kind guard, reserved slug, delete → Trash | `pages-real-composition.unrun.integration.test.ts` | 12 |
| Media: upload → public `/m/` URL, metadata PATCH + slug 409, delete ladder (409 live → trash → 410 → purge), Trash restore, content sniff | `media-real-composition.unrun.integration.test.ts` | 10 |
| Taxonomy/terms: hierarchy CRUD + parent refusals, `TERM_HAS_CHILDREN`, trashed-term assignment hide/restore, taxonomy trash/restore | `taxonomy-terms-real-composition.unrun.integration.test.ts` | 10 |
| Comments: anonymous submit → queue → approve/spam/trash/restore/purge, version 409, keyset paging, unknown cursor 400 (intended), live settings | `comments-moderation-real-composition.unrun.integration.test.ts` | 10 |
| Forms (gap #4 forms half): definition CRUD + slug 409, anonymous submit stored + listed, duplicate collapse, validation/honeypot, disable/enable, submission delete | `forms-real-composition.unrun.integration.test.ts` | 8 |

Still without a real-DB HTTP test: settings (site profile, locale), widgets/regions (assign, reorder, render), users admin
(create, role change, disable — partly covered by round 1's RBAC file), themes (activate/revert + public render), site export
bundle contents, boot lifecycle on PGlite (gap #12).

Round 4 suspected product bugs (read, not reproduced):

5. Slug-change redirect capture is never invoked. `deps.ts:1546` binds `RedirectSlugChangeCapture` via
   `registerSlugChangeCapture`, but nothing in `apps/website/src` calls `getSlugChangeCapture()` (`platform/routing/routing.ts:587`
   has no callers). A published page/post whose slug changes leaves its old URL 404 instead of 301 (SPEC-009 REQ-15).
6. `features/post/post.ts:1284` `validateUpdatePostInput` checks slug format but not `isReservedSlug`; create refuses `admin`/`api`
   (`post.ts:1122`), so a page can be RENAMED to a reserved slug that create would refuse.
7. Gap-map bug #2 (posts title-only PUT wipes slug) is likely NOT reachable: `""` fails `SLUG_FORMAT_PATTERN` in
   `validateUpdatePostInput`, so it 400s rather than wiping. Downgrade to "PUT requires full body".

## Notes for whoever runs these

- All authored files are named `*.unrun.integration.test.ts`, start with the `@unrun` header and prefix every title `[unrun] `.
  Registry: `development/UNRUN-TESTS.md`.
- The root `npm test` / `test:ci` globs (`apps/website/src/**/*.test.ts`) and `isIntegrationTestFile` WILL pick these files up.
  Running the full suite runs them. Run them scoped first.
- Shared boot helper: `server/__tests__/helpers/unrun-site-boot.ts` (`initSite` → `bootSiteDir` → `createSiteRouteDeps` with
  `serve.ts`'s overrides → `createApp` → owner login), one body for `sqlite` and `pglite`. PGlite boots cost seconds each.

## Possible product bugs

Spotted while reading, not fixed, not reproduced.

1. `apps/website/src/server/inbound/admin-http/dev-auth.ts:492` — `POST /api/admin/v1/auth/logout` has no try/catch. If `deps.identityReady` or the session store (`findByTokenHash` / `revoke`) rejects, Express 4 drops the rejected promise: the client gets no response and the request hangs until timeout, instead of a 500. Every sibling route in the file catches and returns 500.
2. `apps/website/src/server/inbound/admin-http/routes/posts/update.ts:42` — `parsePostUpdateBody` turns a missing `slug` into `String(body.slug ?? "")`, i.e. `""`. A title-only `PUT .../posts/:id` (no `slug` in the body) hands `updatePost` an empty slug, so the post's slug may be wiped or regenerated from the new title. That silently breaks existing public URLs, unless `updatePost` treats `""` as "keep".
3. `apps/website/src/server/runtime/composition/deps.ts:1515` — the disposer returned by `registerRedirectsPhaseHandlers(...)` is thrown away, and closing the site store never unregisters the handler. After a site composition closes (site switch, test teardown, failed boot), its redirect resolver stays registered on the process-wide resolve phase, bound to a closed repo. Until another composition registers and replaces it, every route that runs the resolve phases can 500. `features/redirects/phase-handler.ts` documents that exact failure for the replacement case only.
4. `apps/website/src/server/__tests__/helpers/http-test-server.ts:102` (test helper, not product) — `BarePrincipalDeps.passwordHasher.hash` is typed `(password: string)` but is called with `{ password }`. This is a real TS2345 error that is never reported, because the root `tsconfig.json` excludes `__tests__`. It does not fail at runtime only because the real hasher takes an object.

## Round 5 (2026-10-05) — real-DB route groups, authored NOT RUN

| Route group | File (`server/__tests__/integration/`) | Tests |
|---|---|---|
| Settings: `core.site.title` write -> public `/feed.xml`, clear fallback, refusals; `core.language.locale` per-user layer; `site/profile` | `settings-real-composition.unrun.integration.test.ts` | 8 |
| Themes: activate -> persisted -> public home asset marker -> revert; 400s | `themes-activation-real-composition.unrun.integration.test.ts` | 4 |
| Widgets/regions: widget CRUD, region bind/placements/reorder/409, public region render via a copied declarative theme with `regions`, html Page inline embed | `widgets-regions-real-composition.unrun.integration.test.ts` | 10 |
| Users admin (beyond round 1 RBAC): create/conflict/PATCH, role change on a live session, enable, reset-password, DELETE -> Trash -> restore, SELF_DELETE | `users-admin-real-composition.unrun.integration.test.ts` | 12 |

Still NOT authored (agent stopped at the context ceiling): site static export bundle contents
(`system/export-site.ts`), PGlite boot on its own (live foreign owner lock refused, lifecycle modules on PGlite, gap #12).
See the round 5 handoff in `.local-artifacts/handoffs/`.

Round 5 observations (read, not reproduced):

8. No stock theme declares `regions` (`content/themes/*/*/theme.json`), so widget regions cannot render on any shipped
   theme; the region test has to copy a theme and add `regions` itself. Regions are only reachable for theme authors.
9. Static-tier home pages (`renderStaticTierHomePage`) never read `siteTitle`, so `core.site.title` only reaches a
   static site's home through the SEO head contributor and `/feed.xml`; the tests use the feed.
10. `resolveExportOutputRootDir()` (`deps.ts:483`) defaults to `siteDir()`, i.e. `TOVU_SITE_DIR` or `<cwd>/sites/<name>`,
    not the booted site folder. `serve.ts` pins `TOVU_SITE_DIR`, but any composition that does not (tests, the unrun
    helper) would write an admin-triggered export under the process cwd. An export test must set `TOVU_EXPORT_DIR` first.
