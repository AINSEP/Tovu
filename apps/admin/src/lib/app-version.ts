/**
 * @file Build-time version string for the About tab (`features/settings/SettingsUi.tsx`).
 *
 * Sourced from `apps/admin/package.json` via `vite.config.ts`'s `define` (see
 * `__TOVU_ADMIN_VERSION__` in `vite-env.d.ts`), not a server endpoint: Tovu
 * has no `/api/*` route that reports an app/build version, and adding one is
 * server-side work outside this agent's `apps/admin/**` scope (see that
 * file's own comment for the check). This is honestly the *admin bundle's*
 * own version, not a full-stack server version — the constant is named and
 * labelled accordingly rather than implying more than it is.
 */
export const TOVU_ADMIN_VERSION = __TOVU_ADMIN_VERSION__;

/** The installed `@jini-ai/core` version, reported in every "Copy details" block. */
export const JINI_CORE_VERSION = __JINI_CORE_VERSION__;
