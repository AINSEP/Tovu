import { assertAdminDiagnostics, assertAdminResponse } from "#src/server/inbound/admin-http/http/__tests__/assert-admin-response";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { InMemoryWorkspaceRepo } from "#src/features/workspace/index";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminWorkspaceCreateRoute, registerAdminWorkspaceDeleteRoute, registerAdminWorkspaceGetRoute, registerAdminWorkspaceUpdateRoute } from "#src/server/runtime/composition/modules/workspace";

/**
 * @file Direct-handler coverage for the workspace routes' defensive edges: the `?? ""` route-param
 * guard (a hand-built req with no `workspaceId` at all must still be refused 404, never coerced to
 * the string "undefined"), the authorization refusal, an absent JSON body, and the INV-05 helper
 * the delete route delegates to.
 */

const base = "/api/admin/v1/workspaces";
const own = { id: "ws-7", name: "Original Site", slug: "original-site", createdAt: "2026-09-01T00:00:00Z", version: 1 };
const other = { id: "ws-8", name: "Other Site", slug: "other-site", createdAt: "2026-09-02T00:00:00Z", version: 1 };

function harness(repo: unknown, allowed = true) {
  const app = express();
  let authorizeCalls = 0;
  const deps = {
    workspaceId: "ws-7",
    workspaceRepo: repo,
    authorize: async () => { authorizeCalls++; return { allowed, reason: allowed ? "matched" : "no-grant" }; },
  } as any;
  registerAdminWorkspaceCreateRoute({ app, deps });
  registerAdminWorkspaceDeleteRoute({ app, deps });
  registerAdminWorkspaceGetRoute({ app, deps });
  registerAdminWorkspaceUpdateRoute({ app, deps });
  return {
    authorizeCalls: () => authorizeCalls,
    invoke: async (method: "get" | "patch" | "delete" | "post", path: string, req: { params?: unknown; body?: unknown }) => {
      const { res, capture } = createCapturingResponse();
      res.locals.principal = { id: "principal-7" };
      await extractRouteHandler(app, method, path)({ params: {}, ...req }, res);
      return capture;
    },
  };
}

test("a request with no workspaceId param at all is refused 404 by get, update and delete before authorization", async () => {
  const repo = new InMemoryWorkspaceRepo({}, { initialRows: [own] });
  const h = harness(repo);
  for (const method of ["get", "patch", "delete"] as const) {
    assert.deepEqual(await h.invoke(method, `${base}/:workspaceId`, { params: {}, body: { name: "Renamed" } }), {
      statusCode: 404, jsonBody: { error: "workspace was not found" },
    });
  }
  assert.equal(h.authorizeCalls(), 0);
  assertAdminResponse({ actual: await repo.findById({ id: "ws-7" }), expected: own });
});

test("a caller without workspace.manage is refused 403 by create, get, update and delete without touching storage", async () => {
  const repo = new InMemoryWorkspaceRepo({}, { initialRows: [own] });
  const h = harness(repo, false);
  const forbidden = {
    statusCode: 403,
    jsonBody: {
      error: "principal 'principal-7' is not authorized for 'workspace.manage' (no-grant)",
      code: "FORBIDDEN",
      details: { permission: "workspace.manage", reason: "no-grant" },
    },
  };
  assertAdminResponse({ actual: await h.invoke("post", base, { body: { name: "New", slug: "new" } }), expected: forbidden });
  for (const method of ["get", "patch", "delete"] as const) {
    assertAdminResponse({ actual: await h.invoke(method, `${base}/:workspaceId`, { params: { workspaceId: "ws-7" }, body: { name: "Renamed" } }), expected: forbidden });
  }
  assert.equal(h.authorizeCalls(), 4);
  assert.deepEqual(await repo.list(), [own]);
});

test("create with no JSON body at all is a validation error, not a crash", async () => {
  const repo = new InMemoryWorkspaceRepo({}, { initialRows: [own] });
  const h = harness(repo);
  const result = await h.invoke("post", base, { body: undefined });
  assert.equal(result.statusCode, 400);
  assert.equal((result.jsonBody as { code: string }).code, "VALIDATION_ERROR");
  assert.deepEqual(await repo.list(), [own]);
});

test("update with no JSON body at all leaves both fields untouched and is refused as an empty update", async () => {
  const repo = new InMemoryWorkspaceRepo({}, { initialRows: [own] });
  const h = harness(repo);
  const result = await h.invoke("patch", `${base}/:workspaceId`, { params: { workspaceId: "ws-7" }, body: undefined });
  assert.equal(result.statusCode, 400);
  assert.equal((result.jsonBody as { code: string }).code, "VALIDATION_ERROR");
  assertAdminResponse({ actual: await repo.findById({ id: "ws-7" }), expected: own });
});

test("deleting the bound workspace over HTTP is refused BOUND_WORKSPACE (INV-05) and the row survives", async () => {
  const repo = new InMemoryWorkspaceRepo({}, { initialRows: [own, other] });
  const h = harness(repo);
  assert.deepEqual(await h.invoke("delete", `${base}/:workspaceId`, { params: { workspaceId: "ws-7" } }), {
    statusCode: 409,
    jsonBody: { error: "the workspace this server is bound to cannot be deleted while it is serving that workspace", code: "BOUND_WORKSPACE" },
  });
  assert.deepEqual(await repo.list(), [own, other]);
});

// The direct `deleteWorkspaceUnlessBound`/typed-error-mapping cases moved with the route to Jini
// (`@jini-ai/cms` admin-http/routes/workspace/__tests__/workspace-routes.test.ts). The host's own
// half — the opaque, logged 500 for anything the spec does not map — is pinned over the mount here.
test("a stackless Error carrying secrets on the delete route is logged and answered by the opaque 500, leaking no message", async (t) => {
  const logged: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { logged.push(args); });
  const stackless = new Error("db exploded: connection string postgres://user:pw@host");
  stackless.stack = undefined;
  const repo = new InMemoryWorkspaceRepo({}, { initialRows: [own, other] });
  const app = express();
  registerAdminWorkspaceDeleteRoute({ app, deps: { workspaceId: "ws-7", workspaceRepo: repo, authorize: async () => { throw stackless; } } as any });
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "principal-7" };
  await extractRouteHandler(app, "delete", `${base}/:workspaceId`)({ params: { workspaceId: "ws-7" } }, res);
  assertAdminResponse({ actual: capture, expected: { statusCode: 500, jsonBody: { error: "internal error" } } }, { failure: {"message":"The workspace removal could not be confirmed.","action":"Check the list before repeating the removal. Copy details and report this problem.","step":"Remove workspace"} });
  assert.doesNotMatch(JSON.stringify(capture.jsonBody), /db exploded|postgres:\/\//);
  assertAdminDiagnostics({ calls: logged, operation: "[routes/workspace/delete]", diagnostics: [/^Error: db exploded/] });
});

test("an authorization backend failure on the delete route is answered by the opaque 500 mapping, not thrown", async (t) => {
  const logged: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { logged.push(args); });
  const repo = new InMemoryWorkspaceRepo({}, { initialRows: [own, other] });
  const app = express();
  registerAdminWorkspaceDeleteRoute({ app, deps: {
    workspaceId: "ws-7", workspaceRepo: repo,
    authorize: async () => { throw "authorizer offline"; },
  } as any });
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "principal-7" };
  await extractRouteHandler(app, "delete", `${base}/:workspaceId`)({ params: { workspaceId: "ws-7" } }, res);
  assertAdminResponse({ actual: capture, expected: { statusCode: 500, jsonBody: { error: "internal error" } } }, { failure: {"message":"The workspace removal could not be confirmed.","action":"Check the list before repeating the removal. Copy details and report this problem.","step":"Remove workspace"} });
  assertAdminDiagnostics({ calls: logged, operation: "[routes/workspace/delete]", diagnostics: [/^authorizer offline$/] });
  assert.deepEqual(await repo.list(), [own, other]);
});
