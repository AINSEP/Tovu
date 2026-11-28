import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryEventBus } from "@jini-ai/infra/events/memory-bus";
import { REDIRECT_ENTITY_TYPE } from "@jini-ai/cms/trash/site/adapters/redirect";
import { composeRedirects } from "../redirects.js";

/** @file `composeRedirects`'s write deps: trash lookups and restores pre-bound to the redirect entity type, and the repo's own transaction. */

type Required = Parameters<typeof composeRedirects>[0];

function rig(t: test.TestContext, { trashed }: { trashed: boolean }) {
  const calls: [string, ...unknown[]][] = [];
  const registrations: (() => unknown)[] = [];
  t.after(async () => { for (const dispose of registrations.reverse()) await dispose(); });
  const redirectRepo = { transaction: (fn: unknown) => { calls.push(["transaction", fn]); return Promise.resolve("tx-result"); } };
  const required = {
    redirectRepo,
    trash: { restore: async (input: unknown, options: unknown) => { calls.push(["restore", input, options]); return "restored"; } },
    trashRepo: { findByEntity: async (input: unknown) => { calls.push(["findByEntity", input]); return trashed ? { id: "trash-row" } : null; } },
    originRegistry: {}, clock: { nowMs: () => 0, nowIso: () => "2026-11-20T00:00:00.000Z" }, idGen: { newId: () => "id-one" }, outbox: {},
    onStoreClose: async ({ registration }: { registration: (() => unknown) | Promise<() => unknown> }) => { registrations.push(await registration); },
    bus: new InMemoryEventBus(), redirectHitSink: {},
  } as unknown as Required;
  return { calls, deps: composeRedirects(required).redirectsWriteDeps, redirectRepo };
}

test("isInTrash looks the redirect up by workspace, redirect entity type and id, and answers whether a trash row exists", async t => {
  for (const trashed of [true, false]) {
    const { calls, deps } = rig(t, { trashed });
    assert.equal(await deps.isInTrash({ workspaceId: "ws-r", id: "redirect-7" }), trashed);
    assert.deepEqual(calls, [["findByEntity", { workspaceId: "ws-r", entityType: REDIRECT_ENTITY_TYPE, entityId: "redirect-7" }]]);
  }
});

test("restore restores the redirect entity through the trash service, passing the time and the acting principal", async t => {
  const { calls, deps } = rig(t, { trashed: true });
  const actor = { principalId: "editor-1" };
  assert.equal(await deps.restore({ workspaceId: "ws-r", id: "redirect-7", at: "2026-11-21T00:00:00.000Z", actor }), "restored");
  assert.deepEqual(calls, [["restore", { workspaceId: "ws-r", entityType: REDIRECT_ENTITY_TYPE, entityId: "redirect-7", at: "2026-11-21T00:00:00.000Z" }, { actor }]]);
});

test("transaction runs the work in the redirect repo's own transaction", async t => {
  const { calls, deps } = rig(t, { trashed: false });
  const work = async () => "work";
  assert.equal(await deps.transaction(work), "tx-result");
  assert.deepEqual(calls, [["transaction", work]]);
});
