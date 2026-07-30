# Feature Spec: Server Module Convention — Second Slice (ADR-046 Phase 3)

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-034 |
| version | 1.0.0 |
| status | APPROVED |
| feature_name | FEAT-034-server-module-convention-second-slice |
| last_edited | 2026-07-16T00:00:00Z |
| owner | Leon Aburime |
| spec_agent | Spec Agent (in-session, direct — Claude Code host, dispatched subagent) |
| spec_mode | brownfield |

## Scope Note (disclosed — read this before assuming Phase 3 is "done")

SPEC-031 shipped the `ServerModuleHandle` convention's first slice (`core`, `forms`,
`integrations`) and explicitly left ~60 route registrations inline in `app.ts`, to be pulled
demand-paged rather than in one big-bang migration (ADR-046's own Phase 3 "highest-risk phase"
framing, plus fold-in item 8's concurrent-edit incident). This spec pulls the next 3
self-contained domains SPEC-031's own "Suggested next assignee" and ADR-046 Phase 3's illustrative
sketch both name: **media**, **taxonomy**, and the **integrations admin CRUD surface** (distinct
from SPEC-031's already-shipped fan-out subscriber).

**What did NOT move in this slice (explicit, not an oversight):**
- The remaining ~45 `app.ts` route registrations outside these 3 domains (posts, pages,
  change-sets, presentation, members, menus, users/roles/policies, settings, forms admin,
  redirects, storage/recovery, content-types/entries, SEO, comments moderation, analytics).
- `requireAdminSession`'s `app.use("/api/admin", ...)` mounting — investigated this slice (see
  Non-Goals below for why it's genuinely order-entangled with `registerAuthRoutes`, not just
  deferred by choice).
- `deps.ts`'s adapter-construction lines — untouched; the 3 new modules' factories receive
  already-built ports via `RouteDeps`, exactly like `forms`/`integrations` before them.
- `registerAdminTaxonomyMergeTermRoutes` (ADR-044's gated-mutation ceremony) — stays inline,
  entangled with the shared `core/gated-mutations` gateway pattern storage/recovery also use.
- `content.ts` module from the ADR's own illustrative sketch — not built this slice.

## Problem Statement

**Current state (before this slice):** the 5 admin media routes, the public media-rendition
route, the 5 plain taxonomy routes, and the 5 integrations-admin routes were all registered
inline in `app.ts`'s `createApp()`, each imported individually (17 import lines) and each typed
against the full `RouteDeps` service locator even though every one of them reads only a small,
fixed subset of its fields — the exact anti-pattern ADR-046 Phase 3 names: modules should "receive
only the dependencies [they] need," never the full mutable universal deps bag.

**Desired state:** three new `ServerModuleHandle` factories — `createMediaModule`,
`createTaxonomyModule`, `createIntegrationsAdminModule` — each constructed from a genuinely
narrow, `Pick<RouteDeps, ...>`-shaped parameter type, each calling the exact same pre-existing
registrar function bodies (moved, not rewritten), wired into `createApp()` at the same relative
position the inline blocks used to occupy.

## Requirements

- REQ-01: `src/server/routes/admin/media/deps.ts` shall define `MediaRouteDeps` (a `Pick` of
  `RouteDeps`: `workspaceId`, `authorize`, `clock`, `idGen`, `mediaRepo`, `assetBlobRepo`,
  `assetRenditionRepo`, `blobStore`, `transformDefinitionRepo`, `imageTransformer`) and
  `MediaRouteRegistrar`, mirroring `routes/ops/health.ts`'s `NoDepsRouteRegistrar` precedent for
  what a module's real dependency surface should look like.
- REQ-02: the 5 admin media route files (`list.ts`/`upload.ts`/`update.ts`/`trash.ts`/`delete.ts`)
  and the public `routes/site/media-rendition.ts` shall retype their registrar exports from
  `RouteRegistrar` to `MediaRouteRegistrar` — same function bodies, narrower parameter type only.
- REQ-03: `src/server/modules/media.ts` shall export `createMediaModule(deps: MediaRouteDeps)`
  whose `registerRoutes(app)` calls all 6 media registrars (5 admin + 1 public), byte-identical
  behavior to the pre-slice inline calls.
- REQ-04: `src/server/routes/admin/taxonomy/deps.ts` shall define `TaxonomyRouteDeps` (a `Pick` of
  `RouteDeps`: `workspaceId`, `authorize`, `clock`, `idGen`, `outbox`, `taxonomyRepo`, `termRepo`,
  `entryTermRepo`, `taxonomyRevisionRepo`) and `TaxonomyRouteRegistrar`.
- REQ-05: the 5 plain taxonomy route files (`list.ts`/`create-taxonomy.ts`/`create-term.ts`/
  `rename-term.ts`/`assign-terms.ts`) shall retype their registrar exports from an inline
  `(app: Express, deps: RouteDeps)` signature to `(app: Express, deps: TaxonomyRouteDeps)`.
  `merge-term.ts` is explicitly excluded (see Non-Goals).
- REQ-06: `src/server/modules/taxonomy.ts` shall export `createTaxonomyModule(deps:
  TaxonomyRouteDeps)` whose `registerRoutes(app)` calls the 5 taxonomy registrars.
- REQ-07: `src/server/routes/admin/integrations/deps.ts`'s `IntegrationsRouteDeps` shall change
  from `extends RouteDeps` (a historical widening, from before `webhookSubscriptionRepo`/
  `webhookDeliveryRepo` existed on `RouteDeps`) to `Pick<RouteDeps, "workspaceId" | "authorize" |
  "clock" | "idGen" | "webhookSubscriptionRepo" | "webhookDeliveryRepo" | "originRegistry">` — a
  genuine narrowing, backward-compatible with every existing consumer (a full `RouteDeps` object
  still satisfies a `Pick` of itself).
- REQ-08: `src/server/modules/integrations-admin.ts` shall export
  `createIntegrationsAdminModule(deps: IntegrationsRouteDeps)` whose `registerRoutes(app)` calls
  the 5 integrations-admin registrars (list/create/pause/delete/deliveries) — distinct from
  SPEC-031's `modules/integrations.ts`, which owns the Forms-to-webhook fan-out subscriber (an
  unrelated, non-HTTP concern that happens to live in the same `integrations` library).
- REQ-09: `app.ts`'s `createApp()` shall call the 3 new module factories instead of the 15 inline
  registrar calls they replace, at the same relative registration position, and shall remove the
  now-dead direct registrar imports (17 import lines).
- REQ-10: a structural test shall assert the site catch-all (`GET /:slug`) is registered strictly
  after every other route in the real `createApp()` composition, replacing the previous
  comment-only enforcement of "`/:slug` remains last."
- REQ-11: behavior must be byte-identical from any external caller's perspective — same routes,
  same responses, same status codes, same auth gating.

## Acceptance Criteria

- AC-01 (REQ-01/02/03) [P1]: `src/server/__tests__/admin-media-routes.test.ts` (unmodified) still
  passes against the real `createApp()` composition, proving the 5 admin media routes' behavior
  (auth gating, status codes, response shapes) is unchanged after retyping + module extraction.
- AC-02 (REQ-02/03) [P1]: the public rendition route (`GET /m/:assetId/...`) still resolves
  correctly through `createMediaModule(...).registerRoutes(app)`, still returns 503 via
  `ImageTransformUnavailableError` when the transform can't run, still registers before the site
  `/:slug` catch-all (verified transitively by AC-05 below, since it's now registered even earlier
  than before).
- AC-03 (REQ-04/05/06) [P1]: `src/server/__tests__/routes/taxonomy-routes.test.ts` and
  `taxonomy-merge-term-routes.test.ts` (both unmodified) still pass — the 5 plain routes via the
  new module, the merge-term ceremony via its untouched inline registration.
- AC-04 (REQ-07/08) [P1]: `src/server/__tests__/admin-integrations-routes.test.ts` (unmodified)
  still passes — it constructs `IntegrationsRouteDeps` by spreading a full `createRouteDeps()`
  result, which still structurally satisfies the now-narrower `Pick`-based type.
- AC-05 (REQ-10) [P1]: `src/server/__tests__/unit/route-class-precedence.unit.test.ts` (new)
  introspects `createApp()`'s real Express router stack and asserts `GET /:slug` is the last
  registered route layer, and that no other route shares its literal path.
- AC-06 (REQ-09/11) [P1]: the full existing test suite passes unchanged after the extraction —
  this is a refactor, not a behavior change (see Implementation Record for the exact count).

## Non-Goals

- The remaining ~45 `app.ts` route registrations outside media/taxonomy/integrations-admin — see
  Scope Note.
- **`requireAdminSession`'s `app.use("/api/admin", ...)` mounting relocation into `core.ts`** —
  investigated and explicitly deferred, not merely skipped. Concrete finding: `registerAuthRoutes`
  registers `POST /api/admin/v1/auth/login` (an `/api/admin`-prefixed route) BEFORE
  `app.use("/api/admin", requireAdminSession(...))` is mounted — Express matches by registration
  order, so login must stay registered ahead of the gate or authentication breaks entirely (no way
  to obtain a session without an already-gated login route). `core.ts`'s `createCoreModule()` is
  currently zero-argument (SPEC-031); folding the gate mount into it would require either (a)
  absorbing `registerAuthRoutes` itself into `core.ts` too — a different concern (auth ROUTES vs.
  the session-gate MIDDLEWARE) not part of this module's stated scope, or (b) widening
  `ServerModuleHandle` beyond its established single-`registerRoutes`-call shape to support
  interleaved registration. Both are real design changes, not a same-shape relocation — exactly
  the "riskier than expected" case the task brief called out as a valid reason to skip. Left
  inline in `app.ts`, comment-documented at its call site same as before.
- `registerAdminTaxonomyMergeTermRoutes` — see Scope Note; stays inline with the storage/recovery
  gated-mutation ceremonies it shares `core/gated-mutations-composition.ts` construction with.
- `content.ts`/full route-class classification system (`fixed-public`/`parameterized-public`/
  `catch-all` typed enum) — the structural test (REQ-10) satisfies the ADR's literal ask ("a test
  that asserts the site catch-all route is registered after every other route") without building
  the larger classification system ADR-046 Phase 3 only sketches as a nice-to-have.
- Any `deps.ts` change — the 3 new modules' factories all receive already-built `RouteDeps` slices;
  `deps.ts`'s SQLite adapter construction is untouched, same non-goal SPEC-031 established.

## Constitution Compliance

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | No new dependency. |
| II — Test-First | COMPLIES | New structural test (`route-class-precedence.unit.test.ts`); every touched domain's pre-existing test suite re-run unmodified as the regression gate (AC-01/03/04/06). |
| III — Simplicity Gate | COMPLIES | 3 modules, narrow `Pick`-based deps types, no new abstraction beyond what SPEC-031 already established — this slice is pure repetition of an already-accepted pattern onto 3 more domains. |
| IV — Anti-Abstraction Gate | COMPLIES | Extends `ServerModuleHandle`'s existing consumer set (6 total after this slice); no new port, no new generic mechanism. |
| V — Integration-First Testing | COMPLIES | AC-01–05 all exercise the real `createApp()` composition or real registrar functions against real (in-memory) adapters, not mocks. |
| VI — Security-by-Default | N/A | No authz surface change — same routes, same permission strings, same gates, unmoved. |
| VII — Spec Integrity | COMPLIES | This spec is the reference for the implementation it accompanies, including its own explicit scope limits and the one investigated-and-declined item (`requireAdminSession`). |
| VIII — Observability | N/A | No new observable signal. |

## Implementation Record

- `src/server/routes/admin/media/deps.ts` (new): `MediaRouteDeps`, `MediaRouteRegistrar`.
- `src/server/routes/admin/media/{list,upload,update,trash,delete}.ts`: retyped to
  `MediaRouteRegistrar`.
- `src/server/routes/site/media-rendition.ts`: retyped to `MediaRouteRegistrar`.
- `src/server/modules/media.ts` (new): `createMediaModule()`.
- `src/server/routes/admin/taxonomy/deps.ts` (new): `TaxonomyRouteDeps`, `TaxonomyRouteRegistrar`.
- `src/server/routes/admin/taxonomy/{list,create-taxonomy,create-term,rename-term,assign-terms}.ts`:
  retyped to `TaxonomyRouteDeps`. `merge-term.ts` untouched.
- `src/server/modules/taxonomy.ts` (new): `createTaxonomyModule()`.
- `src/server/routes/admin/integrations/deps.ts`: `IntegrationsRouteDeps` changed from
  `extends RouteDeps` to `Pick<RouteDeps, ...>` (7 fields).
- `src/server/modules/integrations-admin.ts` (new): `createIntegrationsAdminModule()`.
- `src/server/app.ts`: 15 inline registrar calls replaced by 3 module factory calls; 17 now-dead
  direct registrar imports removed; 3 new module-factory imports added.
- Tests: `src/server/__tests__/unit/route-class-precedence.unit.test.ts` (new, 2 cases).
- Full suite: 1660 tests, 1656 passing, same 4 pre-existing, disclosed, unrelated failures (2x
  `operation-lock.unit.test.ts`, 1x redirects site-serving, 1x SEO site-serving) — zero new
  failures. Typecheck clean (`tsc -p tsconfig.json --noEmit`, zero errors).

## Handoff Contract

- **Inputs used:** direct inspection of the exact 15 registrar calls and their surrounding
  ordering comments in `app.ts` before moving them; each domain's existing test file (unmodified)
  as the regression oracle; `routes/ops/health.ts`'s `NoDepsRouteRegistrar` as the established
  precedent for narrow-registrar-typing; `routes/admin/integrations/deps.ts`'s own file header,
  which had already disclosed its `extends RouteDeps` shape as a temporary historical artifact
  waiting for `RouteDeps` to carry the fields directly (it now does).
- **Output summary:** 3 more `ServerModuleHandle` consumers exist (`media`, `taxonomy`,
  `integrations-admin`), each with genuinely narrow typed deps (not the full `RouteDeps` locator).
  The structural route-precedence check the ADR named is now a real, executable test instead of a
  comment. `requireAdminSession` relocation was investigated, found genuinely order-entangled with
  `registerAuthRoutes`, and explicitly deferred with the concrete blocking reason recorded above
  (not silently dropped).
- **Risks:** none beyond the disclosed scope limits — verified as a pure refactor (full suite
  unchanged except the 2 new structural-test cases; every touched domain's existing test file ran
  unmodified and green).
- **Suggested next assignee:** Coordinator or a future session, for the next Phase 3 pull —
  candidates in rough priority order: (1) `requireAdminSession` + `registerAuthRoutes` together as
  one paired relocation (now that this slice has mapped the exact ordering constraint blocking a
  partial move), (2) a `content.ts` module for posts/pages/change-sets/presentation, (3) members
  admin + public routes as a paired module (mirrors this slice's `integrations`/`integrations-admin`
  split: two concerns, one library). Phase 4 (`dependency-cruiser` CI gate) remains genuinely
  blocked — no CI pipeline exists in this repo — and should keep being recorded as a decision note,
  not attempted.
