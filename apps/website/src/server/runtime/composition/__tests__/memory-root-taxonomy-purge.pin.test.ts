import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { test } from "node:test";

/**
 * @file Characterization pin (design 02 step 5, gap D-R2-4a): the in-memory root's `term` and `taxonomy`
 * Trash adapters are both SQL table adapters, so trashing and restoring cannot tell them apart. What
 * does differ is the purge follow-up each carries: a term purge enqueues `taxonomy.term_deleted`, a
 * taxonomy purge enqueues `taxonomy.deleted` with the member term ids. Swapping the two entries in the
 * adapter Map would pass every trash/restore test and fail only here. Driven through `routeDeps.trash`.
 */

const { createRouteDeps } = await import("../app.js");

const AT = "2026-11-17T10:00:00.000Z";
const ACTOR = { principalId: "pin-principal" };
const common = { status: "active", updatedAt: AT, version: 1 };

async function seeded() {
  const deps: any = createRouteDeps();
  await deps.taxonomyRepo.insert({ ...common, id: "tax-purge", name: "Colors", hierarchical: false });
  await deps.termRepo.insert({ ...common, id: "term-purge", name: "Red", taxonomyId: "tax-purge", parentId: null });
  return deps;
}

async function purgeOne(deps: any, entityType: string, entityId: string): Promise<void> {
  const workspaceId = deps.workspaceId as string;
  const trashed = await deps.trash.trash({ workspaceId, entityType, entityId, actor: ACTOR, display: { title: entityId }, at: AT, expectedVersion: 1 });
  assert.equal(trashed.ok, true, JSON.stringify(trashed));
  const page = await deps.trash.list({ workspaceId, now: AT, limit: 50 }, { entityTypes: [entityType] });
  const report = await deps.trash.purgeSelected({ workspaceId, ids: page.items.map((item: { id: string }) => item.id), actor: ACTOR, authorizeItem: async () => ({ ok: true }) });
  assert.equal(JSON.stringify(report).includes("purged"), true, JSON.stringify(report));
}

async function eventNames(deps: any): Promise<string[]> {
  const rows = await deps.outbox.claimPending({ batchSize: 1000, nowIso: "2999-01-01T00:00:00.000Z" });
  return rows.map((row: { event?: { name?: string }; name?: string }) => row.event?.name ?? row.name ?? "?").filter((name: string) => name.startsWith("taxonomy."));
}

test("memory root trash: purging a term runs the TERM purge follow-up (taxonomy.term_deleted), not the taxonomy one", async () => {
  const deps = await seeded();
  await purgeOne(deps, "term", "term-purge");
  assert.deepEqual(await eventNames(deps), ["taxonomy.term_deleted"]);
});

test("memory root trash: purging a taxonomy runs the TAXONOMY purge follow-up (taxonomy.deleted), not the term one", async () => {
  const deps = await seeded();
  await purgeOne(deps, "taxonomy", "tax-purge");
  assert.deepEqual(await eventNames(deps), ["taxonomy.deleted"]);
});
