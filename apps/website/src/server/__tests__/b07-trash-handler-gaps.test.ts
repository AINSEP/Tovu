import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import Database from "better-sqlite3";
import type { TrashItem, TrashPort } from "@jini-ai/cms/trash";
import { sqliteKernel } from "../../platform/db/kernel/drivers/sqlite.js";
import { buildTrashRegistry } from "../../features/trash/registry.js";
import { registerAdminTrashListRoute } from "../inbound/admin-http/routes/trash/list.js";
import { registerAdminTrashMoveToTrashRoute } from "../inbound/admin-http/routes/trash/items.js";
import { registerAdminTrashRestoreRoute } from "../inbound/admin-http/routes/trash/restore.js";
import { registerAdminTrashPurgeRoute } from "../inbound/admin-http/routes/trash/purge.js";
import type { TrashRouteDeps, TrashRouteRegistrar } from "../inbound/admin-http/routes/trash/deps.js";
import { createCapturingResponse, extractRouteHandler } from "./helpers/http-test-server.js";

// Author checklist: test the route's parsing/delivery/accounting, not the faked port's persistence.
// Real storage effects and per-kind authorization have HTTP siblings in admin-trash-routes.
// F2.1/F3.6: delivery is the promise here; every varying argument is checked outside the handler.
const WS = "ws-b07";
const AT = "2026-10-04T12:00:00.000Z";
const ROOT = "/api/admin/v1/workspaces/:workspaceId/trash";
const base = { workspaceId: WS, clock: { nowIso: () => AT }, registry: buildTrashRegistry(),
  authorize: async () => ({ allowed: true, reason: "granted" }) };

async function invoke(register: TrashRouteRegistrar, deps: object, suffix = "", body?: unknown, query: object = {}) {
  const app = express();
  register(app, { ...base, ...deps } as TrashRouteDeps);
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "operator-b07" };
  await extractRouteHandler(app, register === registerAdminTrashListRoute ? "get" : "post", `${ROOT}${suffix}`)(
    { params: { workspaceId: WS }, body, query }, res);
  return capture;
}

const snapshot: TrashItem = {
  id: "trash-row-7", workspaceId: WS, entityType: "redirect", entityId: "redirect-7",
  trashedAt: "2026-10-01T10:00:00.000Z", purgeAfter: "2026-10-06T13:00:00.000Z",
  actorPrincipalId: "deleter-7", actorPluginId: "plugin-7", displayTitle: "Old destination", displaySubtitle: "/old-path",
  entityVersion: 8, priorMarker: null,
};

// F4.1/F4.3: replacing parsed query arguments with defaults must fail exact delivery checks.
test("trash list parses string and repeated type filters, preserves cursors, and clamps page sizes", async () => {
  const cases = [
    [{ limit: "999", entityTypes: [" redirect, post ", "", "media"], cursor: "opaque-cursor-7" }, 200, ["redirect", "post", "media"], "opaque-cursor-7"],
    [{ limit: "7", entityTypes: "post, redirect", cursor: "next-9" }, 7, ["post", "redirect"], "next-9"],
    [{ limit: "0", entityTypes: " , ", cursor: "" }, 50, undefined, null],
    [{ limit: "bad", entityTypes: {}, cursor: ["ignored"] }, 50, undefined, null],
    [{ limit: "-3" }, 50, undefined, null],
    [{}, 50, undefined, null],
  ] as const;
  for (const [query, limit, entityTypes, cursor] of cases) {
    const calls: unknown[][] = [];
    let userReads = 0;
    const capture = await invoke(registerAdminTrashListRoute, {
      trash: { async list(...args: unknown[]) { calls.push(args); return { items: [], nextCursor: "server-next" }; } },
      userRepo: { async list() { userReads++; return []; } },
    }, "", undefined, query);
    assert.deepEqual(calls, [[{ workspaceId: WS, now: AT, limit }, { entityTypes, cursor }]]);
    assert.deepEqual(capture, { statusCode: 200, jsonBody: { items: [], nextCursor: "server-next" } });
    assert.equal(userReads, 0, "an empty page must not query user records");
  }
});

// F1.2: wrong daysRemaining, a lost subtitle, or a leaked storage column must fail the whole DTO.
test("trash list projects snapshot values and rounds remaining partial days upward", async () => {
  const reads: unknown[] = [];
  const capture = await invoke(registerAdminTrashListRoute, {
    trash: { list: async () => ({ items: [snapshot], nextCursor: "next-page" }) },
    userRepo: { async list(input: unknown) { reads.push(input); return [{ principalId: "deleter-7", username: "curator" }]; } },
  });
  assert.deepEqual(reads, [{ workspaceId: WS }]);
  assert.deepEqual(capture, { statusCode: 200, jsonBody: { items: [{
    id: "trash-row-7", entityType: "redirect", entityId: "redirect-7", title: "Old destination", subtitle: "/old-path",
    trashedAt: "2026-10-01T10:00:00.000Z", purgeAfter: "2026-10-06T13:00:00.000Z", daysRemaining: 3,
    actorPrincipalId: "deleter-7", actorPluginId: "plugin-7", actorUsername: "curator", actorIsSystem: false,
  }], nextCursor: "next-page" } });
});

test("trash list returns a generic error when the page or username lookup fails", async () => {
  for (const failUsers of [false, true]) {
    const reached: string[] = [];
    const capture = await invoke(registerAdminTrashListRoute, {
      trash: { async list() { reached.push("page"); if (!failUsers) throw new Error("private index path"); return { items: [snapshot], nextCursor: null }; } },
      userRepo: { async list() { reached.push("users"); throw new Error("private user table"); } },
    });
    assert.deepEqual(reached, failUsers ? ["page", "users"] : ["page"]);
    assert.deepEqual(capture, { statusCode: 500, jsonBody: { error: "internal error" } });
  }
});

// F4.4: invalid bodies have a valid workspace/principal and fail the named shape guard alone.
test("trash items rejects each malformed type/id body before attempting a domain operation", async () => {
  let operations = 0;
  const deps = { registry: { get() { operations++; return undefined; } } };
  for (const body of [undefined, null, 7, {}, { type: "", id: "valid" }, { type: 7, id: "valid" },
    { type: "form", id: "" }, { type: "form", id: 7 }, { type: "form" }]) {
    const capture = await invoke(registerAdminTrashMoveToTrashRoute, deps, "/items", body);
    assert.deepEqual(capture, { statusCode: 400, jsonBody: { error: "expected { type, id }", code: "INVALID_INPUT" } });
  }
  assert.equal(operations, 0);
  const valid = await invoke(registerAdminTrashMoveToTrashRoute, deps, "/items", { type: "missing-kind", id: "valid" });
  assert.equal(operations, 1);
  assert.deepEqual(valid, { statusCode: 404, jsonBody: { error: "'missing-kind' is not a kind the Trash can hold", code: "TRASH_UNKNOWN_TYPE" } });
});

// F3.4: the route and moveToTrash run for real. Only the lower marker-write port fails;
// a real SQLite snapshot prevents a fake query from accepting the wrong entity/workspace.
test("trash items maps a marker-write race to 409 and an unexpected write failure to a concealed 500", async (t) => {
  const client = new Database(":memory:");
  t.after(() => client.close());
  client.exec("CREATE TABLE form_definitions (id TEXT, workspace_id TEXT, name TEXT, slug TEXT, deleted_at TEXT, version INTEGER)");
  client.prepare("INSERT INTO form_definitions VALUES (?, ?, ?, ?, NULL, ?)").run("form-7", WS, "Signup form", "signup", 8);
  const db = sqliteKernel(client);
  const calls: unknown[] = [];
  for (const fail of [false, true]) {
    const capture = await invoke(registerAdminTrashMoveToTrashRoute, {
      db, trash: { async trash(input: unknown) {
        calls.push(input);
        if (fail) throw new Error("secret database location");
        return { ok: false, reason: "version-changed" };
      } },
    }, "/items", { type: "form", id: "form-7" });
    assert.deepEqual(capture, fail
      ? { statusCode: 500, jsonBody: { error: "internal error" } }
      : { statusCode: 409, jsonBody: { error: "the item changed since it was last read", code: "TRASH_VERSION_CHANGED" } });
  }
  assert.deepEqual(calls, [false, true].map(() => ({
    workspaceId: WS, entityType: "form", entityId: "form-7", actor: { principalId: "operator-b07" },
    display: { title: "Signup form", subtitle: "signup" }, at: AT, expectedVersion: 8,
  })));
  assert.deepEqual(client.prepare("SELECT deleted_at, version FROM form_definitions WHERE id = ?").get("form-7"), { deleted_at: null, version: 8 });
});

// F4.4/F6.2: exactly 200 is accepted, 201 is refused, duplicates are retained for reconciliation.
test("purge enforces selection bounds while delivering duplicate ids and the caller's actor intact", async () => {
  const calls: unknown[] = [];
  const deps = { trash: { async purgeSelected(input: Parameters<TrashPort["purgeSelected"]>[0]) {
    const { authorizeItem, ...selection } = input;
    calls.push(selection);
    assert.equal(typeof authorizeItem, "function");
    return { purged: 0, results: input.ids.map((id) => ({ id, outcome: "not-found" })) };
  } } };
  for (const body of [null, {}, { ids: [] }, { ids: ["row", ""] }, { ids: ["row", 7] }, { ids: Array(201).fill("row") }]) {
    assert.deepEqual(await invoke(registerAdminTrashPurgeRoute, deps, "/purge", body), {
      statusCode: 400, jsonBody: { error: "expected { ids: [string] } with 1..200 entries", code: "INVALID_INPUT" },
    });
  }
  assert.deepEqual(calls, []);
  for (const ids of [["same-row", "same-row"], Array(200).fill("row-at-limit")]) {
    const capture = await invoke(registerAdminTrashPurgeRoute, deps, "/purge", { ids });
    assert.deepEqual(capture, { statusCode: 200, jsonBody: { purged: 0, results: ids.map((id) => ({ id, outcome: "not-found" })) } });
  }
  assert.deepEqual(calls, [
    { workspaceId: WS, ids: ["same-row", "same-row"], actor: { principalId: "operator-b07" } },
    { workspaceId: WS, ids: Array(200).fill("row-at-limit"), actor: { principalId: "operator-b07" } },
  ]);
});

test("restore rejects a malformed member of a selection and accepts exactly the maximum selection", async () => {
  const calls: unknown[][] = [];
  const deps = { trash: { async restore(...args: unknown[]) { calls.push(args); return "not-found"; } } };
  const validItem = { entityType: "post", entityId: "post-7" };
  for (const body of [null, {}, { items: [] }, { items: [validItem, null] }, { items: [validItem, { entityType: "", entityId: "post-8" }] },
    { items: [validItem, { entityType: "post", entityId: 7 }] }, { items: Array(201).fill(validItem) }]) {
    assert.deepEqual(await invoke(registerAdminTrashRestoreRoute, deps, "/restore", body), {
      statusCode: 400, jsonBody: { error: "expected { items: [{ entityType, entityId }] } with 1..200 entries", code: "INVALID_INPUT" },
    });
  }
  assert.deepEqual(calls, []);
  const capture = await invoke(registerAdminTrashRestoreRoute, deps, "/restore", { items: Array(200).fill(validItem) });
  assert.deepEqual(capture, { statusCode: 200, jsonBody: { restored: 0, results: Array(200).fill({ entityType: "post", entityId: "post-7", outcome: "not-found" }) } });
  assert.deepEqual(calls, Array.from({ length: 200 }, () => [
    { workspaceId: WS, entityType: "post", entityId: "post-7", at: AT }, { actor: { principalId: "operator-b07" } },
  ]));
});

// F1.2/F4.1: restored must count successes only; every outcome remains aligned with its entity.
test("restore preserves per-item failure outcomes and uses one timestamp for the whole selection", async () => {
  const outcomes = new Map([ ["ok", "restored"], ["gone", "not-found"], ["changed", "version-changed"], ["uninstalled", "adapter-unavailable"] ]);
  const calls: unknown[][] = [];
  let ticks = 0;
  const capture = await invoke(registerAdminTrashRestoreRoute, {
    clock: { nowIso() { ticks++; return AT; } },
    trash: { async restore(input: { entityId: string }, optional: unknown) {
      calls.push([input, optional]);
      return outcomes.get(input.entityId);
    } },
  }, "/restore", { items: ["gone", "ok", "uninstalled", "changed"].map((entityId) => ({ entityType: "post", entityId })) });
  assert.equal(ticks, 1);
  assert.deepEqual(calls, ["gone", "ok", "uninstalled", "changed"].map((entityId) => [
    { workspaceId: WS, entityType: "post", entityId, at: AT }, { actor: { principalId: "operator-b07" } },
  ]));
  assert.deepEqual(capture, { statusCode: 200, jsonBody: { restored: 1, results: [
    { entityType: "post", entityId: "gone", outcome: "not-found" },
    { entityType: "post", entityId: "ok", outcome: "restored" },
    { entityType: "post", entityId: "uninstalled", outcome: "adapter-unavailable" },
    { entityType: "post", entityId: "changed", outcome: "version-changed" },
  ] } });
});
