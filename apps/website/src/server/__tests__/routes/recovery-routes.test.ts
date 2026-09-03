import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { bootAuthenticated, createCapturingResponse, extractRouteHandler } from "../helpers/http-test-server.js";
import { createRouteDeps } from "../../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../../inbound/admin-http/dev-auth.js";
import { registerAdminDatabaseRestorePointsCreateRoute } from "../../inbound/admin-http/routes/database/restore-points.js";
import { registerAdminRecoveryRestorePointsListRoute } from "../../inbound/admin-http/routes/recovery/restore-points.js";
import { registerAdminRecoveryDisclosureRoute } from "../../inbound/admin-http/routes/recovery/disclosure.js";
import { registerAdminRecoveryDeepLinkRoute } from "../../inbound/admin-http/routes/recovery/deep-link.js";
import { registerAdminRecoveryStatusRoute } from "../../inbound/admin-http/routes/recovery/status.js";
import type { RouteDeps } from "../../routes/types.js";
import { acquireOperationLock, releaseOperationLock } from "#src/contracts/core/operation-lock";

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

  registerAdminDatabaseRestorePointsCreateRoute(app, deps);
  registerAdminRecoveryRestorePointsListRoute(app, deps);
  registerAdminRecoveryDisclosureRoute(app, deps);
  registerAdminRecoveryDeepLinkRoute(app, deps);
  registerAdminRecoveryStatusRoute(app, deps);
  return { app, deps };
}

test("recovery routes: a restore point minted via Database's own route is visible on Recovery's restore-points list (ADR-045 §1, shared ledger)", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const createRes = await fetch(`${baseUrl}/api/admin/v1/database/restore-points`, {
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

test("recovery routes: a deep-link envelope carrying a restorePointId that DOES exist server-side resolves {found:true} with the re-looked-up value", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const createRes = await fetch(`${baseUrl}/api/admin/v1/database/restore-points`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ trigger: "manual" }),
  });
  const created = (await createRes.json()) as { restorePoint: { id: string; capturedAt: string } };

  const res = await fetch(`${baseUrl}/api/admin/v1/recovery/deep-link`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      envelope: { v: 1, correlationId: "c1", siteId: "site-1", ledgerEventId: null, restorePointId: created.restorePoint.id, drift: "in-sync", intent: "view", issuedAt: "2026-07-15T00:00:00.000Z" },
    }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { found: boolean; restorePoint: { restorePointId: string } | null };
  assert.equal(body.found, true);
  assert.equal(body.restorePoint?.restorePointId, created.restorePoint.id);
});

test("recovery routes: deep-link denies 403 FORBIDDEN without backup.read", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  deps.authorize = async () => ({ allowed: false, reason: "test_denied" });

  const res = await fetch(`${baseUrl}/api/admin/v1/recovery/deep-link`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ envelope: { v: 1, correlationId: "c1", siteId: "site-1", ledgerEventId: null, restorePointId: "rp-1", drift: "in-sync", intent: "view", issuedAt: "2026-07-15T00:00:00.000Z" } }),
  });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string; details: { permission: string; reason: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.deepEqual(body.details, { permission: "backup.read", reason: "test_denied" });
});

test("recovery routes: deep-link rejects a missing envelope, and a non-object envelope, with 400 VALIDATION_ERROR", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const missing = await fetch(`${baseUrl}/api/admin/v1/recovery/deep-link`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({}),
  });
  assert.equal(missing.status, 400);
  assert.equal(((await missing.json()) as { code: string }).code, "VALIDATION_ERROR");

  // A truthy but non-object envelope (e.g. a string) must fail the same way — the second half of
  // the `!envelope || typeof envelope !== "object"` guard, not just the first.
  const wrongType = await fetch(`${baseUrl}/api/admin/v1/recovery/deep-link`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ envelope: "not-an-object" }),
  });
  assert.equal(wrongType.status, 400);
  assert.equal(((await wrongType.json()) as { code: string }).code, "VALIDATION_ERROR");
});

test("recovery routes: deep-link surfaces a thrown error as 500 INTERNAL_ERROR with the error's own message", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  deps.authorize = async () => {
    throw new Error("boom");
  };

  const res = await fetch(`${baseUrl}/api/admin/v1/recovery/deep-link`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ envelope: { v: 1, correlationId: "c1", siteId: "site-1", ledgerEventId: null, restorePointId: "rp-1", drift: "in-sync", intent: "view", issuedAt: "2026-07-15T00:00:00.000Z" } }),
  });
  assert.equal(res.status, 500);
  const body = (await res.json()) as { error: string; code: string };
  assert.deepEqual(body, { error: "boom", code: "INTERNAL_ERROR" });
});

test("recovery routes: deep-link surfaces a non-Error thrown value as 500 INTERNAL_ERROR with a generic message (the `err instanceof Error ? ... : \"internal error\"` ternary's false branch)", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  // A real caller can throw anything, not just an `Error` -- e.g. a legacy code path or a
  // third-party dependency rejecting with a plain string/object. Unlike the `?? {}` fallback below,
  // this ternary's false branch IS reachable through real HTTP; it just needs an unusual throw.
  deps.authorize = async () => {
    throw "boom";
  };

  const res = await fetch(`${baseUrl}/api/admin/v1/recovery/deep-link`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ envelope: { v: 1, correlationId: "c1", siteId: "site-1", ledgerEventId: null, restorePointId: "rp-1", drift: "in-sync", intent: "view", issuedAt: "2026-07-15T00:00:00.000Z" } }),
  });
  assert.equal(res.status, 500);
  const body = (await res.json()) as { error: string; code: string };
  assert.deepEqual(body, { error: "internal error", code: "INTERNAL_ERROR" });
});

/**
 * `req.body ?? {}` (extractRouteHandler's own doc, `helpers/http-test-server.ts`): real
 * `body-parser` always assigns `req.body` (as `{}` at worst), so the right side of this `??` is
 * unreachable through any real HTTP request. Restored 2026-09-03 after being wrongly deleted as
 * "unreachable dead code" -- the repo's established answer is to KEEP the guard and exercise it
 * with a hand-built `req` that deliberately violates that contract.
 */
test("recovery routes: deep-link's `req.body ?? {}` fallback, forced via a direct handler call past auth with a real seeded principal", async () => {
  const { app, deps } = buildTestApp();
  await deps.identityReady;
  const ownerUser = await deps.userRepo.findByUsername({ workspaceId: deps.workspaceId, username: "admin" });
  assert.ok(ownerUser, "expected the seeded admin user");
  const ownerPrincipal = await deps.principalRepo.findById({ workspaceId: deps.workspaceId, id: ownerUser.principalId });
  assert.ok(ownerPrincipal, "expected the seeded admin principal");

  const handler = extractRouteHandler(app, "post", "/api/admin/v1/recovery/deep-link");
  const { res, capture } = createCapturingResponse();
  res.locals.principal = ownerPrincipal;

  await handler({}, res); // no `body` key at all -> `req.body ?? {}` fallback

  assert.equal(capture.statusCode, 400);
  assert.equal((capture.jsonBody as { code: string }).code, "VALIDATION_ERROR");
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

test("recovery routes (ADR-041/043/044/045 re-audit, 2026-07-16, TM-adr041-043-044-045-audit-001, Finding 3 fix): status reflects a REAL held operation lock as the 'operation-in-flight' banner, and clears once released", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const acquired = await acquireOperationLock({
    deps: { clock: deps.clock },
    input: { siteId: deps.workspaceId, operationKind: "restore" },
  });
  assert.equal(acquired.ok, true);
  if (!acquired.ok) return;

  try {
    const res = await fetch(`${baseUrl}/api/admin/v1/recovery/status`, { headers: { cookie } });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { banner: { kind: string } | null };
    assert.equal(body.banner?.kind, "operation-in-flight", "a live lock must outrank the lower-precedence watermark-baseline-unavailable banner");
  } finally {
    await releaseOperationLock({ deps: { clock: deps.clock }, input: { siteId: deps.workspaceId, handle: acquired.value } });
  }

  const afterRelease = await fetch(`${baseUrl}/api/admin/v1/recovery/status`, { headers: { cookie } });
  const afterBody = (await afterRelease.json()) as { banner: { kind: string } | null };
  assert.equal(afterBody.banner?.kind, "watermark-baseline-unavailable", "releasing the lock must clear operationInFlight, falling back to the next banner in precedence");
});
