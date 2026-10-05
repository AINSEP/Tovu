import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { InMemoryWorkspaceRepo } from "@jini-ai/cms/workspace";
import { registerAdminWorkspaceGetRoute } from "../inbound/admin-http/routes/workspace/get.js";
import { registerAdminWorkspaceListRoute } from "../inbound/admin-http/routes/workspace/list.js";
import { registerAdminWorkspaceUpdateRoute } from "../inbound/admin-http/routes/workspace/update.js";
import { createCapturingResponse, extractRouteHandler } from "./helpers/http-test-server.js";
import type { WorkspaceRouteDeps, WorkspaceRouteRegistrar } from "../inbound/admin-http/routes/workspace/deps.js";

const WS = "ws-b07";
const ROOT = "/api/admin/v1/workspaces";
const own = { id: WS, name: "Curated Journal", slug: "curated-journal", createdAt: "2026-09-03T14:23:00Z" };
const other = { id: "ws-foreign", name: "Foreign Journal", slug: "foreign-journal", createdAt: "2026-09-04T09:00:00Z" };

/** Each test fakes only the repo members its route path reaches; `Partial` of the real port still
 *  checks every faked method's signature. The routes under test read no `clock`/`idGen`/`outbox`/`bus`. */
async function invoke(register: WorkspaceRouteRegistrar, workspaceRepo: Partial<WorkspaceRouteDeps["workspaceRepo"]>, body?: unknown, workspaceId = WS) {
  const app = express();
  const fakes: Pick<WorkspaceRouteDeps, "workspaceId" | "authorize"> & { workspaceRepo: typeof workspaceRepo } = {
    workspaceId: WS, workspaceRepo, authorize: async () => ({ allowed: true, reason: "granted" }),
  };
  register(app, fakes as WorkspaceRouteDeps);
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "operator-b07" };
  const list = register === registerAdminWorkspaceListRoute;
  await extractRouteHandler(app, register === registerAdminWorkspaceUpdateRoute ? "patch" : "get", list ? ROOT : `${ROOT}/:workspaceId`)(
    { params: { workspaceId }, body }, res);
  return capture;
}

// Author checklist: literal expected fields, fresh real repo/service, no mocked subject, no
// clock/env mutation, read back writes through GET and repo (F6.3/F6.4), valid distinguishing data.
// One Question: returning the raw repo row, listing foreign workspaces, or dropping a DTO key fails.
test("workspace get/list return exact public metadata for the bound row and exclude foreign rows", async () => {
  const repo = new InMemoryWorkspaceRepo({}, { initialRows: [{ ...other }, { ...own, internalSecret: "hidden" } as typeof own] });
  assert.deepEqual(await invoke(registerAdminWorkspaceGetRoute, repo), { statusCode: 200, jsonBody: {
    workspace: { id: WS, name: "Curated Journal", slug: "curated-journal", createdAt: "2026-09-03T14:23:00Z" },
  } });
  assert.deepEqual(await invoke(registerAdminWorkspaceListRoute, repo), { statusCode: 200, jsonBody: {
    workspaces: [{ id: WS, name: "Curated Journal", slug: "curated-journal", createdAt: "2026-09-03T14:23:00Z" }],
  } });
});

// F4.4: request matches the boot workspace, so its missing row is the only cause of this 404.
test("a missing bound workspace is a 404 on get and an empty array on list", async () => {
  const repo = new InMemoryWorkspaceRepo({}, { initialRows: [{ ...other }] });
  assert.deepEqual(await invoke(registerAdminWorkspaceGetRoute, repo), { statusCode: 404, jsonBody: { error: "workspace was not found" } });
  assert.deepEqual(await invoke(registerAdminWorkspaceListRoute, repo), { statusCode: 200, jsonBody: { workspaces: [] } });
});

test("workspace get/list conceal a repository failure after attempting the bound-row read", async () => {
  for (const register of [registerAdminWorkspaceGetRoute, registerAdminWorkspaceListRoute]) {
    const reads: unknown[] = [];
    const capture = await invoke(register, { async findById(input: unknown) {
      reads.push(input);
      throw new Error("private database url");
    } });
    assert.deepEqual(reads, [{ id: WS }]);
    assert.deepEqual(capture, { statusCode: 500, jsonBody: { error: "internal error" } });
  }
});

// F4.3/F4.5/F6.3: non-default prior fields, independent GET, and foreign-row preservation
// kill an implementation that clears the omitted field, doesn't write, or targets the wrong id.
test("workspace PATCH name-only then slug-only preserves omitted fields in subsequent GETs", async () => {
  const repo = new InMemoryWorkspaceRepo({}, { initialRows: [{ ...other }, { ...own }] });
  assert.deepEqual(await repo.findById({ id: WS }), { id: WS, name: "Curated Journal", slug: "curated-journal", createdAt: "2026-09-03T14:23:00Z" });
  const renamed = await invoke(registerAdminWorkspaceUpdateRoute, repo, { name: "Autumn Journal" });
  assert.deepEqual(renamed, { statusCode: 200, jsonBody: { workspace: {
    id: WS, name: "Autumn Journal", slug: "curated-journal", createdAt: "2026-09-03T14:23:00Z",
  } } });
  assert.deepEqual(await invoke(registerAdminWorkspaceGetRoute, repo), { statusCode: 200, jsonBody: { workspace: {
    id: WS, name: "Autumn Journal", slug: "curated-journal", createdAt: "2026-09-03T14:23:00Z",
  } } });
  const reslugged = await invoke(registerAdminWorkspaceUpdateRoute, repo, { slug: "autumn-journal" });
  assert.deepEqual(reslugged, { statusCode: 200, jsonBody: { workspace: {
    id: WS, name: "Autumn Journal", slug: "autumn-journal", createdAt: "2026-09-03T14:23:00Z",
  } } });
  assert.deepEqual(await repo.findById({ id: WS }), { id: WS, name: "Autumn Journal", slug: "autumn-journal", createdAt: "2026-09-03T14:23:00Z" });
  assert.deepEqual(await repo.findById({ id: "ws-foreign" }), { id: "ws-foreign", name: "Foreign Journal", slug: "foreign-journal", createdAt: "2026-09-04T09:00:00Z" });
});

test("workspace PATCH with no writable fields is an exact validation error and preserves stored metadata", async () => {
  const repo = new InMemoryWorkspaceRepo({}, { initialRows: [{ ...own }] });
  for (const body of [undefined, null, {}, { createdAt: "overwrite", id: "foreign" }]) {
    assert.deepEqual(await invoke(registerAdminWorkspaceUpdateRoute, repo, body), {
      statusCode: 400, jsonBody: { error: "at least one of name or slug is required", code: "VALIDATION_ERROR" },
    });
    assert.deepEqual(await repo.findById({ id: WS }), { id: WS, name: "Curated Journal", slug: "curated-journal", createdAt: "2026-09-03T14:23:00Z" });
  }
});

test("workspace PATCH maps a missing target and a colliding slug to distinct exact error envelopes", async () => {
  const repo = new InMemoryWorkspaceRepo({}, { initialRows: [{ ...other }, { ...own }] });
  assert.deepEqual(await invoke(registerAdminWorkspaceUpdateRoute, repo, { slug: "foreign-journal" }), {
    statusCode: 409, jsonBody: { error: "slug 'foreign-journal' already exists", code: "RESOURCE_CONFLICT", details: { field: "slug" } },
  });
  assert.deepEqual(await repo.findById({ id: WS }), { id: WS, name: "Curated Journal", slug: "curated-journal", createdAt: "2026-09-03T14:23:00Z" });
  await repo.delete({ id: WS });
  assert.deepEqual(await invoke(registerAdminWorkspaceUpdateRoute, repo, { name: "New title" }), {
    statusCode: 404, jsonBody: { error: "workspace 'ws-b07' was not found", code: "RESOURCE_NOT_FOUND" },
  });
});

test("workspace PATCH conceals a failed write and leaves the active row unchanged", async (t) => {
  const repo = new InMemoryWorkspaceRepo({}, { initialRows: [{ ...own }] });
  const writes: unknown[] = [];
  t.mock.method(repo, "update", async (row: unknown) => { writes.push(row); throw new Error("private storage path"); });
  assert.deepEqual(await invoke(registerAdminWorkspaceUpdateRoute, repo, { name: "Failed rename" }), {
    statusCode: 500, jsonBody: { error: "internal error" },
  });
  assert.deepEqual(writes, [{ id: WS, name: "Failed rename", slug: "curated-journal", createdAt: "2026-09-03T14:23:00Z" }]);
  assert.deepEqual(await invoke(registerAdminWorkspaceGetRoute, repo), { statusCode: 200, jsonBody: { workspace: {
    id: WS, name: "Curated Journal", slug: "curated-journal", createdAt: "2026-09-03T14:23:00Z",
  } } });
});
