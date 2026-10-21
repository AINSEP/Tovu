import type { Express, Request, Response } from "express";

import {
  adminSurfaceBootstrapHeaders,
  createAdminSurfaceActionDispatcher,
  createAdminSurfaceBootstrap,
  type LoadedAdminSurface,
} from "@jini-ai/agent-plugins/admin-surfaces";

import {
  NO_ADMIN_SURFACE_HOST,
  ADMIN_SURFACE_ACTION_PERMISSION,
  withAdminSurfaceSignIns,
  adminSurfaceFileUrl,
  createAgentPluginAdminSurfaceSource,
  findAdminSurface,
  type AdminSurfaceHost,
  type AdminSurfaceRequestContext,
  type AdminSurfaceSource,
} from "#src/features/agent-plugins/admin-surfaces/surfaces";
import { isSameOriginAdminWrite } from "#src/features/agent-plugins/admin-surfaces/same-origin";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal, rejectUnlessSessionCredential } from "#src/server/inbound/admin-http/dev-auth";
import type { AgentPluginsRouteDeps, AgentPluginsRouteRegistrar } from "./deps.js";

/**
 * @file Admin routes for plugin-owned admin surfaces (Jini `@jini-ai/agent-plugins/admin-surfaces`):
 *
 * - `AGENT_PLUGIN_SURFACES` `GET  .../agent-plugins/:pluginId/surfaces` — the admitted surfaces of
 *   one plugin (id, title, frame `src`, declared actions for the host page's early refusal), for the
 *   details modal's tabs. `admin.plugins.read`.
 * - `AGENT_PLUGIN_SURFACE_BOOTSTRAP` `POST .../surfaces/:surfaceId/bootstrap` — the short-lived,
 *   never-cached start data the host page passes into the frame's `init`. `admin.plugins.enable`.
 * - `AGENT_PLUGIN_SURFACE_ACTION` `POST .../surfaces/:surfaceId/actions` — runs one declared action
 *   through Jini's dispatcher (which re-checks the declaration and schemas, because this route can be
 *   called directly). `admin.plugins.enable`.
 *
 * Why the two POSTs need more than the session: bootstrap data may carry a short-lived access token
 * and actions run host handlers, so both refuse API-key credentials (a surface is a browser UI) and
 * cross-origin requests (`same-origin.ts`) BEFORE authorization or any lookup. The surface files
 * themselves are served by the public route in `public-http/routes/agent-plugin-surfaces/files.ts`,
 * because a sandboxed frame's module-script fetches carry no cookie.
 *
 * Ids from the URL are only compared against admitted surfaces, never joined into a path. Errors
 * never echo handler text; the dispatcher already maps throws to surface-safe failures. An action
 * that started a sign-in also returns `hostSignIns`: the authorization links the host itself issued
 * during that request (`issued-sign-ins.ts`), which the host page offers to open, because the
 * sandboxed frame cannot and must never choose a URL for the host page to open.
 */

// Route params need no fallback: Express sets every named param of a matched route to a non-empty
// string (an empty segment never matches), and `requireAdminSession` always runs a JSON body parser
// before these handlers, so `req.body` is at least `{}` (both pinned in the routes integration test).
const WRITE_PERMISSION = ADMIN_SURFACE_ACTION_PERMISSION;
const SURFACE_PATH = "/api/admin/v1/workspaces/:workspaceId/agent-plugins/:pluginId/surfaces";

function sourceFor(deps: AgentPluginsRouteDeps): AdminSurfaceSource {
  return deps.adminSurfaceSource ?? createAgentPluginAdminSurfaceSource({ lifecycle: deps.agentPluginLifecycle });
}

/** Workspace check + permission; `false` when a response was already sent. @complexity O(1) + authorize. */
async function admit(req: Request, res: Response, deps: AgentPluginsRouteDeps, permission: string): Promise<boolean> {
  if (String(req.params.workspaceId) !== deps.workspaceId) {
    res.status(404).json({ error: "workspace was not found" });
    return false;
  }
  return authorizeOrRespond(res, deps.authorize, { principalId: getAuthedPrincipal(res).id, permission, workspaceId: deps.workspaceId });
}

/** The CSRF and credential-kind gates for the two writes; `false` when a 403 was already sent.
 * @complexity O(1). */
function admitWrite(req: Request, res: Response): boolean {
  if (!isSameOriginAdminWrite({ origin: req.get("origin"), host: req.get("host"), fetchSite: req.get("sec-fetch-site") })) {
    res.status(403).json({ error: "admin surface requests must come from the admin page itself", code: "CROSS_ORIGIN_REFUSED" });
    return false;
  }
  return rejectUnlessSessionCredential(res, { message: "admin surfaces accept only a signed-in admin session", permission: WRITE_PERMISSION });
}

/** Resolves the URL's surface, or sends 404. @complexity O(s) admitted surfaces. */
async function surfaceOrRespond(req: Request, res: Response, deps: AgentPluginsRouteDeps): Promise<LoadedAdminSurface | undefined> {
  const surface = await findAdminSurface({ source: sourceFor(deps), workspaceId: deps.workspaceId, pluginId: String(req.params.pluginId), surfaceId: String(req.params.surfaceId) });
  if (!surface) res.status(404).json({ error: "admin surface was not found", code: "ADMIN_SURFACE_NOT_FOUND" });
  return surface;
}

function contextFor(res: Response, deps: AgentPluginsRouteDeps, surface: LoadedAdminSurface): AdminSurfaceRequestContext {
  return { workspaceId: deps.workspaceId, principalId: getAuthedPrincipal(res).id, pluginId: surface.plugin.pluginId, surfaceId: surface.descriptor.id };
}

/** Runs a handler body; any throw becomes a generic 500 that names no server detail. */
async function guarded(res: Response, body: () => Promise<void>): Promise<void> {
  try { await body(); } catch { res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" }); }
}

export const registerAgentPluginAdminSurfaceRoutes: AgentPluginsRouteRegistrar = (app: Express, deps) => {
  app.get(SURFACE_PATH, (req, res) => guarded(res, async () => {
    if (!(await admit(req, res, deps, "admin.plugins.read"))) return;
    const pluginId = String(req.params.pluginId);
    const surfaces = (await sourceFor(deps).list({ workspaceId: deps.workspaceId })).filter((surface) => surface.plugin.pluginId === pluginId);
    res.json({ pluginId, surfaces: surfaces.map(({ descriptor }) => ({ id: descriptor.id, title: descriptor.title, src: adminSurfaceFileUrl({ pluginId, surfaceId: descriptor.id, path: descriptor.entry }), actions: descriptor.actions, linkOrigins: descriptor.linkOrigins ?? [] })) });
  }));

  app.post(`${SURFACE_PATH}/:surfaceId/bootstrap`, (req, res) => guarded(res, async () => {
    if (!admitWrite(req, res) || !(await admit(req, res, deps, WRITE_PERMISSION))) return;
    const surface = await surfaceOrRespond(req, res, deps);
    if (!surface) return;
    const host = deps.adminSurfaceHost ?? NO_ADMIN_SURFACE_HOST;
    const data = await host.bootstrapData({ context: contextFor(res, deps, surface) });
    res.set(adminSurfaceBootstrapHeaders()).json(createAdminSurfaceBootstrap({ surfaceId: surface.descriptor.id, data, nowMs: deps.clock.nowMs() }));
  }));

  app.post(`${SURFACE_PATH}/:surfaceId/actions`, (req, res) => guarded(res, async () => {
    if (!admitWrite(req, res) || !(await admit(req, res, deps, WRITE_PERMISSION))) return;
    const surface = await surfaceOrRespond(req, res, deps);
    if (!surface) return;
    const body = req.body as { action?: unknown; payload?: unknown };
    if (typeof body.action !== "string") {
      res.status(400).json({ error: "the request must name an action", code: "INVALID_REQUEST" });
      return;
    }
    const host = deps.adminSurfaceHost ?? NO_ADMIN_SURFACE_HOST;
    const dispatcher = createAdminSurfaceActionDispatcher({ descriptor: surface.descriptor, handlers: host.handlersFor({ pluginId: surface.plugin.pluginId, surfaceId: surface.descriptor.id }) }, {
      // Only the error's class reaches the log: a handler's message could quote provider detail.
      onHandlerError: ({ surfaceId, action, error }) => console.error("[admin-surfaces] action handler failed", { pluginId: surface.plugin.pluginId, surfaceId, action, error: error instanceof Error ? error.name : typeof error }),
    });
    const { action, payload } = body;
    res.set("Cache-Control", "no-store").json(await withAdminSurfaceSignIns({ host, run: () => dispatcher.dispatch({ action, payload, context: contextFor(res, deps, surface) }) }));
  }));
};
