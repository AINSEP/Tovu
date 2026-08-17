import { findTheme, type DiscoveredTheme } from "./theme";

/**
 * @file "Given a list of discovered themes and a candidate active id, which theme actually
 * renders" — moved here 2026-08-16 from `server/routes/site/pages.ts` (2026-08-16 architecture
 * follow-up: edge 2 of the export<->server decoupling — see
 * `ADS-memory/reports/2026-08-16-export-edge-decoupling.md`). Was already a pure `(deps) => value`
 * query with zero `req`/`res`/middleware coupling; the only reason it lived in the routing layer
 * was history, not a real dependency. `export/route-manifest.ts` used to import it straight from
 * `server/routes/site/pages.ts` (a real runtime edge into the composition-root module, flagged by
 * `check:architecture`'s module-cycle detector) purely to reuse this exact logic — this file is the
 * shared home `pages.ts` and `route-manifest.ts` (and now `products.ts`, which used to keep its own
 * private duplicate rather than create the same cross-file coupling) import from instead.
 *
 * Deliberately does NOT also carry `resolveActiveThemeId` (which `pages.ts` calls immediately
 * before this) even though the two are always used together at every real call site — that function
 * has ZERO dependency on theme data (it only reads `PresentationSettingsRepoPort` and returns a bare
 * string), and giving it a home here would have created a real `features/theme -> features/
 * presentation` edge that pulls this whole module into the pre-existing 36-module fused
 * strongly-connected component `features/presentation` already belongs to (measured, not assumed —
 * see `active-theme-id.ts`'s own file header in `features/presentation/` for the full trace and the
 * before/after SCC membership diff). Two files instead of one, so that "used together" and
 * "belongs together" stay separate questions.
 *
 * Deliberately typed against a narrow, LOCAL structural interface below rather than `RouteDeps`
 * (`server/routes/types.ts`) — importing `RouteDeps` here, even as a type-only import, would just
 * relocate the exact edge this move exists to remove (`check-architecture.ts`'s dependency-cruiser
 * pass resolves `--ts-pre-compilation-deps`, so a type-only import counts as a real graph edge, not
 * only a runtime one). `RouteDeps` is a structural superset of it, so every real caller (which
 * always has a full `RouteDeps` in hand) passes it through unchanged, exactly the way `pages.ts`'s
 * own pre-existing `TemplateRenderDeps`/`ContentMarkerResolutionDeps` `Pick`s already do.
 */

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
