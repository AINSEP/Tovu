import type { Express } from "express";

import type { RouteDeps } from "../../types";

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
 *   `change-sets/revert.ts`'s own `outbox` (both the gateway argument and
 *   `reverterDeps.outbox` for the settings-ledger applier).
 * - `bus`: `posts/update.ts`'s `processOutbox({ outbox, bus, clock })` drain call — SEO's
 *   sitemap-cache-invalidation subscriber needs the entry-lifecycle event delivered synchronously
 *   within the same request, mirroring the `/workspaces` route's identical inline drain.
 * - `settingsRepo`: `change-sets/revert.ts`'s `reverterDeps.settingsRepo` — the SPEC-007
 *   settings-ledger applier `core.commands.appliers` reverts through this port (ADR-PIPE-007
 *   Migration Safety), not `PresentationSettingsRepoPort`.
 * - `presentationRepo`/`themes`: `presentation/get.ts`/`presentation/patch-active-theme.ts`
 *   (`themes` via `validThemeIds(deps.themes)`).
 * - `themesDir`: `presentation/rescan-themes.ts` — the root to re-run discovery against. Taken from
 *   deps rather than re-derived so a composition root that overrides `TOVU_THEMES_DIR` rescans the
 *   same folder it originally discovered from, instead of silently repopulating the theme list from
 *   the default path.
 * - `entryRepo`/`mediaRepo`/`transformDefinitionRepo`/`menuRepo` (2026-08-11 template-preview fix):
 *   `posts/template-preview.ts` only — it renders a row through `routes/site/pages.ts`'s exported
 *   `renderViaTemplate`, the SAME real render pipeline the public site uses, so it needs that
 *   pipeline's full dependency set: `entryRepo`/`mediaRepo`/`transformDefinitionRepo` feed the
 *   recursive content-marker and widget/media embed resolution, `menuRepo` feeds
 *   `resolveStaticMenusForRender`'s theme-nav lookup. A second, narrower render implementation here
 *   would be exactly the drift risk `renderViaTemplate`'s own doc says reuse avoids.
 */
export type ContentRouteDeps = Pick<
  RouteDeps,
  | "workspaceId"
  | "authorize"
  | "clock"
  | "idGen"
  | "postRepo"
  | "pluginBeforeSaveHook"
  | "pagesHtmlStore"
  | "changeSets"
  | "outbox"
  | "bus"
  | "settingsRepo"
  | "presentationRepo"
  | "themes"
  | "themesDir"
  | "entryRepo"
  | "mediaRepo"
  | "transformDefinitionRepo"
  | "menuRepo"
>;

export type ContentRouteRegistrar = (app: Express, deps: ContentRouteDeps) => void;
