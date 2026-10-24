import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "kysely";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { StorageKernel } from "#src/platform/db/kernel/port";
import { createMailActivityRepo } from "../activity.repo.js";
import { createMailAttemptObserver } from "../attempts.repo.js";
import { MAIL_ACTIVITY_RETENTION_MS } from "../retention.js";

/**
 * @file The activity projection (email phase 4) on SQLite and PGlite: derived outcome and use,
 * the feedback join by message id, filters, keyset paging with `skip`, workspace isolation and get.
 */

const T = (s: number) => new Date(Date.parse("2026-10-22T12:00:00.000Z") + s * 1000).toISOString();

type Seed = { key: string; to?: string; outcome: string; msg?: string | null; code?: string | null; at: number; ws?: string; lane?: string; provider?: string };

async function seed(db: StorageKernel<unknown>, rows: Seed[]) {
  await db.execute(sql`INSERT INTO workspaces (id, name, slug, created_at) VALUES ('wa', 'A', 'wa', ${T(0)}), ('wb', 'B', 'wb', ${T(0)})`);
  for (const row of rows) {
    await db.execute(sql`INSERT INTO mail_send_ledger (workspace_id, idempotency_key, recipient, payload_hash, lane, provider_id, outcome, provider_message_id, error_code, created_at, updated_at, activity_id)
      VALUES (${row.ws ?? "wa"}, ${row.key}, ${row.to ?? "a@x.test"}, 'h', ${row.lane ?? "transactional"}, ${row.provider ?? "smtp"}, ${row.outcome}, ${row.msg ?? null}, ${row.code ?? null}, ${T(row.at)}, ${T(row.at + 1)}, ${row.key})`);
  }
}

async function feedback(db: StorageKernel<unknown>, events: { id: string; kind: string; msg: string; at: number; ws?: string; provider?: string; hard?: number }[]) {
  for (const e of events) {
    await db.execute(sql`INSERT INTO mail_feedback_inbox (provider_id, event_id, workspace_id, recipient, kind, hard_bounce, provider_message_id, occurred_at, received_at, processed_at)
      VALUES (${e.provider ?? "smtp"}, ${e.id}, ${e.ws ?? "wa"}, 'a@x.test', ${e.kind}, ${e.hard ?? 0}, ${e.msg}, ${T(e.at)}, ${T(e.at + 5)}, ${T(e.at + 5)})`);
  }
}

describeEachDialect("mail activity repo", {
  tables: ["mail_activity_attempts", "mail_send_ledger", "mail_feedback_inbox", "workspaces"],
  make: (kernel) => {
    const db = kernel as StorageKernel<unknown>;
    return { db, repo: createMailActivityRepo({ db }) };
  },
}, (make) => {
  test("derives use from the key prefix and outcome from the ledger plus the most severe feedback", async () => {
    const { db, repo } = make();
    await seed(db, [
      { key: "members:signin:h1", outcome: "sent", msg: "m1", at: 1 },
      { key: "newsletter:confirm-email:t1", outcome: "sent", msg: "m2", at: 2 },
      { key: "forms:notify:s1:a@x.test", outcome: "sent", msg: "m3", at: 3 },
      { key: "newsletter:c1:s1:snap", outcome: "sent", msg: "m4", at: 4, lane: "bulk" },
      { key: "mail:test:ref", outcome: "failed", code: "MAIL_RECIPIENT_SUPPRESSED", at: 5 },
      { key: "legacy-key", outcome: "failed", code: "MAIL_RATE_LIMITED", at: 6 },
      { key: "members:signin:h2", outcome: "failed", code: "PROVIDER_REFUSED", at: 7 },
      { key: "members:signin:h3", outcome: "reserved", at: 8 },
      { key: "members:signin:h4", outcome: "unknown", code: "MAIL_OUTCOME_UNKNOWN", at: 9 },
      { key: "members:signin:other", outcome: "sent", msg: "m1", at: 10, ws: "wb" },
    ]);
    await feedback(db, [
      { id: "e1", kind: "delivered", msg: "m2", at: 20 },
      { id: "e2", kind: "delivered", msg: "m3", at: 20 }, { id: "e3", kind: "bounced", msg: "m3", at: 21, hard: 1 },
      { id: "e4", kind: "bounced", msg: "m4", at: 20 }, { id: "e5", kind: "complained", msg: "m4", at: 22 },
      // Another provider's id collision and another workspace's event never join.
      { id: "e6", kind: "complained", msg: "m1", at: 23, provider: "other" }, { id: "e7", kind: "bounced", msg: "m1", at: 23, ws: "wb" },
    ]);
    const rows = await repo.list({ workspaceId: "wa", limit: 50 });
    assert.deepEqual(rows.map((r) => [r.idempotencyKey, r.use, r.outcome]), [
      ["members:signin:h4", "sign_in", "unknown"],
      ["members:signin:h3", "sign_in", "unknown"],
      ["members:signin:h2", "sign_in", "failed"],
      ["legacy-key", "unknown", "deferred"],
      ["mail:test:ref", "test", "suppressed"],
      ["newsletter:c1:s1:snap", "newsletter", "complained"],
      ["forms:notify:s1:a@x.test", "form_notification", "bounced"],
      ["newsletter:confirm-email:t1", "newsletter_confirmation", "delivered"],
      ["members:signin:h1", "sign_in", "accepted"],
    ]);
    assert.deepEqual(rows.at(-1), {
      cursorKey: "members:signin:h1", idempotencyKey: "members:signin:h1", recipient: "a@x.test", lane: "transactional", providerId: "smtp", use: "sign_in",
      outcome: "accepted", providerMessageId: "m1", errorCode: null, message: null, createdAt: T(1), updatedAt: T(2),
    });
    assert.deepEqual((await repo.list({ workspaceId: "wb", limit: 50 })).map((r) => r.outcome), ["bounced"]);
  });

  test("filters by outcome, use and exact recipient (case-insensitive); pages by position and skip", async () => {
    const { db, repo } = make();
    await seed(db, [
      { key: "members:signin:a", to: "a@x.test", outcome: "sent", msg: "m1", at: 1 },
      { key: "members:signin:b", to: "b@x.test", outcome: "sent", msg: "m2", at: 2 },
      { key: "members:signin:c", to: "b@x.test", outcome: "sent", msg: "m3", at: 2 },
      { key: "forms:notify:d", to: "b@x.test", outcome: "failed", code: "X", at: 3 },
    ]);
    assert.deepEqual((await repo.list({ workspaceId: "wa", limit: 9 }, { outcome: "failed" })).map((r) => r.idempotencyKey), ["forms:notify:d"]);
    assert.deepEqual((await repo.list({ workspaceId: "wa", limit: 9 }, { use: "sign_in", recipient: " B@X.test " })).map((r) => r.idempotencyKey), ["members:signin:c", "members:signin:b"]);
    assert.deepEqual((await repo.list({ workspaceId: "wa", limit: 2 })).map((r) => r.idempotencyKey), ["forms:notify:d", "members:signin:c"]);
    assert.deepEqual((await repo.list({ workspaceId: "wa", limit: 2 }, { before: { createdAt: T(2), key: "members:signin:c" } })).map((r) => r.idempotencyKey), ["members:signin:b", "members:signin:a"]);
  });

  test("get returns the record with its feedback timeline, or null; a send without a message id has none", async () => {
    const { db, repo } = make();
    await seed(db, [{ key: "members:signin:a", outcome: "sent", msg: "m1", at: 1 }, { key: "members:signin:b", outcome: "failed", code: "X", at: 2 }]);
    await feedback(db, [{ id: "e2", kind: "bounced", msg: "m1", at: 30, hard: 1 }, { id: "e1", kind: "delivered", msg: "m1", at: 20 }]);
    const found = await repo.get({ workspaceId: "wa", idempotencyKey: "members:signin:a", recipient: "a@x.test" });
    assert.equal(found?.record.outcome, "bounced");
    assert.deepEqual(found?.feedback, [
      { kind: "delivered", hardBounce: false, providerId: "smtp", occurredAt: T(20), receivedAt: T(25) },
      { kind: "bounced", hardBounce: true, providerId: "smtp", occurredAt: T(30), receivedAt: T(35) },
    ]);
    assert.deepEqual((await repo.get({ workspaceId: "wa", idempotencyKey: "members:signin:b", recipient: "a@x.test" }))?.feedback, []);
    assert.equal(await repo.get({ workspaceId: "wb", idempotencyKey: "members:signin:a", recipient: "a@x.test" }), null);
  });

  test("stored purpose filters survive opaque keys; outcome filtering precedes page limits and expired history is excluded", async () => {
    const { db } = make();
    await seed(db, [{ key: "members:signin:expired", outcome: "sent", at: -MAIL_ACTIVITY_RETENTION_MS / 1000 - 1 }]);
    let at = 1;
    const observe = createMailAttemptObserver({ db }, { nowIso: () => T(at), newId: () => `attempt-${at}` });
    const message = { workspaceId: "wa", to: { email: "reader@x.test" }, from: { email: "sender@x.test" }, subject: "ignored", text: "ignored" };
    const options = { workspaceId: "wa", idempotencyKey: "members:signin:failed", sourceContext: { module: "members" } };
    await observe({ message, options, providerId: "smtp", mode: { mode: "off" }, result: { ok: false, retryable: false, errorCode: "REFUSED", message: "not stored" } });
    at = 2;
    await observe({ message, options: { ...options, idempotencyKey: "members:signin:new" }, providerId: "smtp", mode: { mode: "off" }, result: { ok: true, providerMessageId: "pm-new", acceptedAt: T(at) } });
    // A purpose is persisted once, so the read never has to classify every key in the history.
    await db.execute(sql`UPDATE mail_activity_attempts SET idempotency_key = 'opaque-request' WHERE id = 'attempt-2'`);
    const repo = createMailActivityRepo({ db }, { now: () => Date.parse(T(10)) });
    const latest = await repo.list({ workspaceId: "wa", limit: 1 }, { use: "sign_in" });
    assert.deepEqual(latest.map(row => [row.idempotencyKey, row.use]), [["opaque-request", "sign_in"]]);
    const failed = await repo.list({ workspaceId: "wa", limit: 1 }, { use: "sign_in", outcome: "failed" });
    assert.deepEqual(failed.map(row => row.idempotencyKey), ["members:signin:failed"]);
    assert.equal((await repo.list({ workspaceId: "wa", limit: 10 })).length, 2, "expired legacy history is bounded even before the purge runs");
  });

});
