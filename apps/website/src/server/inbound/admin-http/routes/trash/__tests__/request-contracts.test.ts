import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { createSqliteTrashDb } from "#src/features/trash/db-port.sqlite";
import { buildTrashRegistry } from "#src/features/trash/registry";
import { registerAdminTrashListRoute } from "../list.js";
import { registerAdminTrashMoveToTrashRoute } from "../items.js";
import { registerAdminTrashPurgeRoute } from "../purge.js";
import { registerAdminTrashRestoreRoute } from "../restore.js";

const base = "/api/admin/v1/workspaces/:workspaceId/trash";
const now = "2026-10-01T12:00:00.000Z";
function harness(overrides: Record<string, unknown> = {}) {
  const app = express();
  const deps = { workspaceId: "ws-7", registry: new Map(), clock: { nowIso: () => now },
    authorize: async () => ({ allowed: true, reason: "matched" }), ...overrides } as any;
  registerAdminTrashListRoute(app, deps);
  registerAdminTrashMoveToTrashRoute(app, deps);
  registerAdminTrashPurgeRoute(app, deps);
  registerAdminTrashRestoreRoute(app, deps);
  return async (method: "get" | "post", suffix: string, body?: unknown, query: unknown = {}) => {
    const { res, capture } = createCapturingResponse();
    res.locals.principal = { id: "principal-7" };
    await extractRouteHandler(app, method, base + suffix)({ params: { workspaceId: "ws-7" }, query, body }, res);
    return capture;
  };
}
// F2.5/F3.6: port calls are the route contract; exact args reject ignored query/cursor/clock inputs.
test("trash list normalizes filters and cursor and clamps/defaults limits without changing pagination", async () => {
  for (const [query, expected] of [
    [{}, { entityTypes: undefined, limit: 50, cursor: null }],
    [{ limit: "999", entityTypes: " post, ,comment ", cursor: "opaque-next" }, { entityTypes: ["post", "comment"], limit: 200, cursor: "opaque-next" }],
    [{ limit: "17", entityTypes: [" post ", "comment"], cursor: "" }, { entityTypes: ["post", "comment"], limit: 17, cursor: null }],
    [{ limit: "0", entityTypes: " , ", cursor: ["invalid"] }, { entityTypes: undefined, limit: 50, cursor: null }],
    [{ limit: "-2" }, { entityTypes: undefined, limit: 50, cursor: null }],
    [{ limit: "invalid" }, { entityTypes: undefined, limit: 50, cursor: null }],
  ] as const) {
    let reads = 0;
    const invoke = harness({ trash: { list: async (input: unknown) => {
      reads++; assert.deepEqual(input, { workspaceId: "ws-7", now, ...expected });
      return { items: [], nextCursor: "continue-after-hidden-rows" };
    } }, userRepo: { list: async () => { throw new Error("empty pages must not query usernames"); } } });
    assert.deepEqual(await invoke("get", "", undefined, query), { statusCode: 200, jsonBody: { items: [], nextCursor: "continue-after-hidden-rows" } });
    assert.equal(reads, 1);
  }
});
test("trash list projects exact snapshot fields, actor lookup, and rounded days remaining", async () => {
  const invoke = harness({ trash: { list: async () => ({ items: [{
    id: "trash-9", workspaceId: "ws-7", entityType: "post", entityId: "post-8", displayTitle: "Deleted title", displaySubtitle: "deleted-slug",
    trashedAt: "2026-09-01T00:00:00.000Z", purgeAfter: "2026-10-03T13:00:00.000Z", actorPrincipalId: "principal-7", actorPluginId: "plugin-3", internal: "hidden",
  }], nextCursor: "next-9" }) }, userRepo: { list: async (input: unknown) => {
    assert.deepEqual(input, { workspaceId: "ws-7" }); return [{ principalId: "unrelated", username: "wrong" }, { principalId: "principal-7", username: "ada" }];
  } } });
  assert.deepEqual(await invoke("get", ""), { statusCode: 200, jsonBody: { items: [{
    id: "trash-9", entityType: "post", entityId: "post-8", title: "Deleted title", subtitle: "deleted-slug", trashedAt: "2026-09-01T00:00:00.000Z",
    purgeAfter: "2026-10-03T13:00:00.000Z", daysRemaining: 3, actorPrincipalId: "principal-7", actorPluginId: "plugin-3", actorUsername: "ada", actorIsSystem: false,
  }], nextCursor: "next-9" } });
});
// F4.4: each malformed selection breaks only the named input contract, after an allowed entry gate.
test("purge and restore reject oversized or malformed selections before any mutations", async () => {
  let writes = 0;
  const invoke = harness({ trash: { purgeSelected: async () => { writes++; return { purged: 1, results: [] }; }, restore: async () => { writes++; return "restored"; } } });
  for (const [suffix, bodies, message] of [
    ["/purge", [null, {}, { ids: "x" }, { ids: ["valid", ""] }, { ids: Array(201).fill("valid") }], "expected { ids: [string] } with 1..200 entries"],
    ["/restore", [null, {}, { items: "x" }, { items: [null] }, { items: [{ entityType: "post", entityId: "" }] }, { items: [{ entityType: "", entityId: "valid" }] }, { items: Array(201).fill({ entityType: "post", entityId: "valid" }) }], "expected { items: [{ entityType, entityId }] } with 1..200 entries"],
  ] as const) {
    for (const body of bodies) {
      assert.deepEqual(await invoke("post", suffix, body), { statusCode: 400, jsonBody: { error: message, code: "INVALID_INPUT" } });
    }
  }
  assert.equal(writes, 0);
});
test("purge accepts 200 ids, preserves duplicates, and returns every port outcome", async () => {
  const ids = Array.from({ length: 200 }, (_, n) => n === 199 ? "row-0" : `row-${n}`);
  const results = [{ id: "row-0", outcome: "purged" }, ...Array.from({ length: 198 }, (_, n) => ({ id: `row-${n + 1}`, outcome: "not-found" })), { id: "row-0", outcome: "already-gone" }];
  let writes = 0;
  const invoke = harness({ trash: { purgeSelected: async (input: any) => {
    writes++; assert.equal(input.workspaceId, "ws-7"); assert.deepEqual(input.ids, ids);
    assert.deepEqual(input.actor, { principalId: "principal-7" });
    assert.equal(await input.authorizeItem({ entityType: "post", entityId: "post-8" }), true);
    assert.equal(await input.authorizeItem({ entityType: "unregistered", entityId: "unknown" }), false);
    return { purged: 1, results };
  } } });
  assert.deepEqual(await invoke("post", "/purge", { ids }), { statusCode: 200, jsonBody: { purged: 1, results: [
    { id: "row-0", outcome: "purged" }, ...Array.from({ length: 198 }, (_, n) => ({ id: `row-${n + 1}`, outcome: "not-found" })), { id: "row-0", outcome: "already-gone" },
  ] } });
  assert.equal(writes, 1);
});
test("restore accepts 200 items and counts only restored outcomes while retaining duplicate results", async () => {
  const items = Array.from({ length: 200 }, () => ({ entityType: "post", entityId: "post-8" }));
  const outcomes = ["restored", ...Array(199).fill("not-found")];
  let writes = 0;
  const invoke = harness({ trash: { restore: async (input: unknown) => {
    assert.deepEqual(input, { workspaceId: "ws-7", entityType: "post", entityId: "post-8", at: now, actor: { principalId: "principal-7" } });
    return outcomes[writes++];
  } } });
  assert.deepEqual(await invoke("post", "/restore", { items }), { statusCode: 200, jsonBody: {
    restored: 1, results: [{ entityType: "post", entityId: "post-8", outcome: "restored" }, ...Array.from({ length: 199 }, () => ({ entityType: "post", entityId: "post-8", outcome: "not-found" }))],
  } });
  assert.equal(writes, 200);
});
test("move-to-trash rejects malformed type/id and identifies an unknown type", async () => {
  const invoke = harness();
  for (const body of [null, {}, { type: "form" }, { type: "", id: "valid" }, { type: "form", id: 9 }]) {
    assert.deepEqual(await invoke("post", "/items", body), { statusCode: 400, jsonBody: { error: "expected { type, id }", code: "INVALID_INPUT" } });
  }
  assert.deepEqual(await invoke("post", "/items", { type: "gizmo", id: "g-1" }), { statusCode: 404, jsonBody: { error: "'gizmo' is not a kind the Trash can hold", code: "TRASH_UNKNOWN_TYPE" } });
});
// F3.4: moveToTrash stays real; only the race-prone marker write port is injected.
test("move-to-trash maps a marker race to 409 TRASH_VERSION_CHANGED, leaving the live row intact", async (t) => {
  const db = openContentDb(":memory:");
  t.after(() => db.$client.close());
  db.$client.prepare("INSERT INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)").run("ws-7", "Site", "site", now);
  db.$client.prepare(`INSERT INTO form_definitions (id, workspace_id, name, slug, fields_json, notify_json, status, created_at, updated_at, deleted_at, version)
    VALUES ('form-7', 'ws-7', 'Contact', 'contact', '{"fields":[]}', '{"enabled":false,"recipients":[]}', 'active', ?, ?, NULL, 8)`).run(now, now);
  let writes = 0;
  const invoke = harness({ registry: buildTrashRegistry(), db: createSqliteTrashDb({ db }), trash: { trash: async (input: unknown) => {
    writes++; assert.deepEqual(input, { workspaceId: "ws-7", entityType: "form", entityId: "form-7", actor: { principalId: "principal-7" },
      display: { title: "Contact", subtitle: "contact" }, at: now, expectedVersion: 8 });
    return { ok: false, reason: "version-changed" };
  } } });
  assert.deepEqual(await invoke("post", "/items", { type: "form", id: "form-7" }), { statusCode: 409, jsonBody: { error: "the item changed since it was last read", code: "TRASH_VERSION_CHANGED" } });
  assert.equal(writes, 1);
  assert.deepEqual(db.$client.prepare("SELECT deleted_at, version FROM form_definitions WHERE id = 'form-7'").get(), { deleted_at: null, version: 8 });
});
test("unexpected failures on every trash route return generic 500 without details", async () => {
  const invoke = harness({ authorize: async () => { throw new Error("private evaluator details"); },
    registry: new Map([["form", { permission: "admin.forms.manage" }]]) });
  for (const [method, suffix, body] of [["get", "", undefined], ["post", "/purge", { ids: ["row-7"] }], ["post", "/restore", { items: [{ entityType: "post", entityId: "post-8" }] }], ["post", "/items", { type: "form", id: "form-7" }]] as const) {
    assert.deepEqual(await invoke(method, suffix, body), { statusCode: 500, jsonBody: { error: "internal error" } });
  }
});
