import type { StaticSiteContextFn } from "#src/features/source-control/commit-site";
import { NO_THEME_ID } from "#src/contracts/core/theme-ids";
import { resolveActiveTheme, type ActiveThemeResolutionDeps } from "#src/features/theme/index";

import type { RouteDeps } from "../../routes/types.js";

/** The slice of `RouteDeps` this reads, so a fake can stand in for the whole bag. */
export type StaticSiteContextDeps = ActiveThemeResolutionDeps & Pick<RouteDeps, "siteDisplayName" | "resolveActiveThemeId">;

/**
 * Binds the site/theme identity a portable static copy is labelled with. Both composition roots bind
 * it, so the rule lives once. `readDeps` is a getter, not the deps object: the root passes
 * `() => routeDeps` from inside the very literal that builds `routeDeps`, and the value is only read
 * when a commit or preview runs, after construction (the same late-read `exportSiteBound` relies on,
 * so a test that overrides `resolveActiveThemeId` in place is honoured).
 * @complexity O(1) per call, one theme lookup.
 */
export function bindStaticSiteContext({ readDeps, siteName }: { readDeps: () => StaticSiteContextDeps; siteName: string }, _options = {}): StaticSiteContextFn {
  return async () => {
    const deps = readDeps();
    const theme = resolveActiveTheme({ deps, activeThemeId: await deps.resolveActiveThemeId() });
    const active = theme && typeof theme === "object" ? theme.manifest : null;
    return { name: deps.siteDisplayName.read() ?? siteName, slug: siteName, theme: active?.name ?? "None", themeId: active?.id ?? NO_THEME_ID };
  };
}
