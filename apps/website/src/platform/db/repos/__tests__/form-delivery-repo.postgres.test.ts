import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { dropDatabase, freshPostgresContentDatabase } from "#src/platform/db/__tests__/postgres-database";
import type { ContentDatabase } from "#src/platform/db/content-database.generated";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { openPostgresKernel } from "#src/platform/db/kernel/index";
import { planFormDeliveries } from "@jini-ai/cms/forms";
import { SqlFormDeliveryRepo, SqlFormPullLeaseRepo } from "../form-delivery-repo.js";
import { SqlOutboxAdapter } from "../outbox-repo.js";

/**
 * @file The receiver pull lease on a REAL Postgres server with two connection pools: two pulls
 * racing for one receiver admit exactly one. SQLite and PGlite serialize every transaction, so the
 * dialect suite stays green without the claim's `lockKey`; here the first claimer pauses after its
 * read until the second claimer has read too (bounded, because with the lock the second cannot get
 * there), so without the lock both would see a free receiver and both would pull. It also proves on
 * the real server that a purge during an in-flight delivery attempt stays final (F9C).
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

/** The outbox row of `jobId`: status, last error and the frozen answers. */
async function jobRow(kernel: ContentKernel, jobId: string) {
  const row = await kernel.run(db => db.selectFrom("outbox_events").select(["status", "last_error", "event_json"]).where("id", "=", jobId).executeTakeFirstOrThrow());
  const answers = (JSON.parse(row.event_json) as { payload: { snapshot: { submission: { answers: unknown } } } }).payload.snapshot.submission.answers;
  return [row.status, row.last_error, answers];
}

// F9C: the outcome of an attempt in flight during the purge used to set the purged job back to
// pending, and its retry would have sent the blanked answers.
test("postgres: a purge during an in-flight attempt is final; the attempt's outcome neither revives nor resends the job", async () => {
  const workspaceId = "w-purge";
  const repo = new SqlFormDeliveryRepo({ kernel: first });
  const outbox = new SqlOutboxAdapter(first);
  await planFormDeliveries({
    workspaceId, submissionId: "s1", formId: "f1",
    deps: {
      plans: repo,
      bindings: async () => ["b1", "b2"].map(bindingId => ({ bindingId, adapterId: "a", connectionRef: "c", enabled: true, config: {} })),
      snapshot: async () => ({ form: { slug: "contact", fields: [{ name: "email", required: true }] },
        submission: { id: "s1", answers: { email: "a@example.com" }, submittedAt: T0 } }),
      newId: (() => { let next = 0; return () => `pg-purge-job-${(next += 1)}`; })(),
      nowIso: () => T0,
    },
  });
  const inFlight = await outbox.claimPending({ batchSize: 10, nowIso: "2026-10-20T12:00:01.000Z" });
  assert.deepEqual(inFlight.map(row => row.id), ["pg-purge-job-1", "pg-purge-job-2"]);
  await repo.scrubPurged({ workspaceId, purged: { submissionId: "s1" } });
  await outbox.markFailed({ id: "pg-purge-job-1", error: "rate-limited", nextAttemptAt: "2026-10-20T12:01:00.000Z", nextStatus: "pending" });
  await outbox.markDelivered({ id: "pg-purge-job-2" });
  assert.deepEqual([await jobRow(first, "pg-purge-job-1"), await jobRow(first, "pg-purge-job-2")],
    [["failed", "delivery-failed", {}], ["failed", "delivery-failed", {}]]);
  assert.deepEqual(await outbox.claimPending({ batchSize: 10, nowIso: "2099-01-01T00:00:00.000Z" }), []);
});
