import { registerSitePreviewRoutes, servingAddressOf, sitePreviewTargets } from "../sites/site-previews.js";
import { sitePreviewServiceForHost } from "#src/server/runtime/lifecycle/site-preview-host";
import type { SitePreviewService } from "#src/features/sites/index";
import type { Express, Response } from "express";

import {
  type createSite as createSiteReal,
  includeServingSite,
  listSites as listSitesReal,
  listSitesForBinding,
  switcherBaseForBinding,
  type persistActiveSite as persistActiveSiteReal,
  readPersistedActiveSite as readPersistedActiveSiteReal,
  type ServingSiteListEntry,
  type SiteListEntry,
  isSiteSwitcherEnabled as isSiteSwitcherEnabledReal,
} from "#src/platform/site-dir/index";
import { devRestartPortFromEnv, type DevRestartPort } from "#src/platform/dev-supervisor/index";
import { listNewSiteAgentPluginTokenSignInPlugins } from "#src/features/agent-plugins/new-site-agent-plugin-tokens";
import {
  activateSite,
  createSiteForOwner,
  resolveSiteSwitchBase,
  type SiteAdminRefusal,
  type SiteAdminRefusalCode,
} from "#src/features/sites/index";
import type {
  checkAgentPluginAccessToken as checkAgentPluginAccessTokenReal,
  listTokenSignInPlugins as listTokenSignInPluginsReal,
} from "#src/features/agent-plugins/token-sign-in";
import { sealPendingAgentPluginTokensForNewSite as sealPendingAgentPluginTokensReal } from "#src/server/runtime/composition/pending-agent-plugin-tokens";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Admin "Sites" screen backend (2026-09-04 sites-switcher decision,
 * `ADS-memory/reports/2026-09-04-sites-switcher-decision.md`) — lets a developer running Tovu
 * locally see the sites under `sites/<name>/`, create a new one, and activate one to switch
 * themes/pages/posts/database without the desktop app (Tovu-Runner already does this natively).
 *
 * Three routes, `system.read`/`system.write`-gated like every sibling in this directory
 * (`deployment-overview.ts`, `assistant-daemon.ts`) — reusing those two existing permissions
 * rather than inventing a third, since Create/Activate are exactly the kind of system-process-
 * affecting write `assistant-daemon.ts`'s restart route already gates on `system.write`, and List
 * is exactly the kind of read-only operational snapshot `deployment-overview.ts` gates on
 * `system.read`.
 *
 * `GET .../system/sites` — List. NOT gated on the capability flag (see `site-switcher-enabled.ts`):
 * touches no boot binding, so there is no risk in always answering it; its response CARRIES the
 * flag's value (`switchingEnabled`) so the UI can decide whether to render the "Sites" nav item, a
 * disabled Create button, etc. without a second round trip.
 *
 * List's response also carries the two facts a UI needs to avoid CLAIMING A SWITCH THAT HAS NOT
 * HAPPENED (2026-09-05, admin Sites screen). Neither is derivable from `sites[]`:
 *
 * - `currentSite` — what this process is bound to RIGHT NOW, read from `deps.siteBinding`
 *   (`RouteDeps.siteBinding`, resolved ONCE by the composition root at boot — 2026-09-06, replacing
 *   a per-request `describeSiteBinding()` call that silently disagreed with the real served site
 *   whenever `tovu serve <dir>` resolved it from an explicit install-dir argument instead of
 *   `{cwd, env}`; see that field's own doc), plus `listed`: whether that directory is a REGISTERED
 *   site, i.e. one `tovu serve` would accept. It legitimately may not be — `listSites` skips any
 *   directory without a valid `.site-meta.json` commit marker, and this repo's own live
 *   `sites/tovu-dev` carries neither marker file, so it was being served while `listSites` returned
 *   nothing and the screen rendered "All sites 0" (2026-09-05).
 *   `currentSite.dirOverridden` reports the `TOVU_SITE_DIR` precedence trap — see {@link
 *   SiteBinding.dirOverridden}: with it set, an activate is inert and the UI must say so.
 *   `currentSite.switcherCompatible` (`false` only for an install-dir boot) is what Create/Activate
 *   below actually gate on — see {@link SiteBinding.switcherCompatible} and
 *   `sendSiteBindingNotSwitchable`.
 * - `persistedSiteName` — the pending `TOVU_SITE` choice a previous activate left in `.env`
 *   (`readPersistedActiveSite`), so "serving A, B queued for the next restart" survives a page
 *   reload rather than living only in the activate response the reload threw away.
 *
 * Every read and write here (List's `sites[]`/`persistedSiteName`, Create's target, Activate's
 * lookup and `.env` write) is rooted at `deps.siteBinding` through `switcherBaseForBinding` — never
 * at `process.cwd()`, which once listed, created and activated in whatever tree the process was
 * standing in. An install-dir boot has no switcher tree: List shows only the served site and
 * `persistedSiteName: null`.
 *
 * `sites[]` is therefore `includeServingSite`'s composition, not `listSites`'s raw output: the
 * served directory always has a row, and every row carries `registration`. `registration:
 * "unregistered"` is the served-but-not-a-real-site case, and it is what lets one card say both
 * "this is active" and "`tovu serve` would refuse this folder" instead of the screen having to
 * choose. `listed` keeps its ORIGINAL meaning under that change — it is now read off the served
 * row's own `registration` rather than from row presence, which is the same predicate as before
 * (a row is `registered` exactly when `listSites` produced it) but stays correct now that presence
 * alone no longer implies it.
 *
 * Create and Activate are thin callers (2026-10-05): the logic lives in `features/sites/site-admin.ts`
 * (`resolveSiteSwitchBase`, `createSiteForOwner`, `activateSite`), the SAME functions the assistant's
 * `sites_create_site` / `sites_switch_site` tools call. This file only authorizes and maps refusals to
 * HTTP statuses.
 *
 * `POST .../system/sites` — Create. Refuses `SITE_SWITCHING_DISABLED` when the flag is off,
 * checked BEFORE `authorize()` (a deployment-wide gate, independent of the caller's own
 * permissions — no reason to spend an authorize() call on an operation that will be refused
 * either way). Delegates to `site-registry.ts`'s `createSite`, itself a thin wrapper over the SAME
 * `initSite` `tovu init` calls — so a site created here and one created by the CLI are identical.
 *
 * `GET .../system/sites/:name/preview` (2026-10-08) — a card's screenshot (`../sites/site-previews.ts`).
 * List carries `previewVersions` (`{ [name]: mtime }`) and enqueues due captures without waiting
 * on them; only with local site management on, so a production deployment never launches Chromium.
 *
 * `POST .../system/sites/:name/activate` — Activate. Same flag gate as Create. Persists the
 * choice (`active-site.ts`'s `persistActiveSite`) and returns explicit restart instructions —
 * it does NOT kill, signal, or re-exec any process (standing rule: no admin API terminates the
 * server on a click). The response's `restartRequired`/`restartInstructions` fields exist so the
 * UI never has to hardcode that prose itself.
 *
 * `GET .../system/sites/token-sign-in-plugins` (2026-09-29) — the BUNDLED Agent Plugins (what the new
 * site's first boot seeds, not this site's installs) that take a pasted access token (`tovuTokenAuth`),
 * so the create form can offer "connect it now". Create also
 * takes an optional `agentPluginTokens: { [pluginId]: token }`: each is checked against the plugin's
 * probe URL first (a rejected one refuses the create, nothing made), then sealed with the NEW site's
 * key into its folder and applied on that site's first boot
 * (`composition/pending-agent-plugin-tokens.ts`). Leaving it out creates the site exactly as before.
 */
export type AdminSitesDeps = Pick<RouteDeps, "workspaceId" | "authorize" | "siteBinding"> & {
  /** Card preview captures (`site-preview-host.ts`); a test injects a fake, `null` turns them off. */
  sitePreviews?: SitePreviewService | null;
  /** The guarded outbound client a token check probes through. Absent, a given token is refused as
   *  not checkable rather than saved unchecked. */
  customCredentialsHttpClient?: RouteDeps["customCredentialsHttpClient"];
  checkAgentPluginAccessToken?: typeof checkAgentPluginAccessTokenReal;
  sealPendingAgentPluginTokens?: typeof sealPendingAgentPluginTokensReal;
  listTokenSignInPlugins?: typeof listTokenSignInPluginsReal;
  /** Injectable so a route test proves both branches without touching the real filesystem or
   *  `sites/`. Each defaults to the real `site-dir`/`site-switcher-enabled` implementation. */
  listSites?: (optional?: Parameters<typeof listSitesReal>[0]) => readonly SiteListEntry[];
  createSite?: typeof createSiteReal;
  persistActiveSite?: typeof persistActiveSiteReal;
  isSiteSwitcherEnabled?: typeof isSiteSwitcherEnabledReal;
  readPersistedActiveSite?: typeof readPersistedActiveSiteReal;
  /** The `npm run dev` restart channel for Activate's `restartNow`. Defaults to
   *  `devRestartPortFromEnv()` (`null` outside `dev.mjs`); a test passes a fake or `null`. */
  devRestart?: DevRestartPort | null;
};

/** HTTP status for each refusal code the shared feature functions return. 403 for the
 *  deployment-wide flag; 409 for the per-boot binding fact and an occupied name (see
 *  `features/sites/site-admin.ts` for why the binding is 409, not 403). */
const REFUSAL_STATUS: Record<SiteAdminRefusalCode, number> = {
  SITE_SWITCHING_DISABLED: 403,
  SITE_BINDING_NOT_SWITCHABLE: 409,
  VALIDATION_ERROR: 400,
  SITE_ALREADY_EXISTS: 409,
  SITE_NOT_FOUND: 404,
  AGENT_PLUGIN_TOKEN_INVALID: 400,
  AGENT_PLUGIN_TOKEN_UNSUPPORTED: 400,
};

/** Sends a refusal as the `{error, code}` body every mutating route below shares (plus `pluginId`
 *  for a refused access token). */
function sendRefusal(res: Response, refusal: SiteAdminRefusal): void {
  const { ok: _ok, ...body } = refusal;
  res.status(REFUSAL_STATUS[refusal.code]).json(body);
}

/** Extracts and validates the create-site request's `name` field. Returns the string on success,
 *  or the refusal the route should send verbatim, so the create handler's own branching stays at
 *  "is this valid or not" rather than re-deriving the wire format inline.
 *  @complexity O(1) time/space; cyclomatic 3, cognitive 2. */
function parseCreateSiteName(body: unknown): { ok: true; name: string } | SiteAdminRefusal {
  const record = body as Record<string, unknown> | null | undefined;
  const name = typeof record?.name === "string" ? record.name : undefined;
  if (name === undefined) {
    return { ok: false, error: "'name' (string) is required", code: "VALIDATION_ERROR" };
  }
  return { ok: true, name };
}

export function registerAdminSitesRoutes(app: Express, deps: AdminSitesDeps): void {
  const listSites = deps.listSites ?? listSitesReal;
  const isSiteSwitcherEnabled = deps.isSiteSwitcherEnabled ?? isSiteSwitcherEnabledReal;
  const readPersistedActiveSite = deps.readPersistedActiveSite ?? readPersistedActiveSiteReal;
  const sitePreviews = deps.sitePreviews === undefined ? sitePreviewServiceForHost({ binding: deps.siteBinding }) : deps.sitePreviews ?? undefined;
  registerSitePreviewRoutes({ app, deps: { workspaceId: deps.workspaceId, authorize: deps.authorize, sitePreviews } });

  app.get("/api/admin/v1/workspaces/:workspaceId/system/sites", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const authorized = await authorizeOrRespond(res, deps.authorize, {
        principalId: principal.id,
        permission: "system.read",
        workspaceId: deps.workspaceId,
        entityType: "site-registry",
      });
      if (!authorized) return;

      // Every read below is rooted at the SERVED binding, never `process.cwd()` — see
      // `switcherBaseForBinding`'s own doc for the wrong-tree bug the cwd default caused.
      const binding = deps.siteBinding;
      const registered: readonly SiteListEntry[] = listSitesForBinding({ binding }, { listSites });
      const switcherBase = switcherBaseForBinding(binding);
      const sites: ServingSiteListEntry[] = includeServingSite({ sites: registered, binding });
      const serving = sites.find((site) => site.dir === binding.dir);
      // Reads capture mtimes and only ENQUEUES due captures — never awaited here (see the service).
      const previewVersions = sitePreviews && isSiteSwitcherEnabled()
        ? sitePreviews.versions({ sites, targets: sitePreviewTargets({ servingName: binding.name, localSites: [] }, { serving: servingAddressOf({ req }) }) })
        : {};
      res.status(200).json({
        switchingEnabled: isSiteSwitcherEnabled(),
        sites,
        previewVersions,
        currentSite: { ...binding, listed: serving?.registration === "registered" },
        // An install-dir boot has no switcher `.env`: whatever sits in the cwd's belongs to another tree.
        persistedSiteName: switcherBase === null ? null : readPersistedActiveSite({ cwd: switcherBase }),
      });
    } catch (err) {
      console.error("[system/sites] unexpected error listing sites", err);
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });

  app.get("/api/admin/v1/workspaces/:workspaceId/system/sites/token-sign-in-plugins", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }
    try {
      const principal = getAuthedPrincipal(res);
      const authorized = await authorizeOrRespond(res, deps.authorize, {
        principalId: principal.id,
        permission: "system.read",
        workspaceId: deps.workspaceId,
        entityType: "site-registry",
      });
      if (!authorized) return;
      const plugins = await (deps.listTokenSignInPlugins ?? (() => listNewSiteAgentPluginTokenSignInPlugins()))(deps.workspaceId);
      res.status(200).json({ plugins });
    } catch (err) {
      console.error("[system/sites] unexpected error listing token sign-in plugins", err);
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });

  app.post("/api/admin/v1/workspaces/:workspaceId/system/sites", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }
    // The flag, then the binding — both checked before spending an authorize() call on an
    // operation this boot cannot fulfill regardless of who is asking (see `resolveSiteSwitchBase`).
    const gate = resolveSiteSwitchBase({ binding: deps.siteBinding, switchingEnabled: isSiteSwitcherEnabled() });
    if (!gate.ok) {
      sendRefusal(res, gate);
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const authorized = await authorizeOrRespond(res, deps.authorize, {
        principalId: principal.id,
        permission: "system.write",
        workspaceId: deps.workspaceId,
        entityType: "site-registry",
      });
      if (!authorized) return;

      const parsed = parseCreateSiteName(req.body);
      if (!parsed.ok) {
        sendRefusal(res, parsed);
        return;
      }

      const created = await createSiteForOwner(
        {
          workspaceId: deps.workspaceId,
          switcherBase: gate.switcherBase,
          name: parsed.name,
          agentPluginTokens: (req.body as Record<string, unknown> | null | undefined)?.agentPluginTokens,
        },
        {
          createSite: deps.createSite,
          customCredentialsHttpClient: deps.customCredentialsHttpClient,
          checkAgentPluginAccessToken: deps.checkAgentPluginAccessToken,
          sealPendingAgentPluginTokens: deps.sealPendingAgentPluginTokens ?? sealPendingAgentPluginTokensReal,
        },
      );
      if (!created.ok) {
        sendRefusal(res, created);
        return;
      }
      res.status(201).json({ site: created.site, agentPluginTokens: created.agentPluginTokens });
    } catch (err) {
      console.error("[system/sites] unexpected error creating a site", err);
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });

  app.post("/api/admin/v1/workspaces/:workspaceId/system/sites/:name/activate", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }
    // See the Create route's identical gate: the served tree's base, never `process.cwd()`.
    const gate = resolveSiteSwitchBase({ binding: deps.siteBinding, switchingEnabled: isSiteSwitcherEnabled() });
    if (!gate.ok) {
      sendRefusal(res, gate);
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const authorized = await authorizeOrRespond(res, deps.authorize, {
        principalId: principal.id,
        permission: "system.write",
        workspaceId: deps.workspaceId,
        entityType: "site-registry",
      });
      if (!authorized) return;

      // `restartNow: true` (2026-10-05, OD-S1) asks the `npm run dev` supervisor to restart onto the
      // new site; without it, Activate behaves exactly as before (persist + instructions).
      const restartNow = (req.body as Record<string, unknown> | null | undefined)?.restartNow === true;
      const activated = activateSite(
        { switcherBase: gate.switcherBase, name: String(req.params.name ?? ""), restartNow, dirOverridden: deps.siteBinding.dirOverridden },
        { listSites, persistActiveSite: deps.persistActiveSite, devRestart: deps.devRestart === undefined ? devRestartPortFromEnv() : deps.devRestart },
      );
      if (!activated.ok) {
        sendRefusal(res, activated);
        return;
      }
      res.status(200).json(activated);
    } catch (err) {
      console.error("[system/sites] unexpected error activating a site", err);
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
}
