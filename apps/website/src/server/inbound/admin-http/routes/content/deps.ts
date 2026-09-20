import type { Express } from "express";

import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file ADR-046 Phase 3 (SPEC-038) — narrow `RouteDeps` slice for the `content` server module
 * (posts/pages/change-sets/presentation — NOT the ADR-043 Collections `content-types`/`entries`
 * domain; see `modules/content.ts`'s file header for the disambiguation).
 *
 * Purpose:
 * The 11 posts/pages/change-sets/presentation registrars only ever read a fixed subset of
 * `RouteDeps` — this is a genuine narrowing (mirrors `routes/admin/media/deps.ts`'s/
 * `routes/admin/taxonomy/deps.ts`'s identical rationale from SPEC-034), not a widening extension.
 *
 * Each field's real reader, confirmed by reading all 11 registrar files directly rather than
 * guessing:
 * - `workspaceId`/`authorize`/`clock`/`idGen`: every one of the 11 registrars.
 * - `postRepo`: posts list/create/get/update, pages list/create, and `change-sets/revert.ts`'s
 *   `reverterDeps.postRepo` (the post-entity reverter needs the same repo).
 * - `pagesHtmlStore`: `pages/update-html.ts` only (SPEC-047/ADR-056). Deliberately NOT read by
 *   `pages/update.ts` — the bespoke-HTML body and the title/slug/status metadata are written
 *   through two different chokepoints, and that separation is the CIC-3 invariant.
 * - `changeSets`: posts create/update, pages create (the SPEC-001 command gateway's audit trail),
 *   plus `change-sets/list.ts`/`get.ts`/`revert.ts` themselves.
 * - `outbox`: posts create/update, pages create (command-gateway side-effect queue), plus
 *   `change-sets/revert.ts`'s own `revertChangeSet({ deps: { outbox, ... } })` argument (the
 *   `change-set.reverted` event, not the post reverters — those close over their own outbox at
 *   composition-root time now, see `revertRegistry` below).
 * - `bus`: `posts/update.ts`'s `processOutbox({ outbox, bus, clock })` drain call — SEO's
 *   sitemap-cache-invalidation subscriber needs the entry-lifecycle event delivered synchronously
 *   within the same request, mirroring the `/workspaces` route's identical inline drain.
 * - `revertRegistry`: `change-sets/revert.ts` reads this directly instead of building one itself.
 *   `settingsRepo` is deliberately NOT in this list any more (2026-08-13
 *   features-post-deep-import-trace.md Job 2) — it was here only for `revert.ts`'s own
 *   `reverterDeps.settingsRepo`, and that field was dead (declared, never read by either post
 *   reverter); removing it cost nothing.
 * - `presentationRepo`/`themes`: `presentation/get.ts`/`presentation/patch-active-theme.ts`
 *   (`themes` via `validThemeIds(deps.themes)`).
 * - `themesDir`: `presentation/rescan-themes.ts` — the root to re-run discovery against. Taken from
 *   deps rather than re-derived so a composition root that overrides `TOVU_THEMES_DIR` rescans the
 *   same folder it originally discovered from, instead of silently repopulating the theme list from
 *   the default path.
 * - `packageThemesDir`: `routes/themes/explore.ts`'s detail/copy/rename/reset routes, via
 *   `resolveThemeOriginalSource` (Design C, 2026-09-16) — the package's read-only catalog fallback
 *   for a theme an already-seeded site has no catalog original of its own for. Optional; `undefined`
 *   for any composition root that predates this field, treated as "no fallback," not an error.
 * - `entryRepo`/`mediaRepo`/`transformDefinitionRepo`/`menuRepo`/`mediaContentTypeStore`
 *   (2026-08-11 template-preview fix; `mediaContentTypeStore` added 2026-08-24 for the video/embed
 *   capability): `posts/template-preview.ts` only — it renders a row through `routes/site/pages.ts`'s
 *   exported `renderViaTemplate`, the SAME real render pipeline the public site uses, so it needs
 *   that pipeline's full dependency set: `entryRepo`/`mediaRepo`/`transformDefinitionRepo` feed the
 *   recursive content-marker and widget/media embed resolution, `menuRepo` feeds
 *   `resolveStaticMenusForRender`'s theme-nav lookup, and `mediaContentTypeStore` is what lets that
 *   same resolution tell a video asset from an image one (`resolver-service.ts`'s
 *   `resolveMediaTypeEmbeds`) — without it, a template preview would render a video embed as a
 *   broken `<img>`, byte-identical to before this field existed only for previews, not the live site.
 *   A second, narrower render implementation here would be exactly the drift risk `renderViaTemplate`'s
 *   own doc says reuse avoids.
 *
 *   NOT widened for the 2026-08-12 `.liquid` Preview-tab fix: that route
 *   (`middleware/theme-page-preview.ts`) needs `requireAdminSession`'s own identity-repo dependency
 *   set (`principalRepo`/`sessionRepo`/`roleRepo`/`passwordHasher`/`identityReady`, none of which any
 *   other route in this module touches) on top of the render-pipeline repos, which is a materially
 *   bigger and differently-shaped widening than anything else this type carries. It stays registered
 *   directly in `app.ts` against full `RouteDeps` instead — see that route's own file header.
 */
export type ContentRouteDeps = Pick<
  RouteDeps,
  | "workspaceId"
  | "authorize"
  | "clock"
  | "idGen"
  | "postRepo"
  /** `posts/delete.ts` + `pages/delete.ts` — the injected, pre-bound removal these routes hand
   *  `deletePost` in place of the `postRepo.softDelete` call it used to make itself. */
  | "removePost"
  | "pluginBeforeSaveHook"
  | "pagesHtmlStore"
  | "changeSets"
  | "outbox"
  | "bus"
  | "revertRegistry"
  | "presentationRepo"
  | "themes"
  | "themesDir"
  | "packageThemesDir"
  | "entryRepo"
  | "mediaRepo"
  | "transformDefinitionRepo"
  | "menuRepo"
  | "mediaContentTypeStore"
>;

export type ContentRouteRegistrar = (app: Express, deps: ContentRouteDeps) => void;
