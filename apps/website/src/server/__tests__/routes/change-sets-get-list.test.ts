import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { bootAuthenticated } from "../helpers/http-test-server.js";
import { createRouteDeps } from "../../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../../inbound/admin-http/dev-auth.js";
import { registerAdminChangeSetGetRoute } from "../../inbound/admin-http/routes/change-sets/get.js";
import { registerAdminChangeSetListRoute } from "../../inbound/admin-http/routes/change-sets/list.js";
import type { RouteDeps } from "../../routes/types.js";
import type { ChangeSetItemRecord, ChangeSetRecord } from "@jini-ai/cms/core";

/**
 * @file Route-level tests for `GET .../change-sets` and `GET .../change-sets/:changeSetId`.
 *
 * The 403 path and the owner's 200 are already exercised end-to-end by `packet-one-routes.test.ts`'s
 * REQ-05 test. This file adds what no suite asserted: the workspace-mismatch guard, the unknown-id
 * 404, the exact DTO the detail route returns for its items (`revertible` derived, the stored
 * inverse payload NOT leaked), and the 500 path.
 */

const WS = "workspace-local";

function buildTestApp(): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  registerAdminChangeSetListRoute(app, deps);
  registerAdminChangeSetGetRoute(app, deps);
  return { app, deps };
}

function changeSet(overrides: Partial<ChangeSetRecord> = {}): ChangeSetRecord {
  return {
    id: "cs-get-1",
    workspaceId: WS,
    status: "applied",
    summary: "Update widget",
    createdAt: "2026-08-20T00:00:00.000Z",
    appliedAt: "2026-08-20T00:00:01.000Z",
    ...overrides,
  };
}

function item(overrides: Partial<ChangeSetItemRecord> = {}): ChangeSetItemRecord {
  return {
    id: "csi-1",
    changeSetId: "cs-get-1",
    entityType: "widget",
    entityId: "entity-1",
    operation: "update",
    inversePayload: { secretField: "old-value" },
    entityVersionAtApply: 3,
    position: 0,
    ...overrides,
  };
}

test("change-sets list + get: a workspace id that is not this site's is 404 on both routes", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await deps.changeSets.insert({ record: changeSet(), items: [item()] });

  for (const path of ["/change-sets", "/change-sets/cs-get-1"]) {
    const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-this-site${path}`, { headers: { cookie } });
    assert.equal(res.status, 404, path);
    assert.deepEqual(await res.json(), { error: "workspace was not found" }, path);
  }
});

test("change-sets get: an unknown change set id is 404 CHANGE_SET_NOT_FOUND", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/change-sets/does-not-exist`, { headers: { cookie } });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "change set was not found", code: "CHANGE_SET_NOT_FOUND" });
});

test("change-sets get: returns the header and every item as DTOs — revertible is derived and the inverse payload is never sent", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await deps.changeSets.insert({ record: changeSet({ actorId: "principal-7", intentRef: "intent-9" }), items: [
    item(),
    item({ id: "csi-2", entityId: "entity-2", operation: "create", inversePayload: undefined, entityVersionAtApply: undefined, position: 1 }),
  ] });

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/change-sets/cs-get-1`, { headers: { cookie } });
  const raw = await res.text();
  assert.equal(res.status, 200, raw);
  assert.ok(!raw.includes("secretField"), "the stored inverse payload must never cross the wire");

  const body = JSON.parse(raw) as { changeSet: unknown; items: Array<{ id: string }> };
  assert.deepEqual(body.changeSet, {
    id: "cs-get-1",
    workspaceId: WS,
    actorId: "principal-7",
    status: "applied",
    summary: "Update widget",
    intentRef: "intent-9",
    createdAt: "2026-08-20T00:00:00.000Z",
    appliedAt: "2026-08-20T00:00:01.000Z",
    revertedAt: null,
  });
  const byId = new Map(body.items.map((i) => [i.id, i]));
  assert.deepEqual(byId.get("csi-1"), {
    id: "csi-1",
    entityType: "widget",
    entityId: "entity-1",
    operation: "update",
    revertible: true,
    entityVersionAtApply: 3,
    position: 0,
  });
  assert.deepEqual(byId.get("csi-2"), {
    id: "csi-2",
    entityType: "widget",
    entityId: "entity-2",
    operation: "create",
    revertible: false,
    entityVersionAtApply: null,
    position: 1,
  });
});

test("change-sets list: returns this workspace's headers only, with no items attached", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await deps.changeSets.insert({ record: changeSet(), items: [item()] });
  await deps.changeSets.insert({ record: changeSet({ id: "cs-other-ws", workspaceId: "some-other-workspace" }), items: [] });

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/change-sets`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { changeSets: Array<Record<string, unknown>> };
  const ids = body.changeSets.map((c) => c.id);
  assert.ok(ids.includes("cs-get-1"));
  assert.ok(!ids.includes("cs-other-ws"), "another workspace's change set must not be listed");
  const listed = body.changeSets.find((c) => c.id === "cs-get-1");
  assert.equal(listed?.summary, "Update widget");
  assert.equal("items" in (listed ?? {}), false);
});

test("change-sets list + get: a repository failure is a 500 'internal error', never a hang or a leaked message", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  deps.changeSets.listByWorkspace = async () => {
    throw new Error("disk exploded at /var/secret/path");
  };
  deps.changeSets.findById = async () => {
    throw new Error("disk exploded at /var/secret/path");
  };

  for (const path of ["/change-sets", "/change-sets/cs-get-1"]) {
    const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}${path}`, { headers: { cookie } });
    assert.equal(res.status, 500, path);
    assert.deepEqual(await res.json(), { error: "internal error" }, path);
  }
});
