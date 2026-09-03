import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { bootAuthenticated, createCapturingResponse, extractRouteHandler } from "../helpers/http-test-server.js";
import { createRouteDeps } from "../../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../../inbound/admin-http/dev-auth.js";
import { registerAdminContentTypeListRoute } from "../../inbound/admin-http/routes/content-types/list.js";
import { registerAdminContentTypeRegisterRoute } from "../../inbound/admin-http/routes/content-types/register.js";
import { registerAdminContentTypeUpdateFieldsRoute } from "../../inbound/admin-http/routes/content-types/update-fields.js";
import { registerAdminContentTypeLifecycleRoute } from "../../inbound/admin-http/routes/content-types/lifecycle.js";
import type { RouteDeps } from "../../routes/types.js";

/**
 * @file design-spec.md §1.9 backend-gap closure — route-level tests for the Collections
 * content-type registry HTTP surface (ADR-022/ADR-043), this dispatch. Mirrors
 * `admin-database-timeline-route.test.ts`'s real-auth pattern.
 */
function buildTestApp(): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));

  registerAdminContentTypeListRoute(app, deps);
  registerAdminContentTypeRegisterRoute(app, deps);
  registerAdminContentTypeUpdateFieldsRoute(app, deps);
  registerAdminContentTypeLifecycleRoute(app, deps);
  return { app, deps };
}

test("content-types routes: register -> list -> update-fields -> lifecycle golden path", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const createRes = await fetch(`${baseUrl}/api/admin/v1/content-types`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ key: "recipe", label: "Recipe", fields: [{ name: "prep_minutes", kind: "integer", required: false, queryable: true }] }),
  });
  assert.equal(createRes.status, 201);
  const created = (await createRes.json()) as { contentType: { key: string; status: string; version: number } };
  assert.equal(created.contentType.status, "active");
  assert.equal(created.contentType.version, 1);

  const listRes = await fetch(`${baseUrl}/api/admin/v1/content-types`, { headers: { cookie } });
  assert.equal(listRes.status, 200);
  const listed = (await listRes.json()) as { items: Array<{ key: string }> };
  assert.deepEqual(
    listed.items.map((i) => i.key),
    ["recipe"]
  );

  const updateRes = await fetch(`${baseUrl}/api/admin/v1/content-types/recipe/fields`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ fields: [{ name: "prep_minutes", kind: "integer", required: false, queryable: true }, { name: "servings", kind: "integer", required: false, queryable: false }], expectedVersion: 1 }),
  });
  assert.equal(updateRes.status, 200);
  const updated = (await updateRes.json()) as { contentType: { version: number; fields: unknown[] } };
  assert.equal(updated.contentType.version, 2);
  assert.equal(updated.contentType.fields.length, 2);

  const deprecateRes = await fetch(`${baseUrl}/api/admin/v1/content-types/recipe/lifecycle`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ op: "deprecate", expectedVersion: 2 }),
  });
  assert.equal(deprecateRes.status, 200);
  const deprecated = (await deprecateRes.json()) as { contentType: { status: string } };
  assert.equal(deprecated.contentType.status, "deprecated");
});

test("content-types routes: registering a reserved key ('post') is rejected VALIDATION_ERROR (ADR-043 §4)", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/content-types`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ key: "post", label: "Post", fields: [] }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "VALIDATION_ERROR");
});

test("content-types routes: an unrecognized lifecycle 'op' is rejected VALIDATION_ERROR before any write-service call (ADR-042 closed-union-dispatch)", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  await fetch(`${baseUrl}/api/admin/v1/content-types`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ key: "recipe", label: "Recipe", fields: [] }),
  });

  const res = await fetch(`${baseUrl}/api/admin/v1/content-types/recipe/lifecycle`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ op: "delete", expectedVersion: 1 }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "VALIDATION_ERROR");
});

// ---------------------------------------------------------------------------
// UPDATE-FIELDS coverage gap fill — statusFor()'s error-mapping branches and the
// outer catch-all, none of which the golden-path/shape-boundary suites reach.
// ---------------------------------------------------------------------------

test("UPDATE-FIELDS: 404 CONTENT_TYPE_NOT_FOUND for a key that was never registered", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/content-types/does-not-exist/fields`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ fields: [{ name: "x", kind: "integer", required: false, queryable: false }], expectedVersion: 1 }),
  });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "CONTENT_TYPE_NOT_FOUND");
});

test("UPDATE-FIELDS: 409 VERSION_CONFLICT for a stale expectedVersion", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await fetch(`${baseUrl}/api/admin/v1/content-types`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ key: "recipe", label: "Recipe", fields: [] }),
  });

  const res = await fetch(`${baseUrl}/api/admin/v1/content-types/recipe/fields`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ fields: [{ name: "x", kind: "integer", required: false, queryable: false }], expectedVersion: 99 }),
  });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "VERSION_CONFLICT");
});

test("UPDATE-FIELDS: rejects an empty fields array with the write-service's own 'fields_empty' ValidationError — distinct from the route's shape guard (an empty array is legal shape, REGISTER allows it)", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await fetch(`${baseUrl}/api/admin/v1/content-types`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ key: "recipe", label: "Recipe", fields: [{ name: "x", kind: "integer", required: false, queryable: false }] }),
  });

  const res = await fetch(`${baseUrl}/api/admin/v1/content-types/recipe/fields`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ fields: [], expectedVersion: 1 }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string; error: string };
  assert.equal(body.code, "VALIDATION_ERROR");
  assert.match(body.error, /empty fields array/);
});

test("UPDATE-FIELDS: a shape-valid but grammar-invalid field name is rejected by the write-service's own guard chain (InvalidFieldNameGrammarError), not the route's shape boundary", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await fetch(`${baseUrl}/api/admin/v1/content-types`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ key: "recipe", label: "Recipe", fields: [] }),
  });

  const res = await fetch(`${baseUrl}/api/admin/v1/content-types/recipe/fields`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ fields: [{ name: "NotValidGrammar", kind: "integer", required: false, queryable: false }], expectedVersion: 1 }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string; error: string };
  assert.equal(body.code, "VALIDATION_ERROR");
  assert.match(body.error, /fails the identifier grammar gate/);
});

test("UPDATE-FIELDS: a kind outside the closed enum is rejected by the write-service's own guard chain (InvalidFieldKindError)", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await fetch(`${baseUrl}/api/admin/v1/content-types`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ key: "recipe", label: "Recipe", fields: [] }),
  });

  const res = await fetch(`${baseUrl}/api/admin/v1/content-types/recipe/fields`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ fields: [{ name: "good_name", kind: "bogus", required: false, queryable: false }], expectedVersion: 1 }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string; error: string };
  assert.equal(body.code, "VALIDATION_ERROR");
  assert.match(body.error, /not one of the closed field-kind enum/);
});

test("UPDATE-FIELDS: exceeding the queryable-field cap is rejected by the write-service's own guard chain (QueryableFieldCapExceededError)", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await fetch(`${baseUrl}/api/admin/v1/content-types`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ key: "recipe", label: "Recipe", fields: [] }),
  });

  const fields = Array.from({ length: 21 }, (_, i) => ({ name: `f_${i}`, kind: "integer", required: false, queryable: true }));
  const res = await fetch(`${baseUrl}/api/admin/v1/content-types/recipe/fields`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ fields, expectedVersion: 1 }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string; error: string };
  assert.equal(body.code, "VALIDATION_ERROR");
  assert.match(body.error, /more than 20 queryable fields/);
});

test("UPDATE-FIELDS: statusFor's own ForbiddenError branch — the write-service's internal re-check of admin.collections.manage, distinct from the route's own inline 403 (which runs first)", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await fetch(`${baseUrl}/api/admin/v1/content-types`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ key: "recipe", label: "Recipe", fields: [] }),
  });

  const originalAuthorize = deps.authorize;
  let call = 0;
  // The route checks `admin.collections.manage` itself before ever calling
  // `updateContentTypeFields`, which checks the SAME permission again internally
  // (write-service.ts). Allow the route's own check through, deny the write-service's
  // internal one, to reach `statusFor`'s `ForbiddenError` mapping specifically.
  deps.authorize = async (input) => {
    call += 1;
    if (call === 1) return originalAuthorize(input);
    return { allowed: false, reason: "test_denied" };
  };
  try {
    const res = await fetch(`${baseUrl}/api/admin/v1/content-types/recipe/fields`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ fields: [{ name: "x", kind: "integer", required: false, queryable: false }], expectedVersion: 1 }),
    });
    assert.equal(res.status, 403);
    const body = (await res.json()) as { code: string };
    assert.equal(body.code, "FORBIDDEN");
  } finally {
    deps.authorize = originalAuthorize;
  }
});

test("UPDATE-FIELDS: an unexpected repo failure surfaces as 500 through the route's outer catch, with the real error message (not the generic 'internal error' the delete routes use)", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await fetch(`${baseUrl}/api/admin/v1/content-types`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ key: "recipe", label: "Recipe", fields: [] }),
  });

  const originalTransaction = deps.contentTypeRepo.transaction.bind(deps.contentTypeRepo);
  deps.contentTypeRepo.transaction = async () => {
    throw new Error("simulated repo failure");
  };
  try {
    const res = await fetch(`${baseUrl}/api/admin/v1/content-types/recipe/fields`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ fields: [{ name: "x", kind: "integer", required: false, queryable: false }], expectedVersion: 1 }),
    });
    assert.equal(res.status, 500);
    const body = (await res.json()) as { error: string; code: string };
    assert.equal(body.error, "simulated repo failure");
    assert.equal(body.code, "INTERNAL_ERROR");
  } finally {
    deps.contentTypeRepo.transaction = originalTransaction;
  }
});

test("UPDATE-FIELDS: a non-Error throw still surfaces as 500 with the generic 'internal error' message (the outer catch's err instanceof Error ternary, false side)", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await fetch(`${baseUrl}/api/admin/v1/content-types`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ key: "recipe", label: "Recipe", fields: [] }),
  });

  const originalTransaction = deps.contentTypeRepo.transaction.bind(deps.contentTypeRepo);
  // eslint-disable-next-line @typescript-eslint/only-throw-error -- deliberately non-Error, to
  // exercise the outer catch's `err instanceof Error` ternary false side.
  deps.contentTypeRepo.transaction = async () => {
    throw "simulated non-Error rejection";
  };
  try {
    const res = await fetch(`${baseUrl}/api/admin/v1/content-types/recipe/fields`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ fields: [{ name: "x", kind: "integer", required: false, queryable: false }], expectedVersion: 1 }),
    });
    assert.equal(res.status, 500);
    const body = (await res.json()) as { error: string; code: string };
    assert.equal(body.error, "internal error");
    assert.equal(body.code, "INTERNAL_ERROR");
  } finally {
    deps.contentTypeRepo.transaction = originalTransaction;
  }
});

/**
 * `req.body ?? {}` (extractRouteHandler's own doc, `helpers/http-test-server.ts`): real
 * `body-parser` always assigns `req.body` (as `{}` at worst), so the right side of this `??` is
 * unreachable through any real HTTP request. Restored 2026-09-03 after being wrongly deleted as
 * "unreachable dead code" -- the repo's established answer is to KEEP the guard and exercise it
 * with a hand-built `req` that deliberately violates that contract.
 */
test("UPDATE-FIELDS: `req.body ?? {}` fallback, forced via a direct handler call past auth with a real seeded principal", async () => {
  const { app, deps } = buildTestApp();
  await deps.identityReady;
  const ownerUser = await deps.userRepo.findByUsername({ workspaceId: deps.workspaceId, username: "admin" });
  assert.ok(ownerUser, "expected the seeded admin user");
  const ownerPrincipal = await deps.principalRepo.findById({ workspaceId: deps.workspaceId, id: ownerUser.principalId });
  assert.ok(ownerPrincipal, "expected the seeded admin principal");

  const handler = extractRouteHandler(app, "put", "/api/admin/v1/content-types/:key/fields");
  const { res, capture } = createCapturingResponse();
  res.locals.principal = ownerPrincipal;

  await handler({ params: { key: "recipe" } }, res); // no `body` key at all -> `req.body ?? {}` fallback

  assert.equal(capture.statusCode, 400);
  assert.equal((capture.jsonBody as { code: string }).code, "VALIDATION_ERROR");
});
