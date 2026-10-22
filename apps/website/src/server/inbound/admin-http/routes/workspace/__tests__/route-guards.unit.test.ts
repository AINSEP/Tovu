import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { InMemoryWorkspaceRepo, WorkspaceLastRemainingError } from "#src/features/workspace/index";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminWorkspaceCreateRoute } from "../create.js";
import { deleteWorkspaceUnlessBound, registerAdminWorkspaceDeleteRoute, sendDeleteWorkspaceError } from "../delete.js";
import { registerAdminWorkspaceGetRoute } from "../get.js";
import { registerAdminWorkspaceUpdateRoute } from "../update.js";

/**
 * @file Direct-handler coverage for the workspace routes' defensive edges: the `?? ""` route-param
 * guard (a hand-built req with no `workspaceId` at all must still be refused 404, never coerced to
 * the string "undefined"), the authorization refusal, an absent JSON body, and the INV-05 helper
 * the delete route delegates to.
 */

const base = "/api/admin/v1/workspaces";
const own = { id: "ws-7", name: "Original Site", slug: "original-site", createdAt: "2026-09-01T00:00:00Z" };
const other = { id: "ws-8", name: "Other Site", slug: "other-site", createdAt: "2026-09-02T00:00:00Z" };

function harness(repo: unknown, allowed = true) {
  const app = express();
  let authorizeCalls = 0;
  const deps = {
    workspaceId: "ws-7",
    workspaceRepo: repo,
    authorize: async () => { authorizeCalls++; return { allowed, reason: allowed ? "matched" : "no-grant" }; },
  } as any;
  registerAdminWorkspaceCreateRoute(app, deps);
  registerAdminWorkspaceDeleteRoute(app, deps);
  registerAdminWorkspaceGetRoute(app, deps);
  registerAdminWorkspaceUpdateRoute(app, deps);
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
  assert.deepEqual(await repo.findById({ id: "ws-7" }), own);
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
  assert.deepEqual(await h.invoke("post", base, { body: { name: "New", slug: "new" } }), forbidden);
  for (const method of ["get", "patch", "delete"] as const) {
    assert.deepEqual(await h.invoke(method, `${base}/:workspaceId`, { params: { workspaceId: "ws-7" }, body: { name: "Renamed" } }), forbidden);
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
  assert.deepEqual(await repo.findById({ id: "ws-7" }), own);
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

/** A `res` stand-in that also records `status(204).send()` — the success path ends in `send`, not `json`. */
function sendingResponse() {
  const { res, capture } = createCapturingResponse();
  const sent: unknown[] = [];
  (res as any).send = (body?: unknown) => { sent.push(body); return res; };
  return { res, capture, sent };
}

test("deleteWorkspaceUnlessBound, given a non-bound target, runs the domain delete on deps.workspaceId (the pre-extraction handler's id) and answers 204", async () => {
  const repo = new InMemoryWorkspaceRepo({}, { initialRows: [own, other] });
  const { res, capture, sent } = sendingResponse();
  await deleteWorkspaceUnlessBound(res, { workspaceId: "ws-7", workspaceRepo: repo }, "ws-8");
  assert.equal(capture.statusCode, 204);
  assert.deepEqual(sent, [undefined]);
  assert.deepEqual(await repo.list(), [other]);
});

test("deleteWorkspaceUnlessBound lets the domain's typed errors through for sendDeleteWorkspaceError to map", async () => {
  const repo = new InMemoryWorkspaceRepo({}, { initialRows: [own] });
  const { res } = sendingResponse();
  await assert.rejects(deleteWorkspaceUnlessBound(res, { workspaceId: "ws-7", workspaceRepo: repo }, "ws-8"), WorkspaceLastRemainingError);
  assert.deepEqual(await repo.list(), [own]);
});

test("deleteWorkspaceUnlessBound refuses to run without a transaction port", async () => {
  const deleted: unknown[] = [];
  const repoWithoutTransaction = { findById: async () => other, list: async () => [own, other], delete: async (x: unknown) => { deleted.push(x); } };
  const { res } = sendingResponse();
  await assert.rejects(
    deleteWorkspaceUnlessBound(res, { workspaceId: "ws-7", workspaceRepo: repoWithoutTransaction as any }, "ws-8"),
    { message: "workspace deletion requires a transaction port" }
  );
  assert.deepEqual(deleted, []);
});

test("sendDeleteWorkspaceError logs a non-Error throw and an Error without a stack, answering a message-free 500", (t) => {
  const logged: string[] = [];
  t.mock.method(console, "error", (line: string) => { logged.push(line); });
  const stackless = new Error("stackless failure");
  stackless.stack = undefined;
  for (const err of ["plain string failure", stackless]) {
    const { res, capture } = createCapturingResponse();
    sendDeleteWorkspaceError(res, err);
    assert.deepEqual(capture, { statusCode: 500, jsonBody: { error: "internal error" } });
  }
  assert.deepEqual(logged, [
    "admin workspace delete route failed: plain string failure",
    "admin workspace delete route failed: stackless failure",
  ]);
});

test("an authorization backend failure on the delete route is answered by the opaque 500 mapping, not thrown", async (t) => {
  const logged: string[] = [];
  t.mock.method(console, "error", (line: string) => { logged.push(line); });
  const repo = new InMemoryWorkspaceRepo({}, { initialRows: [own, other] });
  const app = express();
  registerAdminWorkspaceDeleteRoute(app, {
    workspaceId: "ws-7", workspaceRepo: repo,
    authorize: async () => { throw "authorizer offline"; },
  } as any);
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "principal-7" };
  await extractRouteHandler(app, "delete", `${base}/:workspaceId`)({ params: { workspaceId: "ws-7" } }, res);
  assert.deepEqual(capture, { statusCode: 500, jsonBody: { error: "internal error" } });
  assert.deepEqual(logged, ["admin workspace delete route failed: authorizer offline"]);
  assert.deepEqual(await repo.list(), [own, other]);
});
