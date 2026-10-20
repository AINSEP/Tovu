import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import type { MoveToTrashOutcome } from "#src/features/trash/index";
import type { TrashRouteDeps } from "../deps.js";
import { registerAdminTrashMoveToTrashRoute } from "../items.js";
import { registerAdminTrashRestoreRoute } from "../restore.js";

const now = "2026-10-01T12:00:00.000Z";
function unexpected(_required: object = {}, _options: object = {}): never { throw new Error("unexpected port call"); }
function harness(required: { suffix: "/items" | "/restore" }, options: Partial<TrashRouteDeps> = {}) {
  const app = express();
  const deps: TrashRouteDeps = {
    workspaceId: "ws-7", registry: new Map(), clock: { nowIso: () => now },
    authorize: async () => ({ allowed: true, reason: "matched" }),
    trash: { trash: unexpected, restore: unexpected, list: unexpected, purgeSelected: unexpected },
    db: { dialect: "sqlite", transport: "better-sqlite3", ready: Promise.resolve(),
      capabilities: { interactiveTransactions: true, atomicBatch: true, transactionalDdl: true, backup: false },
      run: unexpected, transaction: unexpected, lockKey: () => unexpected(), query: unexpected, execute: unexpected,
      inTransaction: unexpected, require: () => unexpected(), backupTo: () => unexpected(), close: unexpected },
    get userRepo(): TrashRouteDeps["userRepo"] { return unexpected(); },
  };
  // Assign only supplied fields; spreading the defaults would evaluate the unused userRepo getter.
  Object.defineProperties(deps, Object.getOwnPropertyDescriptors(options));
  registerAdminTrashMoveToTrashRoute(app, deps);
  registerAdminTrashRestoreRoute(app, deps);
  return async (input: { body?: unknown; workspaceId?: unknown; principal?: boolean }, _options: object = {}) => {
    const { res, capture } = createCapturingResponse();
    if (input.principal !== false) res.locals.principal = { id: "p-7" };
    await extractRouteHandler(app, "post", `/api/admin/v1/workspaces/:workspaceId/trash${required.suffix}`)(
      { params: { workspaceId: input.workspaceId }, body: input.body }, res);
    return capture;
  };
}

test("L255 workspace guards precede auth and body validation on both routes", async () => {
  for (const suffix of ["/items", "/restore"] as const) {
    const invoke = harness({ suffix }, { authorize: unexpected });
    for (const workspaceId of [undefined, null, "other"]) {
      assert.deepEqual(await invoke({ workspaceId, principal: false }), {
        statusCode: 404, jsonBody: { error: "workspace was not found" },
      });
    }
    assert.deepEqual(await invoke({ workspaceId: "ws-7", principal: false }), {
      statusCode: 500, jsonBody: { error: "internal error" },
    });
  }
});

test("L255 move rejects every malformed type and id without a port call", async () => {
  const invoke = harness({ suffix: "/items" });
  for (const body of [null, 1, {}, { type: 1, id: "i" }, { type: "", id: "i" }, { type: "t" }, { type: "t", id: 1 }, { type: "t", id: "" }]) {
    assert.deepEqual(await invoke({ workspaceId: "ws-7", body }), {
      statusCode: 400, jsonBody: { error: "expected { type, id }", code: "INVALID_INPUT" },
    });
  }
  assert.deepEqual(await invoke({ workspaceId: "ws-7", body: { type: "unknown", id: "i" } }), {
    statusCode: 404, jsonBody: { error: "'unknown' is not a kind the Trash can hold", code: "TRASH_UNKNOWN_TYPE" },
  });
});

test("L255 move maps every owned outcome and blocked message without an entry-screen gate", async () => {
  const cases: { outcome: MoveToTrashOutcome; status: number; body: unknown }[] = [
    { outcome: { ok: true, version: 9 }, status: 200, body: { ok: true, version: 9 } },
    { outcome: { ok: true, version: null }, status: 200, body: { ok: true, version: null } },
    { outcome: { ok: false, reason: "unknown-type" }, status: 404, body: { error: "' theme ' is not a kind the Trash can hold", code: "TRASH_UNKNOWN_TYPE" } },
    { outcome: { ok: false, reason: "not-found" }, status: 404, body: { error: "item was not found", code: "NOT_FOUND" } },
    { outcome: { ok: false, reason: "forbidden", permission: "theme.edit" }, status: 403, body: { error: "principal 'p-7' is not authorized for 'theme.edit'", code: "FORBIDDEN", details: { permission: "theme.edit" } } },
    { outcome: { ok: false, reason: "version-changed" }, status: 409, body: { error: "the item changed since it was last read", code: "TRASH_VERSION_CHANGED" } },
    ...[
      ["TERM_HAS_CHILDREN", "this term has 3 sub-terms — move them under another parent, or delete them permanently, first"],
      ["THEME_ACTIVE", "this is the site's active theme — switch to another theme first"],
      ["ALREADY_IN_TRASH", "an item with this id is already in the Trash — restore or permanently delete that one first"],
      ["OTHER", "this item cannot be moved to the Trash (OTHER)"],
    ].map(([code, error]) => ({ outcome: { ok: false, reason: "blocked", code, count: 3 } as const,
      status: 409, body: { error, code, count: 3 } })),
  ];
  for (const scenario of cases) {
    let moves = 0;
    const invoke = harness({ suffix: "/items" }, {
      authorize: async (input) => {
        assert.deepEqual(input, { principalId: "p-7", workspaceId: "ws-7", entityType: " theme ", entityId: " i ", permission: "theme.edit" });
        return { allowed: true, reason: "matched" };
      },
      movers: new Map([[" theme ", { permission: "theme.edit", move: async (input) => {
        moves++;
        assert.deepEqual(input, { workspaceId: "ws-7", entityId: " i ", actor: { principalId: "p-7" } });
        return scenario.outcome;
      } }]]),
    });
    assert.deepEqual(await invoke({ workspaceId: "ws-7", body: { type: " theme ", id: " i ", ignored: true } }), {
      statusCode: scenario.status, jsonBody: scenario.body,
    });
    assert.equal(moves, 1);
  }
});

test("L255 move preserves kind denial and masks unexpected failures", async () => {
  for (const throws of [false, true]) {
    const invoke = harness({ suffix: "/items" }, {
      authorize: async () => { if (throws) throw new Error("private"); return { allowed: false, reason: "no_grant" }; },
      movers: new Map([["theme", { permission: "theme.edit", move: unexpected }]]),
    });
    assert.deepEqual(await invoke({ workspaceId: "ws-7", body: { type: "theme", id: "i" } }), throws
      ? { statusCode: 500, jsonBody: { error: "internal error" } }
      : { statusCode: 403, jsonBody: { error: "principal 'p-7' is not authorized for 'theme.edit'", code: "FORBIDDEN", details: { permission: "theme.edit" } } });
  }
});

test("L255 restore entry denial precedes malformed selection validation", async () => {
  const invoke = harness({ suffix: "/restore" }, { authorize: async (input) => {
    assert.deepEqual(input, { principalId: "p-7", workspaceId: "ws-7", permission: "content.read" });
    return { allowed: false, reason: "no_grant" };
  } });
  assert.deepEqual(await invoke({ workspaceId: "ws-7", body: null }), { statusCode: 403, jsonBody: {
    error: "principal 'p-7' is not authorized for 'content.read' (no_grant)", code: "FORBIDDEN", details: { permission: "content.read", reason: "no_grant" },
  } });
});

test("L255 restore rejects every invalid selection and entry before restoring any row", async () => {
  const valid = { entityType: "post", entityId: "i" };
  const invoke = harness({ suffix: "/restore" });
  for (const body of [null, 1, {}, { items: "x" }, { items: [] }, { items: Array(201).fill(valid) },
    ...[null, 1, {}, { entityType: 1, entityId: "i" }, { entityType: "", entityId: "i" },
      { entityType: "post" }, { entityType: "post", entityId: 1 }, { entityType: "post", entityId: "" }].map((entry) => ({ items: [valid, entry] }))]) {
    assert.deepEqual(await invoke({ workspaceId: "ws-7", body }), { statusCode: 400, jsonBody: {
      error: "expected { items: [{ entityType, entityId }] } with 1..200 entries", code: "INVALID_INPUT",
    } });
  }
});

test("L255 restore preserves ordering, duplicate entries, whitespace, per-row gates and all outcomes", async () => {
  const items = ["unknown", "comment", "post", "post", "post", "post", "post"].map((entityType, i) => ({ entityType, entityId: i === 6 ? "  " : "i", ignored: true }));
  const outcomes = ["restored", "not-found", "version-changed", "adapter-unavailable", "restored"] as const;
  let writes = 0;
  let clocks = 0;
  const invoke = harness({ suffix: "/restore" }, {
    clock: { nowIso: () => { clocks++; return now; } },
    authorize: async (input) => ({ allowed: input.permission !== "comments.moderate", reason: "matched" }),
    trash: { trash: unexpected, list: unexpected, purgeSelected: unexpected, restore: async (input, options) => {
      assert.deepEqual(input, { workspaceId: "ws-7", entityType: "post", entityId: writes === 4 ? "  " : "i", at: now });
      assert.deepEqual(options, { actor: { principalId: "p-7" } });
      return outcomes[writes++];
    } },
  });
  assert.deepEqual(await invoke({ workspaceId: "ws-7", body: { items } }), { statusCode: 200, jsonBody: {
    restored: 2, results: items.map(({ entityType, entityId }, i) => ({ entityType, entityId, outcome: ["forbidden", "forbidden", ...outcomes][i] })),
  } });
  assert.equal(writes, 5);
  assert.equal(clocks, 1);
});

test("L255 restore accepts the maximum selection and returns 200 when all rows are forbidden", async () => {
  const item = { entityType: "unknown", entityId: "i" };
  const invoke = harness({ suffix: "/restore" });
  assert.deepEqual(await invoke({ workspaceId: "ws-7", body: { items: Array(200).fill(item) } }), {
    statusCode: 200, jsonBody: { restored: 0, results: Array(200).fill({ ...item, outcome: "forbidden" }) },
  });
});
