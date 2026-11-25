/**
 * Binds the theme owner's write policy and the media Library saver into the asset tools' host port
 * (files_copy, image_transform), so those features never import theme or media implementations.
 */
import type { AssetHostPort, AssetToolDeps } from "#src/features/asset-transfer/asset-destinations";
import { assertThemeFileWritable, findThemeOrThrow, isShapeRejection, reloadThemeInPlace, resolveThemeFilePath, sniffThemeImportType, THEME_WRITE_PERMISSION, writeThemeBinaryFile, type ThemeToolDeps } from "#src/features/theme/asset-operations";
import type { DiscoveredTheme } from "#src/features/theme/theme";
import { saveLibraryDocument } from "#src/features/media/index";

/** What the host binding reads: the asset tools' own deps plus the theme roster they write into. */
export type AssetHostDeps = Omit<AssetToolDeps, "resolveImportedMediaUrls" | "assetHost"> & ThemeToolDeps;

/** One asset-tool call's host port over `deps`. @complexity O(1) binding; each method as its owner. */
export function bindAssetHost(deps: AssetHostDeps, _optional = {}): AssetHostPort<DiscoveredTheme> {
  return {
    themeWritePermission: THEME_WRITE_PERMISSION,
    findTheme: ({ themeId }) => findThemeOrThrow({ routeDeps: deps, themeId }),
    checkThemeWrite: ({ theme, relativePath }) => {
      assertThemeFileWritable({ theme, relativePath });
      resolveThemeFilePath({ themeDir: theme.dir, themesRoot: deps.themesDir, relativePath });
    },
    writeThemeFile: ({ theme, relativePath, bytes }) => writeThemeBinaryFile({ themeDir: theme.dir, themesRoot: deps.themesDir, relativePath, bytes }),
    reloadTheme: ({ theme, themeId }) => reloadThemeInPlace({ routeDeps: deps, theme, themeId }),
    sniffThemeImportType: ({ bytes }) => sniffThemeImportType({ bytes }),
    isThemeShapeRejection: ({ error }) => isShapeRejection({ error }),
    saveLibraryDocument: (required, optional) => saveLibraryDocument({ deps, ...required }, optional),
  };
}
