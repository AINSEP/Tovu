import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { bootAuthenticated } from "../helpers/http-test-server";
import { createRouteDeps } from "../../app";
import { registerAuthRoutes, requireAdminSession } from "../../middleware/dev-auth";
import { registerAdminStorageRestorePointsCreateRoute } from "../../routes/admin/storage/restore-points";
import { registerAdminRecoveryRestorePointsListRoute } from "../../routes/admin/recovery/restore-points";
import { registerAdminRecoveryDisclosureRoute } from "../../routes/admin/recovery/disclosure";
import { registerAdminRecoveryDeepLinkRoute } from "../../routes/admin/recovery/deep-link";
import { registerAdminRecoveryStatusRoute } from "../../routes/admin/recovery/status";
import type { RouteDeps } from "../../routes/types";

/**
 * @file design-spec.md §4.8 backend-gap closure — route-level tests for Recovery's restore-points
 * list, disclosure, deep-link, and status HTTP surface (ADR-045), this dispatch. The gated restore
 * ceremony itself (plan/confirm/execute) is not wired this pass — see the handoff.
 */
function buildTestApp(): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));

  registerAdminStorageRestorePointsCreateRoute(app, deps);
  registerAdminRecoveryRestorePointsListRoute(app, deps);
  registerAdminRecoveryDisclosureRoute(app, deps);
  registerAdminRecoveryDeepLinkRoute(app, deps);
  registerAdminRecoveryStatusRoute(app, deps);
  return { app, deps };
}

test("recovery routes: a restore point minted via Storage's own route is visible on Recovery's restore-points list (ADR-045 §1, shared ledger)", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const createRes = await fetch(`${baseUrl}/api/admin/v1/storage/restore-points`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ trigger: "manual" }),
  });
  const created = (await createRes.json()) as { restorePoint: { id: string } };

  const listRes = await fetch(`${baseUrl}/api/admin/v1/recovery/restore-points`, { headers: { cookie } });
  assert.equal(listRes.status, 200);
  const listed = (await listRes.json()) as { items: Array<{ id: string }> };
  assert.deepEqual(
    listed.items.map((i) => i.id),
    [created.restorePoint.id]
  );
});

test("recovery routes: disclosure always renders 'unknown' (never a fabricated 0) while no watermark baseline tracker exists (ADR-045 §2 safe default)", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/recovery/disclosure`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ restorePointId: "rp-1" }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { partial: true; watermarkBaselineAvailable: boolean; counts: Record<string, unknown> };
  assert.equal(body.partial, true);
  assert.equal(body.watermarkBaselineAvailable, false);
  assert.equal(body.counts.posts_pages, "unknown");
  assert.equal(body.counts.plugin_table, "unknown");
});

test("recovery routes: a deep-link envelope with a stale/unknown restorePointId resolves {found:false}, not an error (INV-04)", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/recovery/deep-link`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      envelope: { v: 1, correlationId: "c1", siteId: "site-1", ledgerEventId: null, restorePointId: "does-not-exist", drift: "in-sync", intent: "view", issuedAt: "2026-07-15T00:00:00.000Z" },
    }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { found: boolean; restorePoint: unknown };
  assert.equal(body.found, false);
  assert.equal(body.restorePoint, null);
});

test("recovery routes: status resolves the real dbOps costClass, and reports the 'watermark-baseline-unavailable' banner (the honest, safe state while no per-category write tracker exists — never a fabricated 'healthy' state)", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/recovery/status`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { costClass: string; banner: { kind: string } | null };
  assert.equal(body.costClass, "cheap");
  assert.equal(body.banner?.kind, "watermark-baseline-unavailable");
});
