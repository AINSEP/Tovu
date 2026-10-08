/**
 * @file Public presentation surface from @jini-ai/cms/presentation.
 * Presentation owns workspace theme identity, separate from settings' definitions/value ledger.
 * Host SQLite adapters bind the site's schema; route requirements remain host documentation.
 * active-theme-id.ts supplies one fallback answer shared by live pages, export and preview.
 * The host composition root imports SqlitePresentationSettingsRepo through this barrel;
 * the generic package barrel omits SQLite adapters.
 */
export {
  ALLOWED_THEME_IDS,
  getPresentationSettings,
  setActiveTheme,
  PresentationSettingsNotFoundError,
  PresentationSettingsValidationError,
  type GetPresentationSettingsRequired,
  type PresentationOptional,
  type PresentationSettingsRecord,
  type PresentationSettingsRepoPort,
  type SetActiveThemeDeps,
  type SetActiveThemeRequired,
  type ThemeId,
  InMemoryPresentationSettingsRepo,
} from "@jini-ai/cms/presentation";

export { SqlitePresentationSettingsRepo } from "./repo.sqlite.js";

export { resolveActiveThemeId, type ActiveThemeIdResolutionDeps } from "./active-theme-id.js";
