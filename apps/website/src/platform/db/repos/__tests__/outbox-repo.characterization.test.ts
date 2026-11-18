import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { DomainEvent } from "@jini-ai/core/contracts/events";

import { DEFAULT_OUTBOX_CLAIM_LEASE_MS } from "#src/contracts/core/events/index";
import { describeEachDialect, freshSqliteContentKernel } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { ContentKernel } from "../../content-kernel.js";
import { SqliteOutboxAdapter } from "../../sqlite/outbox-repo.sqlite.js";
import { outboxOn } from "#src/platform/db/__tests__/events-adapters";

/**
 * @file S6a T0: the outbox adapter on the unmoved code, before it moves to Jini `@jini-ai/db/events`. The lock key is
 * pinned by `lane-su-pins/p1-lock-keys`, the stored row by `p7-p8-outbox-formats`, the lease expiry and settled-row rules
 * by `contracts/core/events/__tests__/outbox-repo.contract.test.ts`; what only this file adds is the concurrent claim,
 * the default lease of the Tovu binding, the column effects of the two outcome writers, and enqueue taking part in the
 * caller's transaction. Each test names the one-line mutation that turns it red.
 */

const T0 = "2026-11-18T00:00:00.000Z";
const event = (id: string): DomainEvent => ({ id, name: "post.published", occurredAt: T0, workspaceId: "ws-1", payload: { id } });

async function outboxRows(kernel: ContentKernel) {
  return kernel.run((db) => db.selectFrom("outbox_events").select(["id", "status", "attempts", "next_attempt_at", "last_error"]).orderBy("id").execute());
}

describeEachDialect("SqlOutboxAdapter characterization", { tables: ["outbox_events"], make: (kernel: ContentKernel) => kernel }, (makeKernel) => {
  test("two concurrent claimers never take one event (mutation: remove `lockKey(\"outbox_events:claim\")`)", async () => {
    const kernel = makeKernel();
    const first = outboxOn({ kernel });
    const second = outboxOn({ kernel });
    for (const id of ["e1", "e2", "e3", "e4", "e5", "e6"]) await first.enqueue(event(id));
    const [a, b] = await Promise.all([first.claimPending({ batchSize: 4, nowIso: T0 }), second.claimPending({ batchSize: 4, nowIso: T0 })]);
    const ids = [...a, ...b].map((record) => record.id).sort();
    assert.deepEqual(ids, ["e1", "e2", "e3", "e4", "e5", "e6"], "every event claimed once, none twice");
    assert.equal(new Set(ids).size, ids.length);
    assert.ok((await outboxRows(kernel)).every((row) => row.status === "processing" && row.attempts === 1));
  });

  test("markFailed with nextStatus pending keeps attempts and sets the error and retry time; markDelivered only the status (mutation: change a mapped column)", async () => {
    const kernel = makeKernel();
    const outbox = outboxOn({ kernel });
    await outbox.enqueue(event("e1"));
    await outbox.enqueue(event("e2"));
    await outbox.claimPending({ batchSize: 10, nowIso: T0 });
    const leaseExpiry = (await outboxRows(kernel))[1]?.next_attempt_at;
    const retryAt = "2026-11-18T00:05:00.000Z";
    await outbox.markFailed({ id: "e1", error: "boom", nextAttemptAt: retryAt, nextStatus: "pending" });
    await outbox.markDelivered({ id: "e2" });
    const [e1, e2] = await outboxRows(kernel);
    assert.deepEqual(e1, { id: "e1", status: "pending", attempts: 1, next_attempt_at: retryAt, last_error: "boom" });
    assert.equal(e2?.status, "delivered");
    assert.equal(e2?.attempts, 1);
    assert.equal(e2?.last_error, null);
    assert.equal(e2?.next_attempt_at, leaseExpiry, "markDelivered does not touch the retry time");
  });

  test("enqueue takes part in the caller's transaction: a throw leaves no row, a commit leaves one (mutation: run it on another connection)", async () => {
    const kernel = makeKernel();
    const outbox = outboxOn({ kernel });
    await assert.rejects(
      kernel.transaction(async () => {
        await outbox.enqueue(event("rolled-back"));
        throw new Error("caller failed");
      }),
      /caller failed/,
    );
    assert.deepEqual(await outboxRows(kernel), []);
    await kernel.transaction(async () => outbox.enqueue(event("committed")));
    assert.deepEqual((await outboxRows(kernel)).map((row) => row.id), ["committed"]);
  });
});

describe("the SQLite binding's claim lease", () => {
  test("without an option the stored lease expiry is now + the events barrel constant exactly (mutation: another number in the binding)", async () => {
    const kernel = freshSqliteContentKernel();
    const outbox = new SqliteOutboxAdapter({ store: kernel });
    await outbox.enqueue(event("e1"));
    await outbox.claimPending({ batchSize: 1, nowIso: T0 });
    const [row] = await outboxRows(kernel);
    assert.equal(row?.next_attempt_at, new Date(Date.parse(T0) + DEFAULT_OUTBOX_CLAIM_LEASE_MS).toISOString());
  });

  test("an option overrides the constant (mutation: ignore the option)", async () => {
    const kernel = freshSqliteContentKernel();
    const outbox = new SqliteOutboxAdapter({ store: kernel }, { claimLeaseMs: 1234 });
    await outbox.enqueue(event("e1"));
    await outbox.claimPending({ batchSize: 1, nowIso: T0 });
    assert.equal((await outboxRows(kernel))[0]?.next_attempt_at, new Date(Date.parse(T0) + 1234).toISOString());
  });
});
