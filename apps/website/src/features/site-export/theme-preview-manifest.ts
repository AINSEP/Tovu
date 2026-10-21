import type { SettingsRepoPort } from "@jini-ai/core/settings";
import { readPreviewSwitcher } from "#src/features/theme/preview-switcher";
import { previewThemePath } from "#src/features/theme/preview-switcher-html";
import { buildRouteManifest, type RouteManifestDeps } from "./route-manifest.js";
import type { RouteManifest, ManifestRoute } from "./ports.js";

function isHtmlPage({ route }: { route: ManifestRoute }, _options = {}): boolean {
  return !["well-known", "redirect", "not-found"].includes(route.kind);
}

/** Extend the existing route enumerator for each theme; the exporter still fetches the real app.
 * O(themes × routes), at most 8 themes. Only normal routes own sitemap/feed/robots/404 outputs. */
export async function buildPreviewExportManifest({ routeDeps }: {
  routeDeps: RouteManifestDeps & { settingsRepo?: SettingsRepoPort; siteTitleReady?: Promise<void> };
}, _options = {}): Promise<{ manifest: RouteManifest; themeCount: number }> {
  await routeDeps.siteTitleReady;
  const manifest = await buildRouteManifest(routeDeps);
  if (!routeDeps.settingsRepo || !manifest.activeTheme) return { manifest, themeCount: 1 };
  const activeThemeId = manifest.activeTheme.id;
  const config = await readPreviewSwitcher({ ...routeDeps, settingsRepo: routeDeps.settingsRepo, activeThemeId });
  if (!config.enabled) return { manifest, themeCount: 1 };
  const normalPages = manifest.routes.filter(route => isHtmlPage({ route }));
  for (const { themeId } of config.themes) {
    if (themeId === activeThemeId) continue;
    const variant = await buildRouteManifest({ ...routeDeps, resolveActiveThemeId: async () => themeId });
    const pages = new Map([...normalPages, ...variant.routes.filter(route => isHtmlPage({ route }))].map(route => [route.path, route]));
    manifest.routes.push(...[...pages.values()].map(route => ({ ...route, path: previewThemePath({ themeId, activeThemeId, path: route.path }) })));
  }
  return { manifest, themeCount: config.themes.length };
}
