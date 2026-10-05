/**
 * @file Local plugin installs (the admin Install Plugin dialog and the assistant's `plugins_install`)
 * are opt-in per server: `TOVU_PLUGIN_LOCAL_INSTALL=1`, read by `sitePluginLocalInstallEnabled` in
 * `apps/website/src/features/plugin-runtime/install.ts`. Owner, 2026-10-05: on for local dev. So
 * `npm run dev` (`dev.mjs`) and `npm run desktop` (`dev-desktop.mjs`) both pass it to the server
 * child. Production (Fly) and the packaged desktop app never run these scripts, so they stay off
 * unless their own environment sets it.
 */

/**
 * The flag a local dev server child gets. An explicit value (shell export or `.env`) always wins,
 * including `0` or an empty string — same precedence as `dev.mjs`'s `TOVU_ENABLE_SITE_SWITCHER`.
 *
 * @param {Readonly<Record<string, string | undefined>>} env - the launching process's environment.
 * @returns {{TOVU_PLUGIN_LOCAL_INSTALL: string}}
 * @complexity O(1).
 */
export function localDevPluginInstallEnv(env) {
  return { TOVU_PLUGIN_LOCAL_INSTALL: env.TOVU_PLUGIN_LOCAL_INSTALL ?? "1" };
}
