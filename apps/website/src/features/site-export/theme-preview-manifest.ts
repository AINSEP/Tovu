import type { SettingsRepoPort } from "@jini-ai/core/settings";
import { readPreviewSwitcher } from "#src/features/theme/preview-switcher";
import { previewThemePath } from "#src/features/theme/preview-switcher-html";
import { buildRouteManifest, type RouteManifestDeps } from "./route-manifest.js";
import type { RouteManifest } from "@jini-ai/devops/static-export/site/ports";
import { buildPreviewExportManifest as buildWithPorts, type PreviewExportManifestPorts } from "@jini-ai/devops/static-export/site/theme-preview-manifest";

type PreviewRouteDeps = RouteManifestDeps & {
  settingsRepo?: SettingsRepoPort;
  siteTitleReady?: Promise<void>;
};

const ports: PreviewExportManifestPorts<PreviewRouteDeps> = {
  buildManifest: ({ routeDeps, themeId }) =>
    buildRouteManifest(themeId === undefined
      ? routeDeps
      : { ...routeDeps, resolveActiveThemeId: async () => themeId }),
  readPreviewConfig: async ({ routeDeps, activeThemeId }) =>
    routeDeps.settingsRepo
      ? readPreviewSwitcher({ ...routeDeps, settingsRepo: routeDeps.settingsRepo, activeThemeId })
      : null,
  previewThemePath,
};

export async function buildPreviewExportManifest({ routeDeps }: {
  routeDeps: RouteManifestDeps & { settingsRepo?: SettingsRepoPort; siteTitleReady?: Promise<void> };
}, options: { includeThemePreviews?: boolean } = {}): Promise<{ manifest: RouteManifest; themeCount: number }> {
  return buildWithPorts({ routeDeps, ports }, options);
}
