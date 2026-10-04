// The local in-memory trash fork and its test lane moved to @jini-ai/cms/trash.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { contentKernel, type ContentKernel } from "#src/platform/db/content-kernel";
import { eachDialect, heldUntil } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { SqlTrashRepo } from "../repo.js";
import { SqliteTrashRepo } from "../repo.sqlite.js";
import type { TrashItem, TrashRepoPort } from "@jini-ai/cms/trash";

/**
 * @file Persistent contract suite for `TrashRepoPort`; the memory lane moved to Jini
 * `cms/src/trash/__tests__/repo.memory.test.ts` with these same assertions. Mirrors
 * `contracts/core/entry-refs/__tests__/repo.contract.test.ts`'s shape.
 *
 * `SqlTrashRepo` (the one Kysely body) also runs on every dialect of the kernel's matrix.
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
    await repo.insert({ row: item({ id: "t1", entityId: "post-1" }) });
    await repo.insert({ row: item({ id: "t2", entityId: "post-1", displayTitle: "Second attempt" }) });

    const page = await repo.list({ workspaceId: WS, now: "2026-09-02T00:00:00.000Z", limit: 50 });
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0]?.id, "t1");
    assert.equal(page.items[0]?.displayTitle, "A post", "the first row wins; the second is ignored, not merged");
  });

  test(`[${adapterName}] list hides expired rows the instant it opens, with no sweeper involved`, async () => {
    const repo = makeRepo();
    await repo.insert({ row: item({ id: "live", entityId: "post-1", purgeAfter: "2026-12-01T00:00:00.000Z" }) });
    await repo.insert({ row: item({ id: "expired", entityId: "post-2", purgeAfter: "2026-09-01T00:00:00.000Z" }) });

    const page = await repo.list({ workspaceId: WS, now: "2026-09-02T00:00:00.000Z", limit: 50 });
    assert.deepEqual(page.items.map((i) => i.id), ["live"]);
  });

  test(`[${adapterName}] list is workspace-scoped, newest first, and filterable by entity type`, async () => {
    const repo = makeRepo();
    await repo.insert({ row: item({ id: "a", entityId: "post-1", trashedAt: "2026-09-01T00:00:00.000Z" }) });
    await repo.insert({ row: item({ id: "b", entityId: "red-1", entityType: "redirect", trashedAt: "2026-09-03T00:00:00.000Z" }) });
    await repo.insert({ row: item({ id: "c", entityId: "post-9", workspaceId: WS2 }) });

    const all = await repo.list({ workspaceId: WS, now: "2026-09-04T00:00:00.000Z", limit: 50 });
    assert.deepEqual(all.items.map((i) => i.id), ["b", "a"]);

    const posts = await repo.list({ workspaceId: WS, now: "2026-09-04T00:00:00.000Z", limit: 50}, { entityTypes: ["post"]});
    assert.deepEqual(posts.items.map((i) => i.id), ["a"]);
  });

  test(`[${adapterName}] keyset pagination walks every row exactly once`, async () => {
    const repo = makeRepo();
    for (let n = 1; n <= 5; n += 1) {
      await repo.insert({ row: item({ id: `t${n}`, entityId: `post-${n}`, trashedAt: `2026-09-0${n}T00:00:00.000Z` }) });
    }
    for (const id of ["t2a", "t2c", "t2b", "t2d"]) {
      await repo.insert({ row: item({ id, entityId: `post-${id}`, trashedAt: "2026-09-02T00:00:00.000Z" }) });
    }

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page: { items: TrashItem[]; nextCursor: string | null } = await repo.list({
        workspaceId: WS,
        now: "2026-09-10T00:00:00.000Z",
        limit: 2}, {
        cursor});
      seen.push(...page.items.map((i) => i.id));
      assert.ok(page.items.length <= 2);
      assert.ok(seen.length <= 9, "pagination must terminate without repeating rows");
      cursor = page.nextCursor;
    } while (cursor);

    assert.deepEqual(seen, ["t5", "t4", "t3", "t2d", "t2c", "t2b", "t2a", "t2", "t1"]);
  });

  test(`[${adapterName}] claimDue takes only due, unleased rows — and a second claimer gets nothing`, async () => {
    const repo = makeRepo();
    await repo.insert({ row: item({ id: "due", entityId: "post-1", purgeAfter: "2026-09-01T00:00:00.000Z" }) });
    await repo.insert({ row: item({ id: "not-due", entityId: "post-2", purgeAfter: "2026-12-01T00:00:00.000Z" }) });

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
    await repo.insert({ row: item({ id: "due", entityId: "post-1", purgeAfter: "2026-09-01T00:00:00.000Z" }) });
    await repo.claimDue({ now: "2026-09-02T00:00:00.000Z", leaseOwner: "crashed", leaseUntil: "2026-09-02T00:05:00.000Z", limit: 10 });

    const reclaimed = await repo.claimDue({
      now: "2026-09-02T00:06:00.000Z",
      leaseOwner: "sweeper-b",
      leaseUntil: "2026-09-02T00:11:00.000Z",
      limit: 10,
    });
    assert.deepEqual(reclaimed.map((c) => c.id), ["due"]);
  });

  test(`[${adapterName}] claimDue includes the exact expiry boundary and respects the batch limit`, async () => {
    const repo = makeRepo();
    const now = "2026-09-02T00:00:00.000Z";
    await repo.insert({ row: item({ id: "earlier", entityId: "post-earlier", purgeAfter: "2026-09-01T00:00:00.000Z" }) });
    await repo.insert({ row: item({ id: "boundary", entityId: "post-boundary", purgeAfter: now }) });
    await repo.insert({ row: item({ id: "later", entityId: "post-later", purgeAfter: "2026-09-02T00:00:00.001Z" }) });
    const args = { now, leaseOwner: "a", leaseUntil: "2026-09-02T00:05:00.000Z", limit: 1 };
    assert.deepEqual((await repo.claimDue(args)).map((row) => row.id), ["earlier"]);
    assert.deepEqual((await repo.claimDue(args)).map((row) => row.id), ["boundary"]);
    assert.deepEqual(await repo.claimDue(args), []);
  });

  test(`[${adapterName}] releaseLease hands a stood-down row back to the next pass`, async () => {
    const repo = makeRepo();
    await repo.insert({ row: item({ id: "due", entityId: "post-1", purgeAfter: "2026-09-01T00:00:00.000Z" }) });
    await repo.claimDue({ now: "2026-09-02T00:00:00.000Z", leaseOwner: "a", leaseUntil: "2026-09-02T00:05:00.000Z", limit: 10 });
    await repo.releaseLease({ id: "due" });

    const again = await repo.claimDue({ now: "2026-09-02T00:01:00.000Z", leaseOwner: "b", leaseUntil: "2026-09-02T00:06:00.000Z", limit: 10 });
    assert.deepEqual(again.map((c) => c.id), ["due"]);
  });

  test(`[${adapterName}] findByIds and deleteById are workspace-scoped`, async () => {
    const repo = makeRepo();
    await repo.insert({ row: item({ id: "mine", entityId: "post-1" }) });
    await repo.insert({ row: item({ id: "theirs", entityId: "post-2", workspaceId: WS2 }) });

    assert.deepEqual((await repo.findByIds({ workspaceId: WS, ids: ["mine", "theirs"] })).map((r) => r.id), ["mine"]);

    await repo.deleteById({ workspaceId: WS, id: "theirs" });
    assert.notEqual(await repo.findByEntity({ workspaceId: WS2, entityType: "post", entityId: "post-2" }), null);
  });
}

test("overlapping claims on independent SQLite connections lease disjoint batches", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "trash-overlap-"));
  const file = path.join(root, "content.db");
  const db = openContentDb(file);
  const a = (db as unknown as { $client: Database.Database }).$client;
  const b = new Database(file);
  t.after(() => { b.close(); a.close(); fs.rmSync(root, { recursive: true, force: true }); });
  seedWorkspaces(a);
  const kernelA = contentKernel(a);
  const kernelB = contentKernel(b);
  let selected!: () => void;
  let release!: () => void;
  const firstSelected = new Promise<void>((resolve) => { selected = resolve; });
  const held = new Promise<void>((resolve) => { release = resolve; });
  let pause = true;
  const heldKernel: ContentKernel = {
    ...kernelA,
    run: (async (fn) => {
      const result = await kernelA.run(fn);
      if (pause && Array.isArray(result) && result.length > 0 && "entity_version" in result[0]) {
        pause = false;
        selected();
        await held;
      }
      return result;
    }) as ContentKernel["run"],
  };
  const firstRepo = new SqlTrashRepo(heldKernel);
  const secondRepo = new SqlTrashRepo(kernelB);
  for (let n = 1; n <= 4; n += 1) {
    await firstRepo.insert({ row: item({ id: `due-${n}`, entityId: `post-${n}`, purgeAfter: `2026-09-0${n}T00:00:00.000Z` }) });
  }
  const args = { now: "2026-09-05T00:00:00.000Z", leaseUntil: "2026-09-05T00:05:00.000Z", limit: 2 };
  const first = firstRepo.claimDue({ ...args, leaseOwner: "a" });
  await firstSelected;
  const second = secondRepo.claimDue({ ...args, leaseOwner: "b" });
  release();
  const [left, right] = await Promise.all([first, second]);
  assert.deepEqual(left.map((row) => row.id), ["due-1", "due-2"]);
  assert.deepEqual(right.map((row) => row.id), ["due-3", "due-4"]);
  assert.equal(new Set([...left, ...right].map((row) => row.id)).size, 4);
});

runSuite("SqliteTrashRepo", () => {
  const db = openContentDb(":memory:");
  const client = (db as unknown as { $client: Database.Database }).$client;
  seedWorkspaces(client);
  return new SqliteTrashRepo(client);
});

/** `kernel` with the two workspaces seeded before its first call. */
function withWorkspaces(kernel: ContentKernel): ContentKernel {
  const seeded = kernel.run((db) =>
    db
      .insertInto("workspaces")
      .values([WS, WS2].map((id) => ({ id, name: id, slug: id, created_at: "2026-01-01T00:00:00.000Z" })))
      .onConflict((oc) => oc.doNothing())
      .execute()
  );
  return heldUntil(kernel, seeded.then(() => undefined));
}

for (const each of eachDialect({ tables: ["workspaces", "trashed_items"], make: (kernel) => new SqlTrashRepo(withWorkspaces(kernel)) })) {
  runSuite(`SqlTrashRepo ${each.name}`, each.make);
}
