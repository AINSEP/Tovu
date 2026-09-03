import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { bootAuthenticated } from "../helpers/http-test-server.js";
import { createRouteDeps } from "../../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../../inbound/admin-http/dev-auth.js";
import { registerAdminContentTypeRegisterRoute } from "../../inbound/admin-http/routes/content-types/register.js";
import { registerAdminContentTypeLifecycleRoute } from "../../inbound/admin-http/routes/content-types/lifecycle.js";
import type { RouteDeps } from "../../routes/types.js";

/**
 * @file Coverage-gap-fill for `content-types/lifecycle.ts` (deprecate/reactivate/tombstone,
 * ADR-043 §4/§6) — `content-types-routes.test.ts` only reaches `deprecate` and the unrecognized-op
 * 400. This fills in: 403, missing/invalid `expectedVersion`, `reactivate`/`tombstone` success,
 * the `must deprecate first` (EC-09) and `forbids any transition out of tombstone` (INV-06)
 * lifecycle-error branches, 409 VERSION_CONFLICT via lifecycle (not just update-fields), 404 on an
 * unregistered key, and the generic 500 fallback.
 */
function buildTestApp(deps: RouteDeps = createRouteDeps()): { app: express.Express; deps: RouteDeps } {
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  registerAdminContentTypeRegisterRoute(app, deps);
  registerAdminContentTypeLifecycleRoute(app, deps);
  return { app, deps };
}

async function registerType(baseUrl: string, cookie: string, key: string): Promise<void> {
  const res = await fetch(`${baseUrl}/api/admin/v1/content-types`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ key, label: key, fields: [] }),
  });
  assert.equal(res.status, 201);
}

async function lifecycle(baseUrl: string, cookie: string, key: string, op: string, expectedVersion: unknown) {
  const res = await fetch(`${baseUrl}/api/admin/v1/content-types/${key}/lifecycle`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ op, expectedVersion }),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

test("lifecycle: 403s for a caller without admin.collections.manage", async (t) => {
  const deps = createRouteDeps();
  const { app } = buildTestApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await registerType(baseUrl, cookie, "forbidden_type");

  deps.authorize = async () => ({ allowed: false, reason: "insufficient role" });
  const { status, json } = await lifecycle(baseUrl, cookie, "forbidden_type", "deprecate", 1);
  assert.equal(status, 403);
  const body = json as { code?: string; details?: { permission?: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details?.permission, "admin.collections.manage");
});

test("lifecycle: 400 VALIDATION_ERROR when expectedVersion is missing or not a number", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await registerType(baseUrl, cookie, "version_type");

  const missing = await lifecycle(baseUrl, cookie, "version_type", "deprecate", undefined);
  assert.equal(missing.status, 400);
  assert.equal((missing.json as { code?: string }).code, "VALIDATION_ERROR");

  const wrongType = await lifecycle(baseUrl, cookie, "version_type", "deprecate", "1");
  assert.equal(wrongType.status, 400);
  assert.equal((wrongType.json as { code?: string }).code, "VALIDATION_ERROR");
});

test("lifecycle: 404 CONTENT_TYPE_NOT_FOUND for a key that was never registered", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const { status, json } = await lifecycle(baseUrl, cookie, "never-registered", "deprecate", 1);
  assert.equal(status, 404);
  assert.equal((json as { code?: string }).code, "CONTENT_TYPE_NOT_FOUND");
});

test("lifecycle: 409 VERSION_CONFLICT for a stale expectedVersion on deprecate", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await registerType(baseUrl, cookie, "stale_type");

  const { status, json } = await lifecycle(baseUrl, cookie, "stale_type", "deprecate", 99);
  assert.equal(status, 409);
  assert.equal((json as { code?: string }).code, "VERSION_CONFLICT");
});

test("lifecycle: full deprecate -> reactivate -> deprecate -> tombstone cycle succeeds, each transition versioned correctly", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await registerType(baseUrl, cookie, "cycle_type"); // version 1, active

  const deprecated = await lifecycle(baseUrl, cookie, "cycle_type", "deprecate", 1);
  assert.equal(deprecated.status, 200);
  assert.equal((deprecated.json as { contentType: { status: string; version: number } }).contentType.status, "deprecated");
  assert.equal((deprecated.json as { contentType: { status: string; version: number } }).contentType.version, 2);

  const reactivated = await lifecycle(baseUrl, cookie, "cycle_type", "reactivate", 2);
  assert.equal(reactivated.status, 200);
  assert.equal((reactivated.json as { contentType: { status: string; version: number } }).contentType.status, "active");
  assert.equal((reactivated.json as { contentType: { status: string; version: number } }).contentType.version, 3);

  const deprecatedAgain = await lifecycle(baseUrl, cookie, "cycle_type", "deprecate", 3);
  assert.equal(deprecatedAgain.status, 200);

  const tombstoned = await lifecycle(baseUrl, cookie, "cycle_type", "tombstone", 4);
  assert.equal(tombstoned.status, 200);
  assert.equal((tombstoned.json as { contentType: { status: string } }).contentType.status, "tombstone");
});

test("lifecycle: tombstone from 'active' (never deprecated) is 409 CONTENT_TYPE_LIFECYCLE_ERROR (EC-09 'must deprecate first')", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await registerType(baseUrl, cookie, "skip_deprecate_type");

  const { status, json } = await lifecycle(baseUrl, cookie, "skip_deprecate_type", "tombstone", 1);
  assert.equal(status, 409);
  assert.equal((json as { code?: string }).code, "CONTENT_TYPE_LIFECYCLE_ERROR");
});

test("lifecycle: reactivate and deprecate both refuse a tombstoned type (INV-06 'forbids any transition out of tombstone')", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await registerType(baseUrl, cookie, "tombstoned_type");
  await lifecycle(baseUrl, cookie, "tombstoned_type", "deprecate", 1);
  const tombstoned = await lifecycle(baseUrl, cookie, "tombstoned_type", "tombstone", 2);
  assert.equal(tombstoned.status, 200);

  const reactivateAttempt = await lifecycle(baseUrl, cookie, "tombstoned_type", "reactivate", 3);
  assert.equal(reactivateAttempt.status, 409);
  assert.equal((reactivateAttempt.json as { code?: string }).code, "CONTENT_TYPE_LIFECYCLE_ERROR");

  const deprecateAttempt = await lifecycle(baseUrl, cookie, "tombstoned_type", "deprecate", 3);
  assert.equal(deprecateAttempt.status, 409);
  assert.equal((deprecateAttempt.json as { code?: string }).code, "CONTENT_TYPE_LIFECYCLE_ERROR");
});

test("lifecycle: statusFor's own ForbiddenError branch -- the write-service's internal re-check of admin.collections.manage, distinct from the route's own inline 403 (which runs first)", async (t) => {
  const deps = createRouteDeps();
  const { app } = buildTestApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await registerType(baseUrl, cookie, "double_check_type");

  // Allow the route's own inline check, then deny the write-service's internal re-check -- proves
  // `statusFor`'s `ForbiddenError` mapping is real, not merely unreachable dead code shadowed by
  // the route's earlier guard.
  let calls = 0;
  deps.authorize = async () => {
    calls += 1;
    return calls === 1 ? { allowed: true, reason: "matched" } : { allowed: false, reason: "denied on re-check" };
  };

  const { status, json } = await lifecycle(baseUrl, cookie, "double_check_type", "deprecate", 1);
  assert.equal(status, 403);
  assert.equal((json as { code?: string }).code, "FORBIDDEN");
});

test("lifecycle: 500s (generic) when the repo explodes on an otherwise-valid request", async (t) => {
  const deps = createRouteDeps();
  const { app } = buildTestApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await registerType(baseUrl, cookie, "explode_type");
  deps.contentTypeRepo.findByKey = async () => {
    throw new Error("db exploded");
  };

  const { status, json } = await lifecycle(baseUrl, cookie, "explode_type", "deprecate", 1);
  assert.equal(status, 500);
  assert.deepEqual(json, { error: "db exploded", code: "INTERNAL_ERROR" });
});
