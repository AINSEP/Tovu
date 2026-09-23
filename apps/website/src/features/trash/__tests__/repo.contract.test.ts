import assert from "node:assert/strict";
import test from "node:test";
import type Database from "better-sqlite3";

import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { InMemoryTrashRepo } from "../repo.memory.js";
import { SqliteTrashRepo } from "../repo.sqlite.js";
import type { TrashItem, TrashRepoPort } from "../ports.js";

/**
 * @file Shared contract suite for `TrashRepoPort`, run against BOTH adapters — mirrors
 * `contracts/core/entry-refs/__tests__/repo.contract.test.ts`'s shape.
 *
 * Running both matters more than usual here: the in-memory double is what the write-service tests
 * use, so a divergence between it and the real SQL (ordering, the lazy `purge_after` filter, the
 * keyset cursor, `INSERT OR IGNORE` idempotency, the claim lease) would make every green service
 * test meaningless on the running server.
 */

const WS = "workspace-1";
const WS2 = "workspace-2";

function item(overrides: Partial<TrashItem> & Pick<TrashItem, "id" | "entityId">): TrashItem {
  return {
    workspaceId: WS,
    entityType: "post",
    trashedAt: "2026-09-01T00:00:00.000Z",
    purgeAfter: "2026-10-31T00:00:00.000Z",
    actorPrincipalId: "principal-1",
    actorPluginId: null,
    displayTitle: "A post",
    displaySubtitle: "a-post",
    entityVersion: 3,
    priorMarker: null,
    ...overrides,
  };
}

/** The SQLite adapter needs real `workspaces` rows — `trashed_items.workspace_id` is a real FK
 *  with `foreign_keys = ON`, and that FK is the one the design deliberately kept. */
function seedWorkspaces(client: Database.Database): void {
  for (const id of [WS, WS2]) {
    client
      .prepare(`INSERT OR IGNORE INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)`)
      .run(id, id, id, "2026-01-01T00:00:00.000Z");
  }
}

function runSuite(adapterName: string, makeRepo: () => TrashRepoPort) {
  test(`[${adapterName}] insert is idempotent on (workspace, entity_type, entity_id) — re-trashing never duplicates`, async () => {
    const repo = makeRepo();
    await repo.insert(item({ id: "t1", entityId: "post-1" }));
    await repo.insert(item({ id: "t2", entityId: "post-1", displayTitle: "Second attempt" }));

    const page = await repo.list({ workspaceId: WS, now: "2026-09-02T00:00:00.000Z", limit: 50 });
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0]?.id, "t1");
    assert.equal(page.items[0]?.displayTitle, "A post", "the first row wins; the second is ignored, not merged");
  });

  test(`[${adapterName}] list hides expired rows the instant it opens, with no sweeper involved`, async () => {
    const repo = makeRepo();
    await repo.insert(item({ id: "live", entityId: "post-1", purgeAfter: "2026-12-01T00:00:00.000Z" }));
    await repo.insert(item({ id: "expired", entityId: "post-2", purgeAfter: "2026-09-01T00:00:00.000Z" }));

    const page = await repo.list({ workspaceId: WS, now: "2026-09-02T00:00:00.000Z", limit: 50 });
    assert.deepEqual(page.items.map((i) => i.id), ["live"]);
  });

  test(`[${adapterName}] list is workspace-scoped, newest first, and filterable by entity type`, async () => {
    const repo = makeRepo();
    await repo.insert(item({ id: "a", entityId: "post-1", trashedAt: "2026-09-01T00:00:00.000Z" }));
    await repo.insert(item({ id: "b", entityId: "red-1", entityType: "redirect", trashedAt: "2026-09-03T00:00:00.000Z" }));
    await repo.insert(item({ id: "c", entityId: "post-9", workspaceId: WS2 }));

    const all = await repo.list({ workspaceId: WS, now: "2026-09-04T00:00:00.000Z", limit: 50 });
    assert.deepEqual(all.items.map((i) => i.id), ["b", "a"]);

    const posts = await repo.list({ workspaceId: WS, now: "2026-09-04T00:00:00.000Z", limit: 50, entityTypes: ["post"] });
    assert.deepEqual(posts.items.map((i) => i.id), ["a"]);
  });

  test(`[${adapterName}] keyset pagination walks every row exactly once`, async () => {
    const repo = makeRepo();
    for (let n = 1; n <= 5; n += 1) {
      await repo.insert(item({ id: `t${n}`, entityId: `post-${n}`, trashedAt: `2026-09-0${n}T00:00:00.000Z` }));
    }

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page: { items: TrashItem[]; nextCursor: string | null } = await repo.list({
        workspaceId: WS,
        now: "2026-09-10T00:00:00.000Z",
        limit: 2,
        cursor,
      });
      seen.push(...page.items.map((i) => i.id));
      cursor = page.nextCursor;
    } while (cursor);

    assert.deepEqual(seen, ["t5", "t4", "t3", "t2", "t1"]);
  });

  test(`[${adapterName}] claimDue takes only due, unleased rows — and a second claimer gets nothing`, async () => {
    const repo = makeRepo();
    await repo.insert(item({ id: "due", entityId: "post-1", purgeAfter: "2026-09-01T00:00:00.000Z" }));
    await repo.insert(item({ id: "not-due", entityId: "post-2", purgeAfter: "2026-12-01T00:00:00.000Z" }));

    const first = await repo.claimDue({
      now: "2026-09-02T00:00:00.000Z",
      leaseOwner: "sweeper-a",
      leaseUntil: "2026-09-02T00:05:00.000Z",
      limit: 10,
    });
    assert.deepEqual(first.map((c) => c.id), ["due"]);

    const second = await repo.claimDue({
      now: "2026-09-02T00:01:00.000Z",
      leaseOwner: "sweeper-b",
      leaseUntil: "2026-09-02T00:06:00.000Z",
      limit: 10,
    });
    assert.deepEqual(second, [], "a live lease keeps a second sweeper off the row");
  });

  test(`[${adapterName}] an expired lease is reclaimable — this is the crash recovery`, async () => {
    const repo = makeRepo();
    await repo.insert(item({ id: "due", entityId: "post-1", purgeAfter: "2026-09-01T00:00:00.000Z" }));
    await repo.claimDue({ now: "2026-09-02T00:00:00.000Z", leaseOwner: "crashed", leaseUntil: "2026-09-02T00:05:00.000Z", limit: 10 });

    const reclaimed = await repo.claimDue({
      now: "2026-09-02T00:06:00.000Z",
      leaseOwner: "sweeper-b",
      leaseUntil: "2026-09-02T00:11:00.000Z",
      limit: 10,
    });
    assert.deepEqual(reclaimed.map((c) => c.id), ["due"]);
  });

  test(`[${adapterName}] releaseLease hands a stood-down row back to the next pass`, async () => {
    const repo = makeRepo();
    await repo.insert(item({ id: "due", entityId: "post-1", purgeAfter: "2026-09-01T00:00:00.000Z" }));
    await repo.claimDue({ now: "2026-09-02T00:00:00.000Z", leaseOwner: "a", leaseUntil: "2026-09-02T00:05:00.000Z", limit: 10 });
    await repo.releaseLease({ id: "due" });

    const again = await repo.claimDue({ now: "2026-09-02T00:01:00.000Z", leaseOwner: "b", leaseUntil: "2026-09-02T00:06:00.000Z", limit: 10 });
    assert.deepEqual(again.map((c) => c.id), ["due"]);
  });

  test(`[${adapterName}] findByIds and deleteById are workspace-scoped`, async () => {
    const repo = makeRepo();
    await repo.insert(item({ id: "mine", entityId: "post-1" }));
    await repo.insert(item({ id: "theirs", entityId: "post-2", workspaceId: WS2 }));

    assert.deepEqual((await repo.findByIds({ workspaceId: WS, ids: ["mine", "theirs"] })).map((r) => r.id), ["mine"]);

    await repo.deleteById({ workspaceId: WS, id: "theirs" });
    assert.notEqual(await repo.findByEntity({ workspaceId: WS2, entityType: "post", entityId: "post-2" }), null);
  });
}

runSuite("InMemoryTrashRepo", () => new InMemoryTrashRepo());
runSuite("SqliteTrashRepo", () => {
  const db = openContentDb(":memory:");
  const client = (db as unknown as { $client: Database.Database }).$client;
  seedWorkspaces(client);
  return new SqliteTrashRepo(client);
});
