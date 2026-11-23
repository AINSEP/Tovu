import { adminFailureChannel } from "../../../lib/admin-failure-channel";
import { WORKSPACE_ID } from "../../../lib/admin-http/config";
import { request } from "../../../lib/admin-http/request";
import type { SitesHomeSetResponse } from "@jini-ai/core/contracts/site/cms-sites";
import type { AdminCreatedSite, AdminCreatedSiteAgentPluginTokens, AdminGeneratedSiteKey, AdminImportedSiteKey, AdminLocalSiteAction, AdminRevealedSiteKey, AdminSiteActivation, AdminSiteKeyStartFreshPreview, AdminSiteKeyStatus, AdminSitesSnapshot, AdminStartedFreshSiteKey, AdminTokenSignInPlugin, SitesUserConfig, SitesUserConfigPatch } from "./sites-api.types";

/** The admin API calls of the sites feature. */
export const sitesApi = {
  // Sites panel (`apps/website/src/server/inbound/admin-http/routes/system/sites.ts`) — list is
  // `system.read`, create/activate are `system.write` AND additionally refused with
  // `SITE_SWITCHING_DISABLED` when the deployment capability flag is off. Same `system.*` split as
  // `getDockerfileSource`/`setDockerfileSource` immediately above.
  /** Every site under `sites/`, plus what this server process is ACTUALLY bound to right now and
   *  any pending activate choice — see {@link AdminSitesSnapshot}. */
  getSitesConfig: () => request<SitesUserConfig>({ path: `/workspaces/${WORKSPACE_ID}/system/sites/config` }),
  setSitesConfig: (input: SitesUserConfigPatch) => request<SitesUserConfig>({ path: `/workspaces/${WORKSPACE_ID}/system/sites/config` }, { init: { method: "PUT", body: JSON.stringify(input) } }),
  setSitesHome: (input: { path: string }) => request<SitesHomeSetResponse<string>>({ path: `/workspaces/${WORKSPACE_ID}/system/sites/home` }, { init: { method: "PUT", body: JSON.stringify(input) } }),
  listSites: () => request<AdminSitesSnapshot>({ path: `/workspaces/${WORKSPACE_ID}/system/sites` }),
  /** Create `sites/<name>/` through the same `initSite` path `tovu init` uses. `409`
   *  `SITE_ALREADY_EXISTS` when the directory is occupied, `400` `VALIDATION_ERROR` for a name
   *  outside `[a-z0-9-]{1,100}`. */
  createSite: (input: { name: string; adminPassword?: string; agentPluginTokens?: Record<string, string> }) =>
    request<{ site: AdminCreatedSite; agentPluginTokens?: AdminCreatedSiteAgentPluginTokens }>({ path: `/workspaces/${WORKSPACE_ID}/system/sites` }, { init: {
      method: "POST",
      body: JSON.stringify(input),
    } }),
  /** Installed Agent Plugins that take a pasted access token — the create form's optional
   *  "connect now" fields. A given token is checked, then applied on the new site's first start. */
  listTokenSignInPlugins: () =>
    request<{ plugins: AdminTokenSignInPlugin[] }>({ path: `/workspaces/${WORKSPACE_ID}/system/sites/token-sign-in-plugins` }),
  /** Persist `name` as the site the NEXT boot serves. Writes `TOVU_SITE=<name>` to the repo-root
   *  `.env` and returns restart instructions — it does not kill, signal, or re-exec anything, and
   *  this process keeps serving whatever it booted with. See {@link AdminSiteActivation}. */
  activateSite: ({ name }: { name: string }, _optional: Record<string, never> = {}) =>
    request<AdminSiteActivation>(
      { path: `/workspaces/${WORKSPACE_ID}/system/sites/${encodeURIComponent(name)}/activate` },
      { init: { method: "POST" } }
    ),
  manageLocalSite: (input: { name: string; action: AdminLocalSiteAction; confirmed?: boolean; checked?: boolean }) => {
    const name = encodeURIComponent(input.name);
    if (input.action === "switch") return request<AdminSiteActivation>(
      { path: `/workspaces/${WORKSPACE_ID}/system/sites/${name}/activate` }, { init: { method: "POST", body: JSON.stringify({ restartNow: true }) }, onOk: () => adminFailureChannel.reset() });
    const path = input.action === "restore" || input.action === "delete"
      ? `trash/${name}/${input.action}` : `${name}/${input.action}`;
    return request<unknown>({ path: `/workspaces/${WORKSPACE_ID}/system/sites/${path}` }, { init: {
      method: "POST", body: JSON.stringify({ confirmed: input.confirmed, checked: input.checked }),
    } });
  },

  // Secrets panel → site key tab (`src/server/inbound/admin-http/routes/system/site-key.ts`)
  // — status of the TOVU_SITE_KEY site key's generated-file fallback, an explicit
  // reveal action, and a create-only generate action. `admin.security.site-key.manage`-gated
  // server-side on every one of the three calls below. See that route file's own header for the
  // 2026-09-09 durability fix (a generated key file now genuinely protects every stored credential
  // in production too, with one disclosed gap: webhook signing/newsletter tokens still need the
  // env var there) and for the accepted security tradeoff of a key file living beside the
  // database it protects.
  /** Never throws for "no key active" — that is `{active: false, source: "none"}`, a normal 200,
   *  not an error. Never carries the key value — see `revealSiteKey` for that. */
  getSiteKeyStatus: () => request<AdminSiteKeyStatus>({ path: `/workspaces/${WORKSPACE_ID}/system/site-key` }),
  /** Returns the raw key value (whichever source is active) when one is set — a deliberate,
   *  explicit, separately-clickable action, never fired on page load. Superseded an earlier
   *  fingerprint-only brief (owner: "i want that token to be visible to admins or else when it
   *  breaks they have no idea whats going on"). No audit trail — this codebase has no
   *  general-purpose sensitive-read audit mechanism to hook into (checked; not built here). */
  revealSiteKey: () =>
    request<AdminRevealedSiteKey>({ path: `/workspaces/${WORKSPACE_ID}/system/site-key/reveal` }, { init: { method: "POST" } }),
  /** Makes sure this site has the RIGHT key, never a second one (2026-09-29): resolves `200`
   *  `already-active`/`recovered` or `201` `created` ({@link AdminSiteKeyGenerateOutcome}).
   *  Refusals are `409 {error, detail}`, nothing written, thrown as an `ApiError` whose `.message`
   *  is the code and whose `.body.detail` is a plain-words sentence: `KEY_DEPENDENT_DATA` (saved
   *  credentials need a key that is not here), `KEY_MISMATCH` (the key here is not the one they
   *  were locked with), `KEY_INVALID` (a key is set but malformed), `SITE_META_UNREADABLE`, and in
   *  production `ALREADY_EXISTS` (a key file appeared mid-request). See `use-site-key.hooks.ts`'s
   *  `classifySiteKeyGenerateError`. Never overwrites or rotates a key. */
  generateSiteKey: () =>
    request<AdminGeneratedSiteKey>({ path: `/workspaces/${WORKSPACE_ID}/system/site-key/generate` }, { init: { method: "POST" } }),
  /** "Paste your old token": installs `token` only once it opens this site's saved credentials,
   *  moving anything saved under the key in place onto it first. Refusals throw an `ApiError` with
   *  a plain `.body.detail`: `TOKEN_INVALID` (400), `TOKEN_DOES_NOT_OPEN`, `ENV_KEY_SET`,
   *  `RESTORE_POINT_UNAVAILABLE`, `SITE_META_UNREADABLE` (409). */
  importSiteKey: (input: { siteKey: string }, _optional = {}) =>
    request<AdminImportedSiteKey>({ path: `/workspaces/${WORKSPACE_ID}/system/site-key/import` }, { init: { method: "POST", body: JSON.stringify(input) } }),
  /** What "Start fresh" would remove and which webhooks get a new signing secret. Changes nothing. */
  previewSiteKeyStartFresh: () =>
    request<AdminSiteKeyStartFreshPreview>({ path: `/workspaces/${WORKSPACE_ID}/system/site-key/start-fresh` }),
  /** "Start fresh": restore point, remove what can't be unlocked, install the key. `confirm` must be
   *  `START FRESH` (else 400 `CONFIRMATION_REQUIRED`); other refusals as {@link importSiteKey}'s
   *  plus `STORAGE_SECRET_LOCKED`. */
  startFreshSiteKey: ({ confirm }: { confirm: string }, _optional: Record<string, never> = {}) =>
    request<AdminStartedFreshSiteKey>({ path: `/workspaces/${WORKSPACE_ID}/system/site-key/start-fresh` }, { init: { method: "POST", body: JSON.stringify({ confirm }) } }),
};
