import type { Express, Response } from "express";

import {
  createSite as createSiteReal,
  includeServingSite,
  listSites as listSitesReal,
  persistActiveSite as persistActiveSiteReal,
  readPersistedActiveSite as readPersistedActiveSiteReal,
  InitDirNotEmptyError,
  ValidationError,
  type ServingSiteListEntry,
  type SiteListEntry,
  isSiteSwitcherEnabled as isSiteSwitcherEnabledReal,
} from "#src/platform/site-dir/index";
import {
  bundledAgentPluginsSourceRoot,
  firstNewSiteTokenRefusal,
  listNewSiteTokenSignInPlugins,
  parseNewSiteAgentPluginTokens,
  resolveBundledAgentPlugin,
} from "#src/features/agent-plugins/new-site-tokens";
import {
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
 * `sites[]` is therefore `includeServingSite`'s composition, not `listSites`'s raw output: the
 * served directory always has a row, and every row carries `registration`. `registration:
 * "unregistered"` is the served-but-not-a-real-site case, and it is what lets one card say both
 * "this is active" and "`tovu serve` would refuse this folder" instead of the screen having to
 * choose. `listed` keeps its ORIGINAL meaning under that change — it is now read off the served
 * row's own `registration` rather than from row presence, which is the same predicate as before
 * (a row is `registered` exactly when `listSites` produced it) but stays correct now that presence
 * alone no longer implies it.
 *
 * `POST .../system/sites` — Create. Refuses `SITE_SWITCHING_DISABLED` when the flag is off,
 * checked BEFORE `authorize()` (a deployment-wide gate, independent of the caller's own
 * permissions — no reason to spend an authorize() call on an operation that will be refused
 * either way). Delegates to `site-registry.ts`'s `createSite`, itself a thin wrapper over the SAME
 * `initSite` `tovu init` calls — so a site created here and one created by the CLI are identical.
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
};

/** The exact prose the UI should render after a successful Activate — one source of truth so a
 *  future wording change lands in one place, not wherever a caller happened to hardcode it. */
const RESTART_INSTRUCTIONS =
  "Restart the dev server for this to take effect: stop `npm run dev` (Ctrl-C, or SIGTERM the " +
  "dev.mjs process — never a child PID) and start it again.";

/** Standard `{error, code}` body for the one refusal every mutating route below shares. */
function sendSiteSwitchingDisabled(res: Response): void {
  res.status(403).json({
    error: "site switching is disabled on this deployment",
    code: "SITE_SWITCHING_DISABLED",
  });
}

/**
 * The refusal for a boot whose `siteBinding.switcherCompatible` is `false` (2026-09-06,
 * composition-root fix) — an install-dir boot (`tovu serve <dir>`) has no `{cwd, env}`-relative
 * `sites/` tree to Create into or Activate against; `process.cwd()` could be any directory an
 * operator happened to be standing in. 409, not 403: this is a per-boot structural fact about which
 * `sites/` root exists, not a permissions or deployment-flag refusal (those two already use 403).
 */
function sendSiteBindingNotSwitchable(res: Response): void {
  res.status(409).json({
    error:
      "this server was started against a specific site directory (tovu serve <dir>) with no related sites/ folder to manage — Create/Activate are unavailable",
    code: "SITE_BINDING_NOT_SWITCHABLE",
  });
}

/** Shape of the 400 body every "bad request" refusal below returns. */
type ValidationErrorBody = { error: string; code: "VALIDATION_ERROR" };

/** Extracts and validates the create-site request's `name` field. Returns the string on success,
 *  or the exact 400 body the route should send verbatim, so the create handler's own branching
 *  stays at "is this valid or not" rather than re-deriving the wire format inline.
 *  @complexity O(1) time/space; cyclomatic 3, cognitive 2. */
function parseCreateSiteName(
  body: unknown,
): { ok: true; name: string } | { ok: false; body: ValidationErrorBody } {
  const record = body as Record<string, unknown> | null | undefined;
  const name = typeof record?.name === "string" ? record.name : undefined;
  if (name === undefined) {
    return { ok: false, body: { error: "'name' (string) is required", code: "VALIDATION_ERROR" } };
  }
  return { ok: true, name };
}

/** The create body's optional `agentPluginTokens` (`new-site-tokens.ts`, shared with `tovu init`). */
function parseAgentPluginTokens(body: unknown): { ok: true; tokens: Record<string, string> } | { ok: false; body: ValidationErrorBody } {
  const parsed = parseNewSiteAgentPluginTokens((body as Record<string, unknown> | null | undefined)?.agentPluginTokens);
  return parsed.ok ? parsed : { ok: false, body: { error: parsed.error, code: "VALIDATION_ERROR" } };
}

/** The refusal for a token that failed its check, or `null` when every token may be stored. No
 *  guarded HTTP client in these deps means no check can run: every token is then `unsupported`. */
async function checkTokensBeforeCreate(
  deps: AdminSitesDeps,
  tokens: Readonly<Record<string, string>>,
): Promise<{ status: number; body: Record<string, unknown> } | null> {
  const check = deps.checkAgentPluginAccessToken ?? checkAgentPluginAccessTokenReal;
  const httpClient = deps.customCredentialsHttpClient;
  const resolveInstalledPlugin = resolveBundledAgentPlugin(bundledAgentPluginsSourceRoot());
  const refusal = await firstNewSiteTokenRefusal(
    // Checked against the bundled plugin the NEW site's first boot seeds, not this site's install.
    async (input) => (httpClient ? check({ workspaceId: deps.workspaceId, httpClient, resolveInstalledPlugin }, input) : "unsupported"),
    tokens,
  );
  return refusal ? { status: 400, body: refusal } : null;
}

/** Seals the checked tokens into the new site. The site already exists, so a failure here is
 *  reported, not thrown: the person connects from chat instead. */
async function storeTokensForNewSite(
  deps: AdminSitesDeps,
  site: { dir: string; siteId: string },
  tokens: Readonly<Record<string, string>>,
): Promise<{ status: "none" | "saved" | "failed"; pluginIds: string[] }> {
  const pluginIds = Object.keys(tokens);
  if (pluginIds.length === 0) return { status: "none", pluginIds };
  try {
    await (deps.sealPendingAgentPluginTokens ?? sealPendingAgentPluginTokensReal)({ siteDir: site.dir, siteKeyId: site.siteId, tokens });
    return { status: "saved", pluginIds };
  } catch (err) {
    console.error(`[system/sites] the new site's access tokens could not be stored: ${err instanceof Error ? err.message : String(err)}`);
    return { status: "failed", pluginIds };
  }
}

/** Classifies a thrown `createSite()` error into its HTTP status + body, or `null` for anything
 *  unclassified that should fall through to a generic 500. Keeps the error-to-status-code mapping
 *  in one place so a future site-registry error type has exactly one spot to be taught about.
 *  @complexity O(1) time/space; cyclomatic 3, cognitive 2. */
function classifyCreateSiteError(err: unknown): { status: number; body: Record<string, unknown> } | null {
  if (err instanceof ValidationError) {
    return { status: 400, body: { error: err.message, code: "VALIDATION_ERROR" } };
  }
  if (err instanceof InitDirNotEmptyError) {
    return { status: 409, body: { error: err.message, code: "SITE_ALREADY_EXISTS" } };
  }
  return null;
}

export function registerAdminSitesRoutes(app: Express, deps: AdminSitesDeps): void {
  const listSites = deps.listSites ?? listSitesReal;
  const createSite = deps.createSite ?? createSiteReal;
  const persistActiveSite = deps.persistActiveSite ?? persistActiveSiteReal;
  const isSiteSwitcherEnabled = deps.isSiteSwitcherEnabled ?? isSiteSwitcherEnabledReal;
  const readPersistedActiveSite = deps.readPersistedActiveSite ?? readPersistedActiveSiteReal;

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

      const registered: readonly SiteListEntry[] = listSites();
      const binding = deps.siteBinding;
      const sites: ServingSiteListEntry[] = includeServingSite({ sites: registered, binding });
      const serving = sites.find((site) => site.dir === binding.dir);
      res.status(200).json({
        switchingEnabled: isSiteSwitcherEnabled(),
        sites,
        currentSite: { ...binding, listed: serving?.registration === "registered" },
        persistedSiteName: readPersistedActiveSite(),
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
      const plugins = await (deps.listTokenSignInPlugins ?? (() => listNewSiteTokenSignInPlugins()))(deps.workspaceId);
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
    if (!isSiteSwitcherEnabled()) {
      sendSiteSwitchingDisabled(res);
      return;
    }
    // Same ordering rationale as the flag check immediately above: a per-boot structural fact,
    // independent of the caller's own permissions, so it is checked before spending an authorize()
    // call on an operation this boot cannot fulfill regardless of who is asking.
    if (!deps.siteBinding.switcherCompatible) {
      sendSiteBindingNotSwitchable(res);
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
        res.status(400).json(parsed.body);
        return;
      }

      const parsedTokens = parseAgentPluginTokens(req.body);
      if (!parsedTokens.ok) {
        res.status(400).json(parsedTokens.body);
        return;
      }
      const refusal = await checkTokensBeforeCreate(deps, parsedTokens.tokens);
      if (refusal) {
        res.status(refusal.status).json(refusal.body);
        return;
      }

      const result = await createSite({ name: parsed.name });
      const agentPluginTokens = await storeTokensForNewSite(deps, result, parsedTokens.tokens);
      res.status(201).json({ site: { name: result.name, dir: result.dir, siteId: result.siteId }, agentPluginTokens });
    } catch (err) {
      const classified = classifyCreateSiteError(err);
      if (classified) {
        res.status(classified.status).json(classified.body);
        return;
      }
      console.error("[system/sites] unexpected error creating a site", err);
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });

  app.post("/api/admin/v1/workspaces/:workspaceId/system/sites/:name/activate", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }
    if (!isSiteSwitcherEnabled()) {
      sendSiteSwitchingDisabled(res);
      return;
    }
    if (!deps.siteBinding.switcherCompatible) {
      sendSiteBindingNotSwitchable(res);
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

      const name = String(req.params.name ?? "");
      const match = listSites().find((site) => site.name === name);
      if (!match) {
        res.status(404).json({ error: `site '${name}' was not found`, code: "SITE_NOT_FOUND" });
        return;
      }

      persistActiveSite({ name });
      res.status(200).json({
        ok: true,
        activeSiteName: name,
        restartRequired: true,
        restartInstructions: RESTART_INSTRUCTIONS,
      });
    } catch (err) {
      console.error("[system/sites] unexpected error activating a site", err);
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
}
