import assert from "node:assert/strict";
import { test } from "node:test";

import type { DomainEvent } from "@jini-ai/core/contracts/events";
import { sql } from "kysely";

import { freshSqliteContentKernel } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { SqlFormDeliveryRepo } from "#src/platform/db/repos/form-delivery-repo";
import { outboxEventValues } from "@jini-ai/db/events";
import { outboxOn } from "#src/platform/db/__tests__/events-adapters";

/**
 * @file P7 (form-job id prefix) + P8 (outbox event row, N-1). An install already holds `outbox_events`
 * rows: the row mapping, the JSON encoding of `event_json`, the status strings and the
 * `forms:notify:<submission>:` job-id prefix that the notification summary range-scans are all stored
 * formats. The literals below are frozen: written by running today's code once, then committed.
 */

const WS = "lane-su-ws";
const T0 = "2026-11-17T00:00:00.000Z";

const FROZEN_EVENT: DomainEvent = {
  id: "post-1-post.published-3", name: "post.published", occurredAt: T0, aggregateId: "post-1", workspaceId: WS,
  payload: { slug: "hello", version: 3 },
};
const FROZEN_EVENT_JSON = '{"id":"post-1-post.published-3","name":"post.published","occurredAt":"2026-11-17T00:00:00.000Z","aggregateId":"post-1","workspaceId":"lane-su-ws","payload":{"slug":"hello","version":3}}';

async function seededKernel() {
  const kernel = freshSqliteContentKernel();
  await kernel.execute(sql`INSERT INTO workspaces (id, name, slug, created_at) VALUES (${WS}, ${WS}, ${WS}, ${T0})`);
  return kernel;
}

test("P8 a frozen event maps to the frozen outbox row", () => {
  assert.deepEqual(outboxEventValues(FROZEN_EVENT), {
    id: "post-1-post.published-3", workspace_id: WS, event_json: FROZEN_EVENT_JSON, status: "pending", attempts: 0,
    next_attempt_at: T0, created_at: T0,
  });
});

test("P8 a frozen stored row is claimed and parsed back to the same event", async () => {
  const kernel = await seededKernel();
  await kernel.execute(sql`INSERT INTO outbox_events (id, workspace_id, event_json, status, attempts, next_attempt_at, created_at)
    VALUES ('post-1-post.published-3', ${WS}, ${FROZEN_EVENT_JSON}, 'pending', 0, ${T0}, ${T0})`);
  const outbox = outboxOn({ kernel }, { claimLeaseMs: 60_000 });
  const claimed = await outbox.claimPending({ batchSize: 10, nowIso: T0 });
  assert.deepEqual(claimed, [{ id: "post-1-post.published-3", event: FROZEN_EVENT, status: "processing", attempts: 1, nextAttemptAt: T0, lastError: undefined, createdAt: T0 }]);
  const row = (await kernel.query<{ status: string; attempts: number; next_attempt_at: string }>(sql`SELECT status, attempts, next_attempt_at FROM outbox_events`))[0];
  assert.deepEqual(row, { status: "processing", attempts: 1, next_attempt_at: "2026-11-17T00:01:00.000Z" });
});

test("P8 enqueue writes the frozen row and the outcome writers use the frozen status strings", async () => {
  const kernel = await seededKernel();
  const outbox = outboxOn({ kernel });
  await outbox.enqueue(FROZEN_EVENT);
  const stored = async () => (await kernel.query<{ event_json: string; status: string; last_error: string | null }>(sql`SELECT event_json, status, last_error FROM outbox_events`))[0];
  assert.deepEqual(await stored(), { event_json: FROZEN_EVENT_JSON, status: "pending", last_error: null });
  await outbox.markFailed({ id: FROZEN_EVENT.id, error: "delivery-failed", nextAttemptAt: T0, nextStatus: "failed" });
  assert.deepEqual(await stored(), { event_json: FROZEN_EVENT_JSON, status: "failed", last_error: "delivery-failed" });
  await outbox.markDelivered({ id: FROZEN_EVENT.id });
  assert.equal((await stored())?.status, "failed", "a settled row is not revived by a late outcome");
  await outbox.enqueue({ ...FROZEN_EVENT, id: "post-1-post.published-4" });
  await outbox.markDelivered({ id: "post-1-post.published-4" });
  const delivered = await kernel.query<{ status: string }>(sql`SELECT status FROM outbox_events WHERE id = 'post-1-post.published-4'`);
  assert.deepEqual(delivered, [{ status: "delivered" }]);
});

test("P7 the notification summary counts outbox rows by the forms:notify:<submission>: id prefix", async () => {
  const kernel = await seededKernel();
  const rows: Array<[string, string]> = [
    ["forms:notify:sub-1:a", "pending"], ["forms:notify:sub-1:b", "processing"], ["forms:notify:sub-1:c", "failed"],
    ["forms:notify:sub-1:d", "delivered"], ["forms:notify:sub-2:a", "failed"], ["forms:notify:sub-10:a", "pending"],
  ];
  for (const [id, status] of rows) {
    await kernel.execute(sql`INSERT INTO outbox_events (id, workspace_id, event_json, status, attempts, next_attempt_at, created_at)
      VALUES (${id}, ${WS}, '{}', ${status}, 0, ${T0}, ${T0})`);
  }
  const summary = await new SqlFormDeliveryRepo({ kernel }).notificationSummary({ workspaceId: WS, submissionId: "sub-1" });
  assert.deepEqual(summary, { failed: 1, pending: 2 });
});
