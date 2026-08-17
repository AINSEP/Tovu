/**
 * @file Public surface (barrel) for `presentation` — re-exported from `@jini-ai/cms/presentation`.
 *
 * The domain moved into the package on 2026-08-03. It is a distinct domain from `settings`
 * (workspace theme identity, not the generic definitions/values/revision-ledger model), and the
 * dependency between them runs one way only — this host's `features/settings/migration.ts` reads
 * `ALLOWED_THEME_IDS` and `PresentationSettingsRepoPort` from here, and nothing in presentation
 * imports settings. That one-way edge is what let the two ship as separate package subpaths.
 *
 * What is left in this directory is only what is genuinely this host's:
 *
 * - `repo.sqlite.ts` — the Drizzle adapter. It names `db/schema.ts`, this repo's shared
 *   1,246-line schema covering every domain, so it is host persistence, not library code.
 * - `INFO.md` / `__specs__/` — this host's requirement documents. They describe the host's routes
 *   and acceptance criteria, not a library contract, so they stay with the host.
 * - `active-theme-id.ts` (2026-08-16) — `resolveActiveThemeId`, moved from `server/routes/site/
 *   pages.ts` as part of the export<->server architecture decoupling (see that file's own header).
 *   Host-specific reuse plumbing (the public-site route, the static exporter, and the admin
 *   template-preview route all need the SAME "what theme id does this workspace have configured"
 *   answer), not a library concern — `getPresentationSettings` already IS the library's answer to
 *   that question; this is only the one shared fallback wrapper around it.
 *
 * The `SqlitePresentationSettingsRepo` re-export below is preserved for the same reason as
 * `workspace`'s: `server/deps.ts` already imports it from this barrel, and that file is a known
 * conflict point across the concurrent extraction branches. The *package* barrel omits it.
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

export { SqlitePresentationSettingsRepo } from "./repo.sqlite";

export { resolveActiveThemeId, type ActiveThemeIdResolutionDeps } from "./active-theme-id";
