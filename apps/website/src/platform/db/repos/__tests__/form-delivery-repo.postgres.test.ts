import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { dropDatabase, freshPostgresContentDatabase } from "#src/platform/db/__tests__/postgres-database";
import type { ContentDatabase } from "#src/platform/db/content-database.generated";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { openPostgresKernel } from "#src/platform/db/kernel/index";
import { SqlFormPullLeaseRepo } from "../form-delivery-repo.js";

/**
 * @file The receiver pull lease on a REAL Postgres server with two connection pools: two pulls
 * racing for one receiver admit exactly one. SQLite and PGlite serialize every transaction, so the
 * dialect suite stays green without the claim's `lockKey`; here the first claimer pauses after its
 * read until the second claimer has read too (bounded, because with the lock the second cannot get
 * there), so without the lock both would see a free receiver and both would pull.
 */

const DATABASE = "tovu_form_delivery_repo_pg_fixture";
const T0 = "2026-10-20T12:00:00.000Z";

let first: ContentKernel;
let second: ContentKernel;

before(() => {
  const url = freshPostgresContentDatabase(DATABASE);
  first = openPostgresKernel<ContentDatabase>({ connectionString: url });
  second = openPostgresKernel<ContentDatabase>({ connectionString: url });
});

after(async () => {
  await first?.close();
  await second?.close();
  dropDatabase({ database: DATABASE });
});

/** `kernel` whose first `run` (the claim's read) calls `onRead`, then waits for `resume`. */
function afterFirstRead(kernel: ContentKernel, onRead: () => void, resume: Promise<void>): ContentKernel {
  let runs = 0;
  return {
    ...kernel,
    run: async (fn) => {
      const result = await kernel.run(fn);
      if (++runs === 1) {
        onRead();
        await resume;
      }
      return result;
    },
  } as ContentKernel;
}

test("postgres: two pulls racing for one receiver admit exactly one; the other is already-running", async () => {
  let secondRead!: () => void;
  const secondReadDone = new Promise<void>((resolve) => (secondRead = resolve));
  // With the lock the second claimer waits in lockKey and never reads, so only the bound ends the pause.
  const resume = Promise.race([secondReadDone, new Promise<void>((resolve) => setTimeout(resolve, 2_000))]);
  const claim = { workspaceId: "w", receiverKey: "host:https://r.example", nowIso: T0, recentMs: 0, leaseMs: 60_000 };

  const winner = new SqlFormPullLeaseRepo({ kernel: afterFirstRead(first, () => {}, resume) }).claim({ ...claim, token: "a" });
  // Let the first claimer take its lock and read before the second starts.
  await new Promise((resolve) => setTimeout(resolve, 200));
  const loser = new SqlFormPullLeaseRepo({ kernel: afterFirstRead(second, secondRead, Promise.resolve()) }).claim({ ...claim, token: "b" });

  assert.deepEqual(await Promise.all([winner, loser]), [{ claimed: true }, { claimed: false, reason: "already-running" }]);
});
