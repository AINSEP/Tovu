import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { bootAuthenticated, createCapturingResponse, extractRouteHandler } from "../helpers/http-test-server.js";
import { createRouteDeps } from "../../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../../inbound/admin-http/dev-auth.js";
import { registerAdminChangeSetRevertRoute } from "../../inbound/admin-http/routes/change-sets/revert.js";
import { createRevertRegistry, type EntityReverter } from "../../../contracts/core/commands/index.js";
import type { RouteDeps } from "../../routes/types.js";
import type { ChangeSetItemRecord, ChangeSetRecord } from "@jini-ai/cms/core";

/**
 * @file Route-level tests for `POST .../change-sets/:changeSetId/revert` — the HTTP wiring
 * (`change-sets/revert.ts`) around `revertChangeSet` (unit-tested exhaustively in
 * `contracts/core/commands/__tests__/revert.unit.test.ts`). The 403-denied path and the
 * single-item happy path are already covered end-to-end elsewhere (`packet-one-routes.test.ts`'s
 * REQ-05 test, `admin-post-page-delete-routes.test.ts`'s delete-then-revert test) — this file adds
 * the workspace-mismatch guard and every `sendChangeSetRevertError` mapping
 * (404/409/409/422/500), which no existing suite exercises through real HTTP.
 *
 * `deps.revertRegistry` is overridden with a bare `createRevertRegistry()` registered against a
 * fake `widget/update` reverter (matching `revert.unit.test.ts`'s own fixtures) rather than the
 * real post-domain registry `createRouteDeps()` wires up — this file is testing the route's error
 * mapping, not post-domain revert semantics, so a minimal, fully-controllable reverter is the
 * right double.
 */

const WS = "workspace-local";

function fakeReverter(opts: { currentVersion: number | null }): EntityReverter {
  return {
    currentVersion: async () => opts.currentVersion,
    applyInverse: async () => {},
  };
}

function buildTestApp(): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = createRouteDeps();
  deps.revertRegistry = createRevertRegistry();
  deps.revertRegistry.register("widget", "update", fakeReverter({ currentVersion: 1 }));

  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  registerAdminChangeSetRevertRoute(app, deps);
  return { app, deps };
}

function seededChangeSet(overrides: Partial<ChangeSetRecord> = {}): ChangeSetRecord {
  return {
    id: "cs-1",
    workspaceId: WS,
    status: "applied",
    summary: "test change set",
    createdAt: "2026-08-20T00:00:00.000Z",
    appliedAt: "2026-08-20T00:00:00.000Z",
    ...overrides,
  };
}

function seededItem(overrides: Partial<ChangeSetItemRecord> = {}): ChangeSetItemRecord {
  return {
    id: "csi-1",
    changeSetId: "cs-1",
    entityType: "widget",
    entityId: "entity-1",
    operation: "update",
    inversePayload: { field: "old-value" },
    entityVersionAtApply: 1,
    position: 0,
    ...overrides,
  };
}

test("change-sets revert: a workspace id that is not this site's is 404", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await deps.changeSets.insert(seededChangeSet(), [seededItem()]);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-this-site/change-sets/cs-1/revert`, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, "workspace was not found");
});

test("change-sets revert: an unknown change set id is 404 CHANGE_SET_NOT_FOUND", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/change-sets/does-not-exist/revert`, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { code: string; error: string };
  assert.equal(body.code, "CHANGE_SET_NOT_FOUND");
  assert.match(body.error, /'does-not-exist' was not found/);
});

test("change-sets revert: a change set that is not 'applied' is 409 CHANGE_SET_INVALID_STATUS", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await deps.changeSets.insert(seededChangeSet({ id: "cs-proposed", status: "proposed" }), [
    seededItem({ changeSetId: "cs-proposed" }),
  ]);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/change-sets/cs-proposed/revert`, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "CHANGE_SET_INVALID_STATUS");
});

test("change-sets revert: an entity that moved on since is 409 REVERT_CONFLICT", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  deps.revertRegistry = createRevertRegistry();
  deps.revertRegistry.register("widget", "update", fakeReverter({ currentVersion: 5 }));
  await deps.changeSets.insert(seededChangeSet({ id: "cs-conflict" }), [
    seededItem({ changeSetId: "cs-conflict", entityVersionAtApply: 3 }),
  ]);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/change-sets/cs-conflict/revert`, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "REVERT_CONFLICT");
});

test("change-sets revert: an item with no registered reverter is 422 REVERT_NOT_POSSIBLE", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  deps.revertRegistry = createRevertRegistry(); // nothing registered
  await deps.changeSets.insert(seededChangeSet({ id: "cs-unrevertible" }), [
    seededItem({ changeSetId: "cs-unrevertible" }),
  ]);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/change-sets/cs-unrevertible/revert`, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(res.status, 422);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "REVERT_NOT_POSSIBLE");
});

test("change-sets revert: an unexpected error is 500 with a generic body", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  deps.changeSets.findById = async () => {
    throw new Error("boom");
  };

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/change-sets/cs-1/revert`, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "internal error" });
});

/**
 * `req.params.workspaceId ?? ""` / `req.params.changeSetId ?? ""` (extractRouteHandler's own doc,
 * `../helpers/http-test-server.ts`): Express guarantees a matched `:param` is always a populated
 * string, so the right side of both `??`s is unreachable through any real HTTP request. Restored
 * 2026-09-03 after being wrongly deleted as "unreachable dead code" -- the repo's established answer
 * is to KEEP the guard and exercise it with a hand-built `req` that deliberately violates Express's
 * own routing contract, the same way a `default: throw` exhaustiveness guard is tested.
 */
test("change-sets revert: `req.params.workspaceId ?? \"\"` fallback, forced via a direct handler call", async () => {
  const { app } = buildTestApp();
  const handler = extractRouteHandler(app, "post", "/api/admin/v1/workspaces/:workspaceId/change-sets/:changeSetId/revert");
  const { res, capture } = createCapturingResponse();

  await handler({ params: {} }, res);

  assert.equal(capture.statusCode, 404);
  assert.equal((capture.jsonBody as { error: string }).error, "workspace was not found");
});

test("change-sets revert: `req.params.changeSetId ?? \"\"` fallback, forced via a direct handler call with only that param omitted -- reaches the real not-found lookup behind a real seeded principal", async () => {
  const { app, deps } = buildTestApp();
  await deps.identityReady;
  // `getAuthedPrincipal` normally runs behind `requireAdminSession`, which `extractRouteHandler`
  // bypasses -- stand in with the REAL seeded owner principal so `authorize()` actually grants
  // `changeset.revert` and the handler proceeds past auth into the lookup, same as a real request.
  const ownerUser = await deps.userRepo.findByUsername({ workspaceId: deps.workspaceId, username: "admin" });
  assert.ok(ownerUser, "expected the seeded admin user");
  const ownerPrincipal = await deps.principalRepo.findById({ workspaceId: deps.workspaceId, id: ownerUser.principalId });
  assert.ok(ownerPrincipal, "expected the seeded admin principal");

  const handler = extractRouteHandler(app, "post", "/api/admin/v1/workspaces/:workspaceId/change-sets/:changeSetId/revert");
  const { res, capture } = createCapturingResponse();
  res.locals.principal = ownerPrincipal;

  await handler({ params: { workspaceId: WS } }, res);

  assert.equal(capture.statusCode, 404);
  const body = capture.jsonBody as { code: string };
  assert.equal(body.code, "CHANGE_SET_NOT_FOUND");
});
