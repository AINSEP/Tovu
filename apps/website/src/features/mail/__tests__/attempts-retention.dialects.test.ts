import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "kysely";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { createMailPolicyWrapper } from "#src/server/runtime/boot/mail-delivery-policy";
import { createMailAttemptObserver } from "../attempts.repo.js";
import { createMailActivityRepo } from "../activity.repo.js";
import { createMailCaptureRepo } from "../capture.repo.js";
import { createMailSendLedgerRepo } from "../ledger.repo.js";
import { createMailSuppressionRepo } from "../suppression.repo.js";
import { purgeExpiredMail, MAIL_ACTIVITY_RETENTION_MS, MAIL_CAPTURE_RETENTION_MS } from "../retention.js";
import type { MailTestModeSetting } from "../../settings/mail-provider.js";
const NOW = Date.parse("2026-10-22T12:00:00Z");
const iso = (n: number) => new Date(n).toISOString();
const message = { workspaceId: "w", to: { email: "real@example.com" }, from: { email: "sender@example.com" }, subject: "Private auth link", text: "https://site.test/sign-in?token=private" };
const options = { workspaceId: "w", idempotencyKey: "mail:test:one", sourceContext: { module: "mail" }, purpose: "transactional" as const, lane: "interactive" as const };

describeEachDialect("mail observations and retention", { tables: ["mail_activity_attempts", "mail_send_ledger", "mail_capture", "mail_suppression", "mail_feedback_inbox", "workspaces"], make: db => db }, make => {
  test("real policy emits suppression, capture, throttling and redirected delivery with effective feedback attribution", async () => {
    const db = make(); await db.execute(sql`INSERT INTO workspaces (id,name,slug,created_at) VALUES ('w','W','w',${iso(NOW)})`);
    let mode: MailTestModeSetting = { mode: "off" }, blocked = true; const deliveries: string[] = [];
    const observer = createMailAttemptObserver({ db }, { nowIso: () => iso(NOW) });
    const wrap = createMailPolicyWrapper({ ledger: createMailSendLedgerRepo({ db }, { nowIso: () => iso(NOW) }), suppression: { isSuppressed: async () => blocked, suppress: async () => {} }, readTestMode: async () => mode, observe: observer }, { capture: createMailCaptureRepo({ db }, { nowIso: () => iso(NOW) }), now: () => NOW });
    const mailer = wrap({ providerId: "smtp", provider: { capabilities: { rateLimit: { perSecond: 0.001, burst: 1 } } } as never, mailer: { capabilities: () => ({ driver: "smtp", supportsAttachments: true, supportsIdempotencyKey: true, supportsWebhookFeedback: true, maxBatchSize: 1 }), send: async msg => { deliveries.push(msg.to.email); return { ok: true, providerMessageId: "message-1", acceptedAt: iso(NOW) }; }, sendBatch: async () => [] } });
    await mailer.send(message, { ...options, idempotencyKey: "mail:test:suppressed" }); blocked = false;
    mode = { mode: "capture" }; await mailer.send(message, { ...options, idempotencyKey: "mail:test:captured" });
    mode = { mode: "redirect", to: "qa@example.com" }; await mailer.send(message, { ...options, idempotencyKey: "mail:test:redirected" });
    mode = { mode: "off" }; await mailer.send(message, { ...options, idempotencyKey: "mail:test:deferred" });
    const repo = createMailActivityRepo({ db }); const rows = await repo.list({ workspaceId: "w", limit: 10 });
    assert.deepEqual(new Set(rows.map(r => r.outcome)), new Set(["suppressed", "captured", "accepted", "deferred"]));
    assert.deepEqual(deliveries, ["qa@example.com"]);
    const redirected = rows.find(r => r.deliveryMode === "redirect")!; assert.equal(redirected.recipient, "qa@example.com"); assert.equal(redirected.originalRecipient, "real@example.com");
    await db.execute(sql`INSERT INTO mail_feedback_inbox (provider_id,event_id,workspace_id,recipient,kind,hard_bounce,provider_message_id,occurred_at,received_at,processed_at) VALUES ('smtp','f','w','qa@example.com','delivered',0,'message-1',${iso(NOW)},${iso(NOW)},${iso(NOW)})`);
    const detail = await repo.get({ workspaceId: "w", idempotencyKey: redirected.idempotencyKey, recipient: "qa@example.com" });
    assert.equal(detail!.record.outcome, "delivered"); assert.equal(detail!.record.recipient, "qa@example.com"); assert.equal(detail!.feedback.length, 1);
    assert.equal(await repo.get({ workspaceId: "w", idempotencyKey: redirected.idempotencyKey, recipient: "real@example.com" }), null);
    assert.doesNotMatch(JSON.stringify(rows), /Private auth|private|sign-in/);
  });

  test("expiry deletes final send identities and bodies while preserving unresolved reservations, recent retries and suppression protection", async () => {
    const db = make(); await db.execute(sql`INSERT INTO workspaces (id,name,slug,created_at) VALUES ('w','W','w',${iso(NOW)})`);
    const capture = createMailCaptureRepo({ db }, { nowIso: () => iso(NOW - MAIL_CAPTURE_RETENTION_MS) }); await capture.capture({ message, lane: "transactional", idempotencyKey: "capture-old" });
    const fresh = createMailCaptureRepo({ db }, { nowIso: () => iso(NOW - MAIL_CAPTURE_RETENTION_MS + 1) }); await fresh.capture({ message, lane: "transactional", idempotencyKey: "capture-new" });
    const ledger = createMailSendLedgerRepo({ db }, { nowIso: () => iso(NOW - MAIL_ACTIVITY_RETENTION_MS) });
    const key = { workspaceId: "w", idempotencyKey: "old", recipient: "real@example.com" };
    await ledger.reserve({ ...key, payloadHash: "hash", lane: "transactional", providerId: "smtp" }); await ledger.mark({ ...key, outcome: "unknown" });
    const observer = createMailAttemptObserver({ db }, { nowIso: () => iso(NOW - MAIL_ACTIVITY_RETENTION_MS) });
    await observer({ message, options: { ...options, idempotencyKey: "old" }, providerId: "smtp", mode: { mode: "off" }, result: { ok: false, retryable: false, unknown: true, errorCode: "MAIL_OUTCOME_UNKNOWN", message: "unknown" } });
    const suppression = createMailSuppressionRepo({ db }); await suppression.suppress({ workspaceId: "w", normalizedAddress: "real@example.com", scope: "all", reason: "bounced" });
    for (const outcome of ["sent", "failed"] as const) {
      await ledger.reserve({ ...key, idempotencyKey: outcome, payloadHash: "hash", lane: "transactional", providerId: "smtp" });
      await ledger.mark({ ...key, idempotencyKey: outcome, outcome });
    }
    await ledger.reserve({ ...key, idempotencyKey: "reserved", payloadHash: "hash", lane: "transactional", providerId: "smtp" });
    await ledger.reserve({ ...key, idempotencyKey: "recent-retry", payloadHash: "hash", lane: "transactional", providerId: "smtp" });
    const currentLedger = createMailSendLedgerRepo({ db }, { nowIso: () => iso(NOW) });
    await currentLedger.mark({ ...key, idempotencyKey: "recent-retry", outcome: "sent", providerMessageId: "recent" });
    await db.execute(sql`INSERT INTO mail_feedback_inbox (provider_id,event_id,workspace_id,recipient,kind,hard_bounce,provider_message_id,occurred_at,received_at,processed_at)
      VALUES ('smtp','retained-event','w','real@example.com','delivered',0,'old-message',${iso(NOW - MAIL_ACTIVITY_RETENTION_MS)},${iso(NOW - MAIL_ACTIVITY_RETENTION_MS)},${iso(NOW)}),
      ('smtp','pending-event','w','pending@example.com','delivered',0,'pending-message',${iso(NOW - MAIL_ACTIVITY_RETENTION_MS)},${iso(NOW - MAIL_ACTIVITY_RETENTION_MS)},NULL)`);
    await purgeExpiredMail({ db }, { now: () => NOW });
    const remaining = await db.query<{ idempotency_key: string }>(sql`SELECT idempotency_key FROM mail_send_ledger ORDER BY idempotency_key`);
    assert.deepEqual(remaining.map(row => row.idempotency_key), ["recent-retry", "reserved"]);
    const feedback = await db.query(sql`SELECT event_id, recipient, provider_message_id FROM mail_feedback_inbox ORDER BY event_id`);
    assert.deepEqual(feedback, [{ event_id: "pending-event", recipient: "pending@example.com", provider_message_id: "pending-message" }, { event_id: "retained-event", recipient: "", provider_message_id: "" }]);
    // RETURNING counts actual writes on both engines, including redundant same-value UPDATEs.
    let changes = 0;
    const counted = new Proxy(db, { get(target, property) {
      if (property === "execute") return async (statement: Parameters<typeof db.execute>[0]) => { changes += (await target.query(sql`${statement} RETURNING 1`)).length; };
      const value = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value;
    } });
    await purgeExpiredMail({ db: counted }, { now: () => NOW });
    assert.equal(changes, 0, "a second pass changes zero rows, including reserved and already-scrubbed rows");
    assert.deepEqual((await fresh.listCaptured({ workspaceId: "w" })).map(r => r.idempotencyKey), ["capture-new"]);
    assert.deepEqual(await createMailActivityRepo({ db }).list({ workspaceId: "w", limit: 10 }), []);
    const replay = await currentLedger.reserve({ ...key, idempotencyKey: "reserved", payloadHash: "hash", lane: "transactional", providerId: "smtp" }); assert.equal(replay.status, "existing");
    assert.deepEqual(await db.query(sql`SELECT * FROM mail_send_ledger WHERE idempotency_key IN ('old', 'sent', 'failed')`), [], "all expired final metadata, including addresses and keys, is deleted");
    assert.equal(await suppression.isSuppressed({ workspaceId: "w", normalizedAddress: "real@example.com", lane: "transactional" }), true);
  });
});
