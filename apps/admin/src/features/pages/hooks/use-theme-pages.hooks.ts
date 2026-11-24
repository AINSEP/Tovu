import { NO_THEME_ID } from "@/features/themes/api/themes-api.types";
import { useThemePages, type ThemePageRow, type ThemePagesController } from "@jini-ai/admin/pages/hooks/use-theme-pages.hooks";
import type { ThemePageSlugCollision } from "@jini-ai/admin/pages/hooks/theme-pages-port.hooks";
import { type Translate } from '@jini-ai/core/text';

import { pageAdminPath } from "../rules";
import { themePagePublishState, themePagePublishTooltip } from "../lib/theme-page-publish-state";
import { defaultThemePagesPort } from "./theme-pages-dependencies.hooks";

/**
 * Where a colliding content record's own admin editor lives — was also called directly by Theme
 * Studio's Explore warning card (removed 2026-10-10), which used to duplicate this derivation
 * inline before importing it (2026-09-05): a Post's editor route is keyed by slug (`/posts/:slug`,
 * readable-slugs S6a); a Page's goes through {@link pageAdminPath} (`rules.ts`), which prefers the
 * slug and falls back to the id only for the root-slug page. `ThemeExplore.tsx`'s own
 * `ThemeExploreSlugCollision` and this file's
 * `ThemePageSlugCollision` are independently declared, identically-shaped `{ id, slug, title, kind }`
 * port types (see `pages/rules.ts`'s own doc on this structural-typing convention), so that call needs
 * no cast.
 *
 * @complexity O(1).
 */
export function themePageCollisionAdminPath(collision: ThemePageSlugCollision, _optional: Record<string, never> = {}): string {
  return collision.kind === "post" ? `/posts/${collision.slug}` : pageAdminPath(collision);
}

/**
 * The Publish section's own line — the locked reason (already-translated, same string the row's
 * `InfoTip` shows) for a locked row, or the live/not-live state word for a real candidate one.
 *
 * @complexity O(1).
 */
export function themePagePublishSummary({ row, t }: { row: ThemePageRow; t: Translate }, _optional: Record<string, never> = {}): string {
  const state = themePagePublishState({ row, t });
  if (state.kind === "locked") return themePagePublishTooltip(state);
  return state.published ? t("Live") : t("Not live");
}

/**
 * Binds the real `/api/.../presentation` and `/api/.../themes/:id` clients — see
 * `theme-pages-dependencies.hooks.ts`.
 *
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so `Pages.tsx` composes
 * this and a test composes {@link useThemePages} with `createFakeThemePagesPort`.
 */
export function useWiredThemePages(): ThemePagesController {
  return useThemePages({ port: defaultThemePagesPort, noThemeId: NO_THEME_ID });
}
