import assert from "node:assert/strict";
import { test } from "node:test";

import { sql } from "kysely";

import { eachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { EntrySlugConflictError, updateEntry, VersionConflictError } from "../../index.js";
import type { EntryRecord, EntryRepoPort } from "../../index.js";
import { SqlEntryRepo } from "../../repo.js";
import { TrashAwareInMemoryEntryRepo } from "../../trash-aware-memory-repo.js";

/**
 * @file Entry writes are compare-and-set (wm S3): `EntryRepoPort.save(row, { expectedVersion })`
 * lands only on the live row still holding that version, on every Tovu adapter — the one Kysely body
 * (`repo.ts`) on SQLite and PGlite, and the hermetic `TrashAwareInMemoryEntryRepo`. Real-Postgres
 * row-lock contention lives in `repo.compare-and-set.postgres.test.ts`.
 */

const WS = "ws-1";
const NOW = "2026-10-04T00:00:00.000Z";

function entry(overrides: Partial<EntryRecord> = {}): EntryRecord {
  return { id: "entry-1", workspaceId: WS, type: "recipe", slug: "chili", status: "draft", title: "Chili", fieldsJson: { ext: { site: {} } }, bodyJson: null, publishedAt: null, createdAt: NOW, updatedAt: NOW, version: 1, ...overrides };
}

function conflict(id: string, expected: number, found: number | "none"): (error: unknown) => boolean {
  return (error) => error instanceof VersionConflictError && error.message === `expected version ${expected} for entry '${id}', found ${found}`;
}

interface Adapter {
  repo: EntryRepoPort;
  /** Moves a stored row into the Trash the way the Trash's record-store adapter does. */
  trash: (row: EntryRecord) => Promise<void>;
}

const activeType = { findByKey: async () => ({ workspaceId: WS, key: "recipe", status: "active" as const, fields: [] }) };

function runCompareAndSetSuite(adapterName: string, make: () => Adapter): void {
  test(`[${adapterName}] a matching expectedVersion writes the row`, async () => {
    const { repo } = make();
    await repo.save(entry());
    await repo.save(entry({ title: "Edited", version: 2 }), { expectedVersion: 1 });
    assert.deepEqual(await repo.findById({ workspaceId: WS, id: "entry-1" }), entry({ title: "Edited", version: 2 }));
  });

  test(`[${adapterName}] two saves on the same base version: the second gets the exact version conflict and changes nothing`, async () => {
    const { repo } = make();
    await repo.save(entry());
    await repo.save(entry({ title: "First", version: 2 }), { expectedVersion: 1 });
    await assert.rejects(() => repo.save(entry({ title: "Second", version: 2 }), { expectedVersion: 1 }), conflict("entry-1", 1, 2));
    assert.equal((await repo.findById({ workspaceId: WS, id: "entry-1" }))?.title, "First");
  });

  test(`[${adapterName}] an expectedVersion on a missing, trashed or other-workspace row finds none`, async () => {
    const { repo, trash } = make();
    await repo.save(entry({ id: "trashed", slug: "trashed" }));
    await trash(entry({ id: "trashed", slug: "trashed" }));
    await repo.save(entry({ id: "foreign", slug: "foreign", workspaceId: "ws-2" }));
    for (const id of ["missing", "trashed", "foreign"]) {
      await assert.rejects(() => repo.save(entry({ id, slug: id, version: 2 }), { expectedVersion: 1 }), conflict(id, 1, "none"));
    }
    assert.equal(await repo.findById({ workspaceId: WS, id: "missing" }), null);
    assert.equal(await repo.findById({ workspaceId: WS, id: "trashed" }), null);
    assert.equal((await repo.findById({ workspaceId: "ws-2", id: "foreign" }))?.version, 1);
  });

  test(`[${adapterName}] a compare-and-set onto a slug a trashed entry holds is the Trash slug conflict`, async () => {
    const { repo, trash } = make();
    await repo.save(entry({ id: "old", slug: "taken" }));
    await trash(entry({ id: "old", slug: "taken" }));
    await repo.save(entry());
    await assert.rejects(
      () => repo.save(entry({ slug: "taken", version: 2 }), { expectedVersion: 1 }),
      (error: unknown) =>
        error instanceof EntrySlugConflictError &&
        error.message === "an entry with slug 'taken' is in the Trash — restore it, or delete it permanently from the Trash, to reuse the slug"
    );
    assert.equal((await repo.findById({ workspaceId: WS, id: "entry-1" }))?.slug, "chili");
  });

  test(`[${adapterName}] two concurrent updateEntry calls on the same base version: exactly one wins, the loser is a Result error`, async () => {
    const { repo } = make();
    await repo.save(entry());
    const deps = { entryRepo: repo, contentTypeRepo: activeType, clock: { nowMs: () => Date.parse(NOW) }, authorize: async () => ({ allowed: true, reason: "ok" }), outbox: { enqueue: async () => {} } };
    const edit = (title: string) => updateEntry({ deps, input: { workspaceId: WS, actorId: "user-1", id: "entry-1", title, expectedVersion: 1 } });
    const results = await Promise.all([edit("First"), edit("Second")]);

    assert.deepEqual(results.map((result) => result.ok).sort(), [false, true]);
    const lost = results.find((result) => !result.ok);
    assert.ok(lost && !lost.ok && conflict("entry-1", 1, 2)(lost.error));
    const stored = await repo.findById({ workspaceId: WS, id: "entry-1" });
    assert.equal(stored?.version, 2);
    assert.equal(stored?.title, results[0]?.ok ? "First" : "Second");
  });
}

runCompareAndSetSuite("TrashAwareInMemoryEntryRepo", () => {
  const repo = new TrashAwareInMemoryEntryRepo();
  return { repo, trash: (row) => repo.saveAny({ ...row, deletedAt: NOW }) };
});
for (const each of eachDialect({ tables: ["entries", "entry_revisions"], make: (kernel) => ({ kernel, repo: new SqlEntryRepo(kernel) }) })) {
  runCompareAndSetSuite(`SqlEntryRepo ${each.name}`, () => {
    const { kernel, repo } = each.make();
    return { repo, trash: async (row) => void (await kernel.execute(sql`UPDATE entries SET deleted_at = ${NOW} WHERE id = ${row.id}`)) };
  });
}
