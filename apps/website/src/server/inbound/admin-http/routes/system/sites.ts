import type { Express, Response } from "express";

import {
  createSite as createSiteReal,
  listSites as listSitesReal,
  persistActiveSite as persistActiveSiteReal,
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

export function registerAdminSitesRoutes(app: Express, deps: AdminSitesDeps): void {
  const listSites = deps.listSites ?? listSitesReal;
  const createSite = deps.createSite ?? createSiteReal;
  const persistActiveSite = deps.persistActiveSite ?? persistActiveSiteReal;
  const isSiteSwitcherEnabled = deps.isSiteSwitcherEnabled ?? isSiteSwitcherEnabledReal;

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
      res.status(200).json({ switchingEnabled: isSiteSwitcherEnabled(), sites });
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

      const body = req.body as Record<string, unknown> | null | undefined;
      const name = typeof body?.name === "string" ? body.name : undefined;
      if (name === undefined) {
        res.status(400).json({ error: "'name' (string) is required", code: "VALIDATION_ERROR" });
        return;
      }

      const result = createSite({ name });
      res.status(201).json({ site: { name: result.name, dir: result.dir, siteId: result.siteId } });
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(400).json({ error: err.message, code: "VALIDATION_ERROR" });
        return;
      }
      if (err instanceof InitDirNotEmptyError) {
        res.status(409).json({ error: err.message, code: "SITE_ALREADY_EXISTS" });
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
