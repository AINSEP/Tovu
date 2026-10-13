/** Admin-only chart metadata and immutable bytes; installed/custom browser providers never enter this port. */
import type { Express } from "express";
import { ADMIN_ASSISTANT_PERMISSION } from "#src/assistant/index";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";
type ChartRouteDeps = Pick<RouteDeps, "workspaceId" | "authorize" | "pluginRuntimeReady" | "siteTitleReady" | "browserProviders" | "chartProviderSnapshot">;

/** Register the authenticated chart bootstrap and exact admitted-asset lookup.
 * No route reads files, accepts an asset URL, or grants browser admission itself.
 * @returns Void. Readiness/ledger failures produce the fixed admin 500 envelope.
 * @complexity O(p + a) per request for the admitted, compiled-in provider/asset list.
 * @example registerChartProviderRoutes({ app, deps });
 */
export function registerChartProviderRoutes(
  { app, deps }: { app: Express; deps: ChartRouteDeps }, _options: Record<string, never> = {},
): void {
  const base = "/api/admin/v1/workspaces/:workspaceId/chart-providers";
  // One guard covers metadata and assets, before either can disclose a provider or execute bytes.
  app.use(base, async (req, res, next) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" }); return;
    }
    try {
      const principal = getAuthedPrincipal(res);
      if (!(await authorizeOrRespond(res, deps.authorize, { principalId: principal.id, permission: ADMIN_ASSISTANT_PERMISSION, workspaceId: deps.workspaceId }))) return;
      await Promise.all([deps.pluginRuntimeReady, deps.siteTitleReady]);
      next();
    } catch {
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
  app.get(base, async (_req, res) => {
    try {
      const data = await deps.chartProviderSnapshot?.({}) ?? { generation: "core", siteProvider: "plugin.recharts", providers: [] };
      res.set("Cache-Control", "no-store").json({ data });
    } catch {
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
  app.get(`${base}/assets/:pluginId/:version/:digest/:asset`, (req, res) => {
    const { pluginId, version, digest, asset: filename } = req.params;
    const providers = deps.browserProviders?.({}).providers.filter((provider) => provider.pluginId === pluginId && provider.version === version) ?? [];
    const asset = providers.flatMap((provider) => provider.assets).find((asset) => asset.digest === digest && asset.path.split("/").at(-1) === filename);
    if (!asset) { res.status(404).json({ error: "chart asset was not found" }); return; }
    res.set({ "Content-Type": asset.contentType, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=31536000, immutable" });
    res.send(Buffer.from(asset.readBytes({})));
  });
}
