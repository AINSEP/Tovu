import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { registerAdminSitesRoutes, type AdminSitesDeps } from "../system/sites.js";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import { createLocalSiteSupervisor } from "#src/platform/site-dir/local-site-supervisor";
import type { SitePreviewService, SitePreviewTarget } from "#src/features/sites/index";

/** @file The Sites listing carries `previewVersions` and hands the service its capture targets. */

const SITES = [
  { name: "owner", dir: "/repo/sites/owner", displayName: "Owner", active: true, createdAt: "2026-10-01T00:00:00.000Z" },
  { name: "alpha", dir: "/repo/sites/alpha", displayName: "Alpha", active: false, createdAt: "2026-10-02T00:00:00.000Z" },
];

async function list({ switching }: { switching: boolean }) {
  const localSiteSupervisor = createLocalSiteSupervisor({ servingName: "owner", scheme: "https", processPort: {
    isPortFree: async () => true, schedule: () => () => {},
    launch: async () => ({ pid: 10, ready: async () => true, onExit() {}, terminate: async () => {}, killNow() {} }),
  } });
  const seen: Array<{ sites: string[]; targets: SitePreviewTarget[] }> = [];
  const sitePreviews: SitePreviewService = {
    versions: ({ sites, targets }) => { seen.push({ sites: sites.map((site) => site.name).sort(), targets: [...targets] }); return { owner: 1234 }; },
    read: () => null,
    idle: async () => {},
  };
  const deps: AdminSitesDeps = {
    workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "owner" }),
    siteBinding: { name: "owner", dir: "/repo/sites/owner", dirOverridden: false, switcherCompatible: true },
    isSiteSwitcherEnabled: () => switching, localSiteSupervisor, sitePreviews,
    listSites: () => SITES, readPersistedActiveSite: () => null, listSiteTrash: () => [], devRestart: null,
  };
  const app = express(); registerAdminSitesRoutes(app, deps);
  const get = extractRouteHandler(app, "get", "/api/admin/v1/workspaces/:workspaceId/system/sites");
  const response = createCapturingResponse(); response.res.locals.principal = { id: "operator" };
  await get({ params: { workspaceId: "ws" }, socket: { localPort: 3000, encrypted: true } }, response.res);
  return { body: response.capture.jsonBody as { previewVersions: Record<string, number> }, seen };
}

test("with local management on, the listing returns the service's versions and passes the served site's socket target", async () => {
  const { body, seen } = await list({ switching: true });
  assert.deepEqual(body.previewVersions, { owner: 1234 });
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0].sites, ["alpha", "owner"]);
  assert.deepEqual(seen[0].targets, [{ name: "owner", url: "https://localhost:3000/", lifecycle: `serving:${process.pid}` }]);
});

test("with local management off, no capture is ever requested and the listing carries no versions", async () => {
  const { body, seen } = await list({ switching: false });
  assert.deepEqual(body.previewVersions, {});
  assert.deepEqual(seen, []);
});
