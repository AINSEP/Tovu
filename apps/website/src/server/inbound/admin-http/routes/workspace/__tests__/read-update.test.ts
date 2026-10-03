import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { InMemoryWorkspaceRepo } from "#src/features/workspace/index";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminWorkspaceGetRoute } from "../get.js";
import { registerAdminWorkspaceListRoute } from "../list.js";
import { registerAdminWorkspaceUpdateRoute } from "../update.js";

const own = { id: "ws-7", name: "Original Site", slug: "original-site", createdAt: "2026-09-01T00:00:00Z" };
function harness(repo: any) {
  const app = express();
  const deps = { workspaceId: "ws-7", workspaceRepo: repo, authorize: async () => ({ allowed: true, reason: "matched" }) } as any;
  registerAdminWorkspaceGetRoute(app, deps);
  registerAdminWorkspaceListRoute(app, deps);
  registerAdminWorkspaceUpdateRoute(app, deps);
  return async (method: "get" | "patch", path: string, body?: unknown) => {
    const { res, capture } = createCapturingResponse();
    res.locals.principal = { id: "principal-7" };
    await extractRouteHandler(app, method, path)({ params: { workspaceId: "ws-7" }, body }, res);
    return capture;
  };
}
const base = "/api/admin/v1/workspaces";
// F4.1/F6.3: returning every workspace, hiding missing rows, or dropping a PATCH field must fail.
test("workspace reads project exactly the bound row despite another row in storage", async () => {
  const repo = new InMemoryWorkspaceRepo({}, { initialRows: [own, { id: "foreign", name: "Other", slug: "other", createdAt: "2026-08-01T00:00:00Z" }] });
  const invoke = harness(repo);
  assert.deepEqual(await invoke("get", base), { statusCode: 200, jsonBody: { workspaces: [own] } });
  assert.deepEqual(await invoke("get", base + "/:workspaceId"), { statusCode: 200, jsonBody: { workspace: own } });
});
test("missing bound workspace is an empty list, a get 404, and an update RESOURCE_NOT_FOUND", async () => {
  const invoke = harness(new InMemoryWorkspaceRepo({}));
  assert.deepEqual(await invoke("get", base), { statusCode: 200, jsonBody: { workspaces: [] } });
  assert.deepEqual(await invoke("get", base + "/:workspaceId"), { statusCode: 404, jsonBody: { error: "workspace was not found" } });
  assert.deepEqual(await invoke("patch", base + "/:workspaceId", { name: "Renamed" }), {
    statusCode: 404, jsonBody: { error: "workspace 'ws-7' was not found", code: "RESOURCE_NOT_FOUND" },
  });
});
test("name-only and slug-only PATCH preserve the other field in storage and subsequent reads", async () => {
  const repo = new InMemoryWorkspaceRepo({}, { initialRows: [own] });
  const invoke = harness(repo);
  assert.equal((await invoke("patch", base + "/:workspaceId", { name: "Renamed Site" })).statusCode, 200);
  assert.deepEqual(await repo.findById("ws-7"), { id: "ws-7", name: "Renamed Site", slug: "original-site", createdAt: "2026-09-01T00:00:00Z" });
  assert.equal((await invoke("patch", base + "/:workspaceId", { slug: "new-slug" })).statusCode, 200);
  assert.deepEqual(await invoke("get", base + "/:workspaceId"), { statusCode: 200, jsonBody: { workspace: {
    id: "ws-7", name: "Renamed Site", slug: "new-slug", createdAt: "2026-09-01T00:00:00Z",
  } } });
});
test("unexpected repository failure maps to generic 500 in list, get and update", async () => {
  const invoke = harness({ findById: async () => { throw new Error("private database details"); } });
  for (const [method, path] of [["get", base], ["get", base + "/:workspaceId"], ["patch", base + "/:workspaceId"]] as const) {
    assert.deepEqual(await invoke(method, path, { name: "Renamed" }), { statusCode: 500, jsonBody: { error: "internal error" } });
  }
});

// F4.4/F6.3: each invalid update has one cause and must leave the stored workspace unchanged.
test("empty PATCH maps validation to 400 and slug collision maps conflict to 409 without persisting", async () => {
  const repo = new InMemoryWorkspaceRepo({}, { initialRows: [own, { id: "other", name: "Other Site", slug: "taken-slug", createdAt: "2026-08-01T00:00:00Z" }] });
  const invoke = harness(repo);
  for (const body of [undefined, null, {}]) {
    assert.deepEqual(await invoke("patch", base + "/:workspaceId", body), { statusCode: 400, jsonBody: {
      error: "at least one of name or slug is required", code: "VALIDATION_ERROR",
    } });
    assert.deepEqual(await repo.findById("ws-7"), own);
  }
  assert.deepEqual(await invoke("patch", base + "/:workspaceId", { slug: "taken-slug" }), { statusCode: 409, jsonBody: {
    error: "slug 'taken-slug' already exists", code: "RESOURCE_CONFLICT", details: { field: "slug" },
  } });
  assert.deepEqual(await repo.findById("ws-7"), own);
});
