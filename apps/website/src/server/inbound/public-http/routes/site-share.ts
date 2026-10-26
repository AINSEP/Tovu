import type { Express } from "express";
import { SHARE_DOWNLOAD_HEADERS } from "#src/features/site-backup/share-service";
import type { SiteShareRegistry } from "#src/features/site-backup/share-registry";

/**
 * Possession of the 16-letter (~91-bit) token authorizes exactly one attachment. Mount before request
 * tracking/page analytics: neither a successful token nor a guessed token belongs in telemetry.
 * All other methods/shapes in this reserved namespace terminate here, including without storage.
 */
export function registerPublicShareRoutes(required: { app: Express; registry?: SiteShareRegistry }, _optional: Record<string, never> = {}): void {
  required.app.get("/_share/:token/:file", async (req, res) => {
    res.set({ ...SHARE_DOWNLOAD_HEADERS });
    try {
      const row = await required.registry?.findToken({ token: String(req.params.token), file: String(req.params.file) });
      if (!row || row.storage?.provider !== undefined && row.storage.provider !== "tovu-server") { res.sendStatus(404); return; }
      res.set("Content-Disposition", `attachment; filename="${row.file}"`);
      res.sendFile(`${row.shareId}.tovu.zip`, { root: required.registry!.directory, cacheControl: false, lastModified: false, acceptRanges: false, dotfiles: "deny" }, (error) => {
        if (error && !res.headersSent) res.sendStatus(404);
        else if (error) res.destroy();
      });
    } catch { if (!res.headersSent) res.sendStatus(404); }
  });
  required.app.use("/_share", (_req, res) => { res.set({ ...SHARE_DOWNLOAD_HEADERS }).sendStatus(404); });
}
