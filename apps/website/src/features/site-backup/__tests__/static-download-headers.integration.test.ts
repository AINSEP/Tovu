import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { dispatchJsonRequest } from "#src/server/__tests__/helpers/in-process-http";
import { registerAdminSiteShareRoutes } from "#src/server/inbound/admin-http/routes/system/site-shares";
import type { RouteDeps } from "#src/server/routes/types";
import { SiteShareRegistry } from "../share-registry.js";
import { createSiteShare } from "../share-service.js";

for (const filename of ["site-static-2026-10-30-1015.zip", "site.tovu.zip"]) {
  test(`authenticated download exposes ${filename} in Content-Disposition`, async t => {
    const directory = await mkdtemp(path.join(tmpdir(), "share-download-name-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const registry = new SiteShareRegistry({ directory });
    // This route streams opaque stored bytes. Numeric bytes let the existing in-process
    // JSON request helper verify the response without a socket or another HTTP harness.
    const row = await createSiteShare({ registry, site: "ws", name: "site", archive: Buffer.from("123") }, { filename });
    const app = express();
    let headers: Record<string, unknown> = {};
    app.use((_req, res, next) => {
      res.locals.principal = { id: "owner" };
      res.on("finish", () => { headers = res.getHeaders(); });
      next();
    });
    registerAdminSiteShareRoutes({ app, deps: { workspaceId: "ws", authorize: async () => ({ allowed: true }), siteShareBackend: { registry } } as unknown as RouteDeps });
    const response = await dispatchJsonRequest(app, "GET", `/api/admin/v1/workspaces/ws/site-shares/${row.shareId}/download`);
    assert.equal(response.status, 200);
    assert.equal(headers["content-disposition"], `attachment; filename="${filename}"`);
    assert.equal(headers["content-type"], "application/zip");
    assert.equal(response.body, 123);
  });
}
