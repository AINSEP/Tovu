import assert from "node:assert/strict";
import test from "node:test";

import { ToolInputError, ToolPermissionDeniedError, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";
import type { TrashEntityType } from "@jini-ai/cms/trash";

import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { deriveTrashItemRegistrations, type TrashItemToolDeps, type TrashUserPort, type TrashItemDelegate } from "#src/features/trash/trash-item-tool";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { buildTrashRegistry } from "../registry.js";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { createSqliteTrashDb } from "../db-port.sqlite.js";
import { createTableTrashAdapter } from "../table-adapter.js";
import { createTrashService, InMemoryTrashRepo } from "@jini-ai/cms/trash";


/**
 * @file `trash_item`'s `user` kind (2026-10-05, capability gap U-06): `identity_user_delete` needs the
 * user in the Trash first, and `trash_item` had no way to put one there. The kind is reachable only
 * through the injected {@link TrashUserPort} (bound in production to the Users screen's own
 * `trashUser`; that binding is covered by `server/runtime/composition/__tests__/trash-user-tool-port.test.ts`).
 */

const CALLER = "principal-caller";

/** Route deps with no delegates and no registry, so `user` is the only kind that can be reachable. */
function routeDeps(trashable: (entityType: TrashEntityType) => boolean = () => true): TrashItemToolDeps {
  return {
    authorize: async () => ({ allowed: false, reason: "insufficient_permission" }),
    workspaceId: "ws-trash-user",
    isTrashableEntityType: trashable,
    registry: new Map(),
  } as unknown as TrashItemToolDeps;
}

function derive(deps: TrashItemToolDeps, trashUser?: TrashUserPort): ToolRegistration[] {
  return deriveTrashItemRegistrations(
    { registrations: [], routeDeps: deps, surfaces: { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) } },
    trashUser ? { trashUser } : {}
  );
}

function call(registration: ToolRegistration, input: unknown) {
  return registration.handler({
    executionId: "exec-1",
    principal: { id: CALLER },
    run: { id: "run-1" },
    input,
    signal: new AbortController().signal,
  } as ToolExecutionContext);
}

function enumOf(registration: ToolRegistration): string[] {
  return (registration.descriptor.inputSchema as { properties: { entityType: { enum: string[] } } }).properties.entityType.enum;
}

test("with a trashUser port, 'user' is an accepted kind and the call hands the id and the caller to the port", async () => {
  const calls: unknown[] = [];
  const [trashItem] = derive(routeDeps(), async (required) => {
    calls.push(required);
    return { noop: false };
  });
  assert.deepEqual(enumOf(trashItem), ["user"]);

  const result = await call(trashItem, { entityType: "user", entityId: "principal-jane" });

  assert.deepEqual(calls, [{ principalId: "principal-jane", callerPrincipalId: CALLER }]);
  assert.deepEqual(result, {
    entityType: "user",
    entityId: "principal-jane",
    via: "trashUser",
    outcome: { trashed: true, cancelled: false, alreadyInTrash: false },
  });
});

test("a user already in the Trash reports alreadyInTrash: true", async () => {
  const [trashItem] = derive(routeDeps(), async () => ({ noop: true }));
  const result = (await call(trashItem, { entityType: "user", entityId: "principal-jane" })) as { outcome: unknown };
  assert.deepEqual(result.outcome, { trashed: true, cancelled: false, alreadyInTrash: true });
});

test("a refusal from the port reaches the model unchanged", async () => {
  const refusal = new ToolInputError({ message: "trash_item: you cannot delete your own account. Nothing was changed." });
  const [trashItem] = derive(routeDeps(), async () => {
    throw refusal;
  });
  await assert.rejects(call(trashItem, { entityType: "user", entityId: CALLER }), (error) => error === refusal);
});

test("without a trashUser port, 'user' is not accepted and nothing is registered for it", () => {
  assert.deepEqual(derive(routeDeps()), []);
});

test("with no live user Trash adapter, 'user' is refused with an exact error and the port is never called", async () => {
  let called = false;
  const [trashItem] = derive(
    routeDeps((entityType) => entityType !== "user"),
    async () => {
      called = true;
      return { noop: false };
    }
  );
  await assert.rejects(call(trashItem, { entityType: "user", entityId: "principal-jane" }), {
    message: "trash_item: 'user' is not a kind of thing the Trash can hold. Expected one of: . Nothing was changed.",
  });
  assert.equal(called, false);
});

test("a missing entityId is refused before the port is called", async () => {
  let called = false;
  const [trashItem] = derive(routeDeps(), async () => {
    called = true;
    return { noop: false };
  });
  await assert.rejects(call(trashItem, { entityType: "user" }), { message: "'entityId' (non-empty string) is required; received: entityType" });
  assert.equal(called, false);
});

test("delegate indexing skips absent tools, preserves delegate precedence and forwards execution options", async () => {
  const [template] = derive(routeDeps(), async () => ({ noop: false }));
  const events: unknown[] = [];
  const delegates = new Map<string, TrashItemDelegate>([
    ["form", { entityType: "form", toolId: "l128-delete", permission: "l128.delete",
      toDelegateInput: async (_deps, id) => ({ resolved: id }) }],
    ["missing", { entityType: "missing", toolId: "not-registered", permission: "missing.delete",
      toDelegateInput: async () => { throw new Error("unregistered delegate must not resolve"); } }],
  ]);
  const deps: TrashItemToolDeps = { ...routeDeps(), registry: buildTrashRegistry(),
    authorize: async (required) => { events.push(required.permission); return { allowed: true, reason: "matched" }; } };
  const [registration] = deriveTrashItemRegistrations({
    registrations: [{ ...template, descriptor: { ...template.descriptor, id: "l128-delete" },
      handler: async (ctx, options) => { events.push(ctx.input, options); return { delegated: true }; } }],
    routeDeps: deps,
    surfaces: { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) },
  }, { delegates });
  assert.deepEqual(enumOf(registration), ["form", ...[...deps.registry.keys()].filter((kind) => kind !== "form")]);
  const ctx: ToolExecutionContext = { executionId: "l128", principal: { id: CALLER }, run: { id: "run-1" },
    signal: new AbortController().signal, input: { entityType: "form", entityId: "f1" } };
  const options = {};
  assert.deepEqual(await registration.handler(ctx, options), { entityType: "form", entityId: "f1", via: "l128-delete", outcome: { delegated: true } });
  assert.deepEqual(events, ["l128.delete", { resolved: "f1" }, options]);
  assert.equal(events[2], options);
});

for (const state of ["live", "missing", "denied"] as const) {
  test(`generic trash_item ${state} pins the shared live snapshot read and permission-before-read contract`, async (t) => {
    const db = openContentDb(":memory:");
    t.after(() => db.$client.close());
    const workspaceId = "l128-generic";
    const at = "2026-10-20T12:00:00.000Z";
    db.$client.prepare("INSERT INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)").run(workspaceId, workspaceId, workspaceId, at);
    db.$client.prepare(`INSERT INTO form_definitions
      (id, workspace_id, name, slug, fields_json, notify_json, status, created_at, updated_at, version)
      VALUES ('f1', ?, 'Contact', 'contact', '{}', '{}', 'active', ?, ?, 1)`).run(workspaceId, at, at);
    const registry = new Map([["form", buildTrashRegistry().get("form")!]]);
    const kernel = createSqliteTrashDb({ db });
    const adapter = createTableTrashAdapter({ db: kernel, entry: registry.get("form")! });
    const trash = createTrashService({ repo: new InMemoryTrashRepo({}), adapters: new Map([["form", adapter]]),
      idGen: { newId: () => "l128-trash" }, entityPolicy: ({ entityType }) => registry.has(entityType),
      transaction: ({ work }) => kernel.transaction(work) });
    const deps: TrashItemToolDeps = { workspaceId, registry, trash,
      postRepo: { findById: async () => { throw new Error("generic kinds must not read posts"); } },
      commentRepo: { findById: async () => { throw new Error("generic kinds must not read comments"); } },
      commentsReady: Promise.resolve(), isTrashableEntityType: (kind) => registry.has(kind), clock: { nowIso: () => at },
      authorize: async () => state === "denied" ? { allowed: false, reason: "insufficient_permission" } : { allowed: true, reason: "matched" },
      db: state === "denied" ? new Proxy(kernel, { get() { throw new Error("denied calls must not read"); } }) : kernel };
    const [registration] = derive(deps);
    const entityId = state === "missing" ? "absent" : "f1";
    if (state === "live") {
      assert.deepEqual(await call(registration, { entityType: "form", entityId }), {
        entityType: "form", entityId, via: "moveToTrash", outcome: { trashed: true, cancelled: false, version: 2 },
      });
      const page = await trash.list({ workspaceId, now: at, limit: 10 });
      assert.equal(page.items[0]?.displayTitle, "Contact");
      assert.equal(page.items[0]?.actorPluginId, "assistant");
    } else {
      // why: the permission gate throws the kernel's denial class, never an input error; a missing row stays ToolInputError.
      await assert.rejects(call(registration, { entityType: "form", entityId }), state === "denied" ? ToolPermissionDeniedError : ToolInputError);
      assert.equal((await trash.list({ workspaceId, now: at, limit: 10 })).items.length, 0);
      assert.deepEqual(db.$client.prepare("SELECT deleted_at, version FROM form_definitions WHERE id = 'f1'").get(), { deleted_at: null, version: 1 });
    }
  });
}
