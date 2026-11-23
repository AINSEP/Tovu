import type { rename as renameDirectory } from "node:fs/promises";
import { createThemeTrashAdapter, type ThemeTrashPorts } from "@jini-ai/cms/themes/files/trash";
import type { TrashAdapter } from "@jini-ai/cms/trash";
import { createDirectoryTrashAdapter } from "@jini-ai/cms/trash/adapters/directory";
import { THEME_ENTITY_TYPE } from "@jini-ai/cms/trash/site/adapters/theme";
import { requestThemePreviewRefresh } from "@jini-ai/cms/themes/preview/refresh";
import { isReservedThemePreviewPath } from "./preview-policy.js";
import { findTheme, rescanThemes } from "./theme-discovery.js";
import type { DiscoveredTheme } from "./theme.js";

/** Raised when a theme id cannot be addressed as a folder of the site's own themes directory. */
export class ThemeTrashLocationError extends Error {
  constructor({ message }: { message: string }) {
    super(message);
    this.name = "ThemeTrashLocationError";
  }
}

export function themeTrashLocationError(
  { themeId, reason }: Parameters<ThemeTrashPorts["locationError"]>[0],
  _optional = {}
): ThemeTrashLocationError {
  return new ThemeTrashLocationError({ message: reason === "invalid-segment"
    ? `'${themeId}' is not a theme folder name`
    : `theme '${themeId}' is not a folder of this site's themes directory, so it cannot be moved to the Trash` });
}

export function bindThemeTrashAdapter(
  { themes, themesDir }: { themes: DiscoveredTheme[]; themesDir: string },
  { rename }: { readonly rename?: typeof renameDirectory } = {}
): TrashAdapter {
  return createThemeTrashAdapter({ themesDir, ports: {
    findTheme: ({ themeId }) => {
      const theme = findTheme({ themes: [...themes], id: themeId });
      return theme ? { dir: theme.dir, tier: theme.manifest.tier } : undefined;
    },
    locationError: themeTrashLocationError,
    createDirectoryAdapter: ({ locate }) => createDirectoryTrashAdapter({ entityType: THEME_ENTITY_TYPE, locate }, { rename }),
    refresh: async () => {
      rescanThemes({ themes, dir: themesDir });
      requestThemePreviewRefresh({ themesDir, isReservedPath: isReservedThemePreviewPath });
    },
  } });
}
