import { checkSourceDirContainment, loadTheme } from "#src/features/theme/catalog";
import type { ThemePlacementChecks } from "#src/features/site-backup/import-restore-placement";

/**
 * @file The one host binding of the theme owner's checks that backup import placement reuses
 * (`sourceDir` containment and the theme loader), shared by staging, restore and the held-back
 * theme re-check so all three judge a theme tree the same way.
 */
export const THEME_PLACEMENT_CHECKS: ThemePlacementChecks = { checkSourceDirContainment, loadTheme };
