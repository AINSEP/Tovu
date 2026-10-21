import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "kysely";
import type { MailerFeedbackEvent, OutboundEmail } from "@jini-ai/platform/mail";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { StorageKernel } from "#src/platform/db/kernel/port";
import {
  createMailCaptureRepo, createMailFeedbackInboxRepo, createMailSendLedgerRepo, createMailSuppressionRepo, MAX_CAPTURE_LIST,
} from "../index.js";

/**
 * @file The four mail repos (migration 0023) on SQLite and PGlite through one body: the ledger's
 * reserve/flip/existing cycle and mark, lane-scoped suppression, inbox replay dedup, and capture.
 */

const T0 = "2026-10-21T12:00:00.000Z";
let tick = 0;
const clock = () => {
  tick += 1000;
  return new Date(Date.parse(T0) + tick).toISOString();
};

const KEY = { workspaceId: "wa", idempotencyKey: "k1", recipient: "a@x.test" };
const RESERVE = { ...KEY, payloadHash: "h1", lane: "transactional" as const, providerId: "smtp" };

function message(subject: string, workspaceId = "wa"): OutboundEmail {
  return { workspaceId, to: { email: "a@x.test" }, from: { email: "site@x.test" }, subject, text: "hi", headers: { "X-T": "1" } };
}

async function seedWorkspaces(kernel: StorageKernel<unknown>) {
  await kernel.execute(sql`INSERT INTO workspaces (id, name, slug, created_at) VALUES ('wa', 'A', 'wa', ${T0}), ('wb', 'B', 'wb', ${T0})`);
}

describeEachDialect("mail repos", {
  tables: ["mail_send_ledger", "mail_suppression", "mail_feedback_inbox", "mail_capture", "workspaces"],
  make: (kernel) => {
    const db = kernel as StorageKernel<unknown>;
    let ids = 0;
    return {
      db, seeded: seedWorkspaces(db),
      ledger: createMailSendLedgerRepo({ db }, { nowIso: clock }),
      suppression: createMailSuppressionRepo({ db }, { nowIso: clock }),
      inbox: createMailFeedbackInboxRepo({ db }, { nowIso: clock }),
      capture: createMailCaptureRepo({ db }, { nowIso: clock, newId: () => {
        ids += 1;
        return `cap-${ids}`;
      } }),
    };
  },
}, (make) => {
  const ready = async () => {
    const ctx = make();
    await ctx.seeded;
    return ctx;
  };

  test("reserve inserts once; a repeat returns the stored row, with the provider id once sent", async () => {
    const { ledger } = await ready();
    assert.deepEqual(await ledger.reserve(RESERVE), { status: "reserved" });
    assert.deepEqual(await ledger.reserve({ ...RESERVE, payloadHash: "h2" }), { status: "existing", outcome: "reserved", payloadHash: "h1" });
    await ledger.mark({ ...KEY, outcome: "sent", providerMessageId: "m1" });
    assert.deepEqual(await ledger.reserve(RESERVE), { status: "existing", outcome: "sent", payloadHash: "h1", providerMessageId: "m1" });
    await ledger.mark({ ...KEY, outcome: "unknown", errorCode: "MAIL_OUTCOME_UNKNOWN" });
    assert.deepEqual(await ledger.reserve(RESERVE), { status: "existing", outcome: "unknown", payloadHash: "h1" });
  });

  test("a failed row flips back to reserved, taking the retry's content, and clears the error", async () => {
    const { ledger, db } = await ready();
    await ledger.reserve(RESERVE);
    await ledger.mark({ ...KEY, outcome: "failed", errorCode: "BAD" });
    assert.deepEqual(await ledger.reserve({ ...RESERVE, payloadHash: "h2", lane: "bulk", providerId: "resend" }), { status: "reserved" });
    assert.deepEqual(await db.query(sql`SELECT outcome, payload_hash, lane, provider_id, error_code, provider_message_id FROM mail_send_ledger`),
      [{ outcome: "reserved", payload_hash: "h2", lane: "bulk", provider_id: "resend", error_code: null, provider_message_id: null }]);
  });

  test("reclaimUnknown claims a same-content unknown row once; other content or no flag leaves it", async () => {
    const { ledger } = await ready();
    await ledger.reserve(RESERVE);
    await ledger.mark({ ...KEY, outcome: "unknown", errorCode: "MAIL_OUTCOME_UNKNOWN" });
    assert.deepEqual(await ledger.reserve(RESERVE), { status: "existing", outcome: "unknown", payloadHash: "h1" }, "no flag: never reclaimed");
    assert.deepEqual(await ledger.reserve({ ...RESERVE, payloadHash: "h2" }, { reclaimUnknown: true }), { status: "existing", outcome: "unknown", payloadHash: "h1" });
    const claims = await Promise.all([ledger.reserve(RESERVE, { reclaimUnknown: true }), ledger.reserve(RESERVE, { reclaimUnknown: true })]);
    assert.deepEqual(claims.map((claim) => claim.status).sort(), ["existing", "reserved"], "two concurrent retries: exactly one claims");
  });

  test("ledger identity is per workspace and per recipient", async () => {
    const { ledger } = await ready();
    await ledger.reserve(RESERVE);
    assert.deepEqual(await ledger.reserve({ ...RESERVE, workspaceId: "wb" }), { status: "reserved" });
    assert.deepEqual(await ledger.reserve({ ...RESERVE, recipient: "b@x.test" }), { status: "reserved" });
  });

  test("concurrent reserves for one identity: exactly one reserves", async () => {
    const { ledger } = await ready();
    const results = await Promise.all([ledger.reserve(RESERVE), ledger.reserve(RESERVE), ledger.reserve(RESERVE)]);
    assert.equal(results.filter((result) => result.status === "reserved").length, 1);
  });

  test("suppression: transactional is blocked by `all` only, bulk by both; keyed case-insensitively per workspace", async () => {
    const { suppression } = await ready();
    const check = (lane: "transactional" | "bulk", workspaceId = "wa") => suppression.isSuppressed({ workspaceId, normalizedAddress: " A@X.test ", lane });
    await suppression.suppress({ workspaceId: "wa", normalizedAddress: "a@x.test", scope: "bulk", reason: "complained" });
    assert.equal(await check("transactional"), false, "a complainer still gets sign-in links");
    assert.equal(await check("bulk"), true);
    assert.equal(await check("bulk", "wb"), false, "another workspace is unaffected");
    await suppression.suppress({ workspaceId: "wa", normalizedAddress: "A@x.test", scope: "all", reason: "bounced" });
    await suppression.suppress({ workspaceId: "wa", normalizedAddress: "a@x.test", scope: "all", reason: "manual" });
    assert.equal(await check("transactional"), true);
  });

  test("inbox: first record inserts, a replay before completion re-applies, a replay after it is a duplicate", async () => {
    const { inbox, db } = await ready();
    const event: MailerFeedbackEvent & { eventId: string; recipient: string } = {
      workspaceId: "wa", providerMessageId: "m1", sourceContext: { module: "unknown" }, kind: "bounced", eventId: "e1", recipient: "a@x.test", hardBounce: true, occurredAt: T0,
    };
    assert.equal(await inbox.record({ providerId: "resend", event }), "inserted");
    assert.equal(await inbox.record({ providerId: "resend", event }), "inserted", "an incomplete event (suppression failed or crashed) is re-applied");
    await inbox.complete({ providerId: "resend", eventId: "e1" });
    assert.equal(await inbox.record({ providerId: "resend", event: { ...event, hardBounce: false } }), "duplicate");
    assert.equal(await inbox.record({ providerId: "other", event: { ...event, hardBounce: false, kind: "delivered" } }), "inserted");
    assert.deepEqual(await db.query(sql`SELECT provider_id, hard_bounce, kind FROM mail_feedback_inbox ORDER BY provider_id`),
      [{ provider_id: "other", hard_bounce: 0, kind: "delivered" }, { provider_id: "resend", hard_bounce: 1, kind: "bounced" }]);
  });

  test("capture stores the whole message and lists it newest first, per workspace, with a clamped limit", async () => {
    const { capture } = await ready();
    assert.deepEqual(await capture.capture({ message: message("first"), lane: "transactional", idempotencyKey: "k1" }), { id: "cap-1" });
    await capture.capture({ message: message("second"), lane: "bulk", idempotencyKey: "k2" });
    await capture.capture({ message: message("other", "wb"), lane: "bulk", idempotencyKey: "k3" });
    const listed = await capture.listCaptured({ workspaceId: "wa" });
    assert.deepEqual(listed.map((row) => [row.id, row.subject, row.lane, row.idempotencyKey, row.to]), [["cap-2", "second", "bulk", "k2", "a@x.test"], ["cap-1", "first", "transactional", "k1", "a@x.test"]]);
    assert.deepEqual(listed[1]?.message, message("first"));
    assert.match(listed[0]?.createdAt ?? "", /^2026-10-21T/);
    assert.equal((await capture.listCaptured({ workspaceId: "wa" }, { limit: 0 })).length, 1, "limit is at least 1");
    assert.equal((await capture.listCaptured({ workspaceId: "wa" }, { limit: MAX_CAPTURE_LIST + 5 })).length, 2);
  });
});

test("default clocks and ids are used when none are injected", async () => {
  const { freshSqliteContentKernel } = await import("#src/platform/db/kernel/__tests__/dialect-matrix");
  const db = freshSqliteContentKernel() as StorageKernel<unknown>;
  try {
    await seedWorkspaces(db);
    await createMailSendLedgerRepo({ db }).reserve(RESERVE);
    await createMailSuppressionRepo({ db }).suppress({ workspaceId: "wa", normalizedAddress: "a@x.test", scope: "all", reason: "manual" });
    await createMailFeedbackInboxRepo({ db }).record({ providerId: "p", event: {
      workspaceId: "wa", providerMessageId: "m", sourceContext: { module: "unknown" }, kind: "complained", eventId: "e", recipient: "a@x.test", hardBounce: false, occurredAt: T0,
    } });
    const { id } = await createMailCaptureRepo({ db }).capture({ message: message("s"), lane: "bulk", idempotencyKey: "k" });
    assert.match(id, /^[0-9a-f-]{36}$/);
    const stamps = await db.query<{ at: string }>(sql`SELECT created_at AS at FROM mail_send_ledger UNION ALL SELECT created_at FROM mail_suppression UNION ALL SELECT received_at FROM mail_feedback_inbox`);
    for (const { at } of stamps) assert.ok(Math.abs(Date.parse(at) - Date.now()) < 60_000);
  } finally {
    await db.close();
  }
});
