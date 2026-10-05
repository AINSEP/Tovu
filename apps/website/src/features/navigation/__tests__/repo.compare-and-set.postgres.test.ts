import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { sql } from "kysely";

import { MenuConflictError, type NavMenuEntry } from "@jini-ai/cms/navigation";
import type { ContentDatabase } from "#src/platform/db/content-database.generated";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { openPostgresKernel, type StorageKernel } from "#src/platform/db/kernel/index";
import { migrateContentDatabase } from "#src/platform/db/migrations/index";
import { freshPostgresDatabase } from "#src/platform/db/__tests__/postgres-database";
import { SqlMenuRepo } from "../repo.js";

/**
 * @file Menu compare-and-set (wm S4) on a REAL Postgres server, two pooled kernels = two
 * connections: writer A's conditional UPDATE holds the row lock inside an open transaction, writer B's
 * UPDATE on the same base version blocks on it, and once A commits, B re-checks its WHERE against A's
 * row and matches nothing — so B gets the version conflict instead of overwriting A. PGlite's single
 * connection cannot show this. Fails (never skips) when the local server is down.
 */

const DATABASE = "tovu_menu_cas_pg_fixture";

let first: ContentKernel;
let second: ContentKernel;

before(async () => {
  const url = freshPostgresDatabase(DATABASE);
  first = openPostgresKernel<ContentDatabase>({ connectionString: url });
  second = openPostgresKernel<ContentDatabase>({ connectionString: url });
  await migrateContentDatabase(first as unknown as StorageKernel<unknown>);
});

after(async () => {
  await first?.close();
  await second?.close();
});

function menu(overrides: Partial<NavMenuEntry> = {}): NavMenuEntry {
  return {
    id: "menu-1",
    workspaceId: "ws-1",
    slug: "primary-nav",
    title: "Primary Nav",
    status: "published",
    doc: { type: "menu", version: 1, items: [] },
    locations: [],
    updatedAt: "2026-10-04T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

/** Polls until some other session in this database waits on a lock (writer B is blocked). */
async function untilALockWaits(kernel: ContentKernel): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const rows = await kernel.query(
      sql<{ waiting: string | number }>`SELECT count(*) AS waiting FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`
    );
    if (Number(rows[0]?.waiting) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("writer B never blocked on writer A's row lock");
}

test("postgres: two writers on the same base version, B blocked on A's row lock — A lands, B gets the version conflict", async () => {
  const repoA = new SqlMenuRepo(first);
  const repoB = new SqlMenuRepo(second);
  await repoA.save(menu());

  let releaseA!: () => void;
  const aMayCommit = new Promise<void>((resolve) => (releaseA = resolve));
  let aUpdated!: () => void;
  const aHoldsLock = new Promise<void>((resolve) => (aUpdated = resolve));
  const writerA = first.transaction(async () => {
    await repoA.save(menu({ title: "Writer A", version: 2 }), { expectedVersion: 1 });
    aUpdated();
    await aMayCommit;
  });

  await aHoldsLock;
  const writerB = repoB.save(menu({ title: "Writer B", version: 2 }), { expectedVersion: 1 });
  writerB.catch(() => {});
  await untilALockWaits(first);
  releaseA();
  await writerA;

  await assert.rejects(
    writerB,
    (error: unknown) =>
      error instanceof MenuConflictError &&
      error.message === "menu 'menu-1' was modified concurrently (expected version 1, found 2)"
  );
  const stored = await repoB.findById({ workspaceId: "ws-1", id: "menu-1" });
  assert.deepEqual([stored?.title, stored?.version], ["Writer A", 2]);
});
