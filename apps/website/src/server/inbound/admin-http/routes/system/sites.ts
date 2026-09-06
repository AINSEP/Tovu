import type { Express, Response } from "express";

import {
  createSite as createSiteReal,
  describeSiteBinding as describeSiteBindingReal,
  listSites as listSitesReal,
  persistActiveSite as persistActiveSiteReal,
  readPersistedActiveSite as readPersistedActiveSiteReal,
  InitDirNotEmptyError,
  ValidationError,
  type SiteListEntry,
} from "#src/platform/site-dir/index";
import { isSiteSwitcherEnabled as isSiteSwitcherEnabledReal } from "#src/server/runtime/composition/site-switcher-enabled";
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
 * - `currentSite` — what this process is bound to RIGHT NOW (`describeSiteBinding`), plus `listed`:
 *   whether that directory appears in `sites[]` at all. It legitimately may not — `listSites` skips
 *   any directory without a valid `.site-meta.json` commit marker, and this repo's own live
 *   `sites/tovu-com` predates that marker, so `sites[]` comes back EMPTY while a site is plainly
 *   being served. A screen holding only the list would render "no sites" on a running server.
 *   `currentSite.dirOverridden` reports the `TOVU_SITE_DIR` precedence trap — see {@link
 *   SiteBinding.dirOverridden}: with it set, an activate is inert and the UI must say so.
 * - `persistedSiteName` — the pending `TOVU_SITE` choice a previous activate left in `.env`
 *   (`readPersistedActiveSite`), so "serving A, B queued for the next restart" survives a page
 *   reload rather than living only in the activate response the reload threw away.
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
 */
export type AdminSitesDeps = Pick<RouteDeps, "workspaceId" | "authorize"> & {
  /** Injectable so a route test proves both branches without touching the real filesystem or
   *  `sites/`. Each defaults to the real `site-dir`/`site-switcher-enabled` implementation. */
  listSites?: typeof listSitesReal;
  createSite?: typeof createSiteReal;
  persistActiveSite?: typeof persistActiveSiteReal;
  isSiteSwitcherEnabled?: typeof isSiteSwitcherEnabledReal;
  describeSiteBinding?: typeof describeSiteBindingReal;
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
  const describeSiteBinding = deps.describeSiteBinding ?? describeSiteBindingReal;
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

      const sites: SiteListEntry[] = listSites();
      const binding = describeSiteBinding();
      res.status(200).json({
        switchingEnabled: isSiteSwitcherEnabled(),
        sites,
        currentSite: { ...binding, listed: sites.some((site) => site.dir === binding.dir) },
        persistedSiteName: readPersistedActiveSite(),
      });
    } catch (err) {
      console.error("[system/sites] unexpected error listing sites", err);
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

      const result = createSite({ name: parsed.name });
      res.status(201).json({ site: { name: result.name, dir: result.dir, siteId: result.siteId } });
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
