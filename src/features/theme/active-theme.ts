import type { UUID } from "@jini-ai/cms/core";
import {
  getPresentationSettings,
  PresentationSettingsNotFoundError,
  type PresentationSettingsRepoPort,
} from "#src/features/presentation/index";
import { findTheme, type DiscoveredTheme } from "./theme";

/**
 * @file "Which theme is active, and what does that resolve to" — moved here 2026-08-16 from
 * `server/routes/site/pages.ts` (2026-08-16 architecture follow-up: edge 2 of the export<->server
 * decoupling — see `ADS-memory/reports/2026-08-16-export-edge-decoupling.md`). Both functions were
 * already pure `(deps) => value` queries with zero `req`/`res`/middleware coupling; the only reason
 * they lived in the routing layer was history, not a real dependency. `export/route-manifest.ts`
 * used to import them straight from `server/routes/site/pages.ts` (a real runtime edge into the
 * composition-root module, flagged by `check:architecture`'s module-cycle detector) purely to reuse
 * this exact logic — this file is the shared home both `pages.ts` and `route-manifest.ts` (and now
 * `products.ts`, which used to keep its own private duplicate of {@link resolveActiveTheme} rather
 * than create the same cross-file coupling) import from instead.
 *
 * Deliberately typed against narrow, LOCAL structural interfaces below rather than `RouteDeps`
 * (`server/routes/types.ts`) — importing `RouteDeps` here, even as a type-only import, would just
 * relocate the exact edge this move exists to remove (`check-architecture.ts`'s dependency-cruiser
 * pass resolves `--ts-pre-compilation-deps`, so a type-only import counts as a real graph edge, not
 * only a runtime one). `RouteDeps` is a structural superset of both interfaces below, so every real
 * caller (which always has a full `RouteDeps` in hand) passes it through unchanged, exactly the way
 * `pages.ts`'s own pre-existing `TemplateRenderDeps`/`ContentMarkerResolutionDeps` `Pick`s already do.
 */

/** The narrow slice {@link resolveActiveThemeId} needs. */
export interface ActiveThemeIdResolutionDeps {
  presentationRepo: PresentationSettingsRepoPort;
  workspaceId: UUID;
}

/** Exported so `export/route-manifest.ts` resolves the SAME active theme id the real routes render
 *  with — one source of truth for "what theme is live" rather than a second copy of the
 *  `PresentationSettingsNotFoundError`-swallowing fallback below. */
export async function resolveActiveThemeId(deps: ActiveThemeIdResolutionDeps): Promise<string> {
  try {
    const { settings } = await getPresentationSettings({
      deps: { repo: deps.presentationRepo },
      input: { workspaceId: deps.workspaceId },
    });
    return settings.activeThemeId;
  } catch (err) {
    if (err instanceof PresentationSettingsNotFoundError) return "";
    throw err;
  }
}

/** The narrow slice {@link resolveActiveTheme} needs. */
export interface ActiveThemeResolutionDeps {
  themes: DiscoveredTheme[];
}

/**
 * Resolve the theme to render with: the active theme when discovered and valid,
 * otherwise the first valid theme, otherwise the first discovered theme. This is
 * the render-time fallback that keeps the public site from 500-ing when the
 * active theme id is missing/invalid (SPEC-004 REQ-10, spike-level).
 */
export function resolveActiveTheme(deps: ActiveThemeResolutionDeps, activeThemeId: string): DiscoveredTheme | null {
  const active = findTheme({ themes: deps.themes, id: activeThemeId });
  if (active && active.status === "valid") return active;
  return deps.themes.find((t) => t.status === "valid") ?? deps.themes[0] ?? null;
}
