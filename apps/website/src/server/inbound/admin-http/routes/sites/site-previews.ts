/** Admin Sites card previews: which running sites can be captured, and the image route.
 * The capture policy lives in `features/sites/site-preview/site-preview-service.ts`. */
import type { Express, Request } from "express";
import type { TLSSocket } from "node:tls";
import { authorizeOrRespond } from "../../authorize-guard.js";
import { getAuthedPrincipal } from "../../dev-auth.js";
import type { RouteDeps } from "#src/server/routes/types";
import { SITE_PREVIEW_CONTENT_TYPE, type SitePreviewService, type SitePreviewTarget } from "#src/features/sites/index";

const PREFIX = "/api/admin/v1/workspaces/:workspaceId/system/sites";

/** The fields of a local-site supervisor entry (`LocalSiteState`) a capture target needs. */
export interface PreviewableLocalSite {
  name: string;
  status: string;
  pid: number | null;
  adminUrl: string | null;
}

/**
 * Capture targets for every site with a live address: each RUNNING local site at its own public
 * root (derived from the supervisor's loopback `adminUrl`), plus the site this process serves at
 * the scheme and port this request actually arrived on — the socket's, not a forwarded header's,
 * so a proxy in front (Vite's dev proxy) cannot point the capture anywhere else.
 * @complexity O(n) in the local-site count.
 */
export function sitePreviewTargets(
  { servingName, localSites }: { servingName: string; localSites: readonly PreviewableLocalSite[] },
  { serving }: { serving?: { scheme: "http" | "https"; port: number; pid: number } } = {},
): SitePreviewTarget[] {
  const targets: SitePreviewTarget[] = [];
  if (serving) targets.push({ name: servingName, url: `${serving.scheme}://localhost:${serving.port}/`, lifecycle: `serving:${serving.pid}` });
  for (const site of localSites) {
    if (site.status !== "running" || site.adminUrl === null || site.pid === null || site.name === servingName) continue;
    targets.push({ name: site.name, url: new URL("/", site.adminUrl).href, lifecycle: `pid:${site.pid}` });
  }
  return targets;
}

/** This server's own listening scheme and port, from the request's socket; `undefined` without one.
 * @complexity O(1). */
export function servingAddressOf({ req }: { req: Pick<Request, "socket"> }, { pid = process.pid }: { pid?: number } = {}) {
  const socket = req.socket as (TLSSocket & { localPort?: number }) | undefined;
  if (!socket?.localPort) return undefined;
  return { scheme: socket.encrypted ? "https" as const : "http" as const, port: socket.localPort, pid };
}

export interface SitePreviewRouteDeps extends Pick<RouteDeps, "workspaceId" | "authorize"> {
  sitePreviews?: SitePreviewService;
}

/**
 * `GET .../system/sites/:name/preview` — the stored capture, or 404. The admin requests it as
 * `?v=<version>` from the listing's `previewVersions`, so the bytes behind one URL never change and
 * the browser may keep them indefinitely; a new capture is a new URL.
 * @complexity O(n) in the image size (one file read).
 */
export function registerSitePreviewRoutes({ app, deps }: { app: Express; deps: SitePreviewRouteDeps }, _optional = {}): void {
  app.get(`${PREFIX}/:name/preview`, async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) { res.status(404).json({ error: "workspace was not found" }); return; }
    try {
      const principal = getAuthedPrincipal(res);
      if (!(await authorizeOrRespond(res, deps.authorize, { principalId: principal.id,
        permission: "system.read", workspaceId: deps.workspaceId, entityType: "site-registry" }))) return;
      const bytes = deps.sitePreviews?.read({ name: String(req.params.name ?? "") }) ?? null;
      if (bytes === null) { res.status(404).json({ code: "SITE_PREVIEW_NOT_FOUND", error: "no preview" }); return; }
      res.status(200).set({
        "Content-Type": SITE_PREVIEW_CONTENT_TYPE,
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      }).send(bytes);
    } catch (err) {
      console.error("[system/sites] unexpected error reading a site preview", err);
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
}
