import { isReservedThemePreviewPath } from "./preview-policy.js";
import { requestThemePreviewRefresh } from "@jini-ai/cms/themes/preview/refresh";
import { syncThemeRoster } from "@jini-ai/cms/themes/preview/roster";
import { themeRosterPorts } from "./theme-roster-ports.js";
import type { DiscoveredTheme } from "./theme.js";

/** Refresh loaded source maps as well as roster membership; nested edits evade the fingerprint. */
export function refreshWatchedThemes(
  required: { themes: DiscoveredTheme[]; themesDir: string },
  _optional = {}
): void {
  syncThemeRoster({ ...required, ...themeRosterPorts }, { force: true });
  requestThemePreviewRefresh({ themesDir: required.themesDir, isReservedPath: isReservedThemePreviewPath });
}

export function reportThemeWatchError({ error }: { error: unknown }, _optional = {}): void {
  console.error("[theme-watcher] theme refresh failed", error);
}
