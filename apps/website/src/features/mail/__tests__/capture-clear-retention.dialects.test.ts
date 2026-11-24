import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "kysely";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { createMailAttemptObserver, createMailCaptureRepo, createMailSendLedgerRepo, purgeExpiredMail } from "@jini-ai/platform/mail/sql";
import { mailCaptureClearRoute } from "@jini-ai/cms/admin-http/routes/system/mail-activity";
import { MAIL_CAPTURE_CLEAR_PERMISSION } from "@jini-ai/user-management/mail/status/permissions";
import { planMailCaptureClear } from "../capture-clear";

/**
 * Owner decision 2026-11-23 (bt2-todos G7-6/847, G7-7/848): sent-email records are kept 30 days,
 * captured test emails 7 days, and the owner can clear every captured test email after confirming.
 * The windows are spelled as literals here on purpose: they pin the decision, not the constants.
 */
const DAY = 24 * 60 * 60_000;
const NOW = Date.parse("2026-11-24T12:00:00Z");
const iso = (n: number) => new Date(n).toISOString();
const msg = (workspaceId: string) => ({ workspaceId, to: { email: "qa@example.com" }, from: { email: "s@example.com" }, subject: "Test", text: "body" });

type Db = Parameters<typeof purgeExpiredMail>[0]["db"];
async function seed(db: Db, { workspaceId, at, key }: { workspaceId: string; at: number; key: string }) {
  await createMailCaptureRepo({ db }, { nowIso: () => iso(at) }).capture({ message: msg(workspaceId), lane: "transactional", idempotencyKey: key });
  const ledger = createMailSendLedgerRepo({ db }, { nowIso: () => iso(at) });
  const id = { workspaceId, idempotencyKey: key, recipient: "qa@example.com" };
  await ledger.reserve({ ...id, payloadHash: "h", lane: "transactional", providerId: "smtp" }); await ledger.mark({ ...id, outcome: "sent" });
  await createMailAttemptObserver({ db }, { nowIso: () => iso(at), newId: () => `a-${workspaceId}-${key}` })({ message: msg(workspaceId), providerId: "smtp", mode: { mode: "off" },
    options: { workspaceId, idempotencyKey: key, sourceContext: { module: "mail" }, purpose: "transactional", lane: "interactive" }, result: { ok: true, providerMessageId: `m-${key}`, acceptedAt: iso(at) } });
}
const keys = async (db: Db, table: "mail_capture" | "mail_send_ledger" | "mail_activity_attempts") =>
  (await db.query<{ k: string }>(sql`SELECT workspace_id || ':' || idempotency_key AS k FROM ${sql.table(table)} ORDER BY k`)).map(r => r.k);
const workspaces = async (db: Db) => { for (const w of ["w", "other"]) await db.execute(sql`INSERT INTO workspaces (id,name,slug,created_at) VALUES (${w},${w},${w},${iso(NOW)})`); };

describeEachDialect("mail retention windows and clear-all captured test emails", { tables: ["mail_activity_attempts", "mail_send_ledger", "mail_capture", "mail_suppression", "mail_feedback_inbox", "workspaces"], make: db => db }, make => {
  test("sent-email records: exactly 30 days old are kept, 30 days + 1 ms are deleted", async () => {
    const db = make(); await workspaces(db);
    await seed(db, { workspaceId: "w", at: NOW - 30 * DAY, key: "edge" });
    await seed(db, { workspaceId: "w", at: NOW - 30 * DAY - 1, key: "expired" });
    await purgeExpiredMail({ db }, { now: () => NOW });
    assert.deepEqual(await keys(db, "mail_send_ledger"), ["w:edge"]);
    assert.deepEqual(await keys(db, "mail_activity_attempts"), ["w:edge"]);
  });

  test("captured test emails: exactly 7 days old are kept, 7 days + 1 ms are deleted (a 2-day-old one survives)", async () => {
    const db = make(); await workspaces(db);
    for (const [key, at] of [["edge", NOW - 7 * DAY], ["expired", NOW - 7 * DAY - 1], ["two-days", NOW - 2 * DAY]] as const) {
      await createMailCaptureRepo({ db }, { nowIso: () => iso(at) }).capture({ message: msg("w"), lane: "transactional", idempotencyKey: key });
    }
    await purgeExpiredMail({ db }, { now: () => NOW });
    assert.deepEqual(await keys(db, "mail_capture"), ["w:edge", "w:two-days"]);
  });

  test("injected windows and clock drive the purge; newer rows of every workspace and other tables are untouched", async () => {
    const db = make(); await workspaces(db);
    await seed(db, { workspaceId: "w", at: NOW - 2 * DAY - 1, key: "old" });
    await seed(db, { workspaceId: "other", at: NOW - 2 * DAY, key: "new" });
    await db.execute(sql`INSERT INTO mail_suppression (workspace_id, normalized_address, scope, reason, created_at) VALUES ('w', 'qa@example.com', 'all', 'bounced', ${iso(NOW - 400 * DAY)})`);
    await purgeExpiredMail({ db }, { now: () => NOW, activityRetentionMs: 2 * DAY, captureRetentionMs: 2 * DAY });
    for (const table of ["mail_capture", "mail_send_ledger", "mail_activity_attempts"] as const) assert.deepEqual(await keys(db, table), ["other:new"], table);
    assert.equal((await db.query(sql`SELECT 1 FROM mail_suppression`)).length, 1, "suppression protection is never purged");
  });

  test("clear all: unconfirmed deletes nothing; confirmed deletes only this workspace's captured test emails", async () => {
    const db = make(); await workspaces(db);
    await seed(db, { workspaceId: "w", at: NOW - DAY, key: "one" }); await seed(db, { workspaceId: "w", at: NOW, key: "two" });
    await seed(db, { workspaceId: "other", at: NOW, key: "kept" });
    const allowed = async () => ({ allowed: true, reason: "owner" });
    const deps = { classifyMailActivityError: () => undefined,
      planCaptureClear: ({ principalId }: { principalId: string }) => planMailCaptureClear({ principalId, workspaceId: "w" }, { capture: createMailCaptureRepo({ db }), checkPermission: allowed }) };
    const handle = (body: Record<string, unknown>) => (mailCaptureClearRoute.handle as (a: unknown) => Promise<{ value: Record<string, unknown> }>)({ input: { body }, deps, context: { id: "owner" } });
    const preview = (await handle({})).value;
    const planned = await planMailCaptureClear({ principalId: "owner", workspaceId: "w" }, { capture: createMailCaptureRepo({ db }), checkPermission: allowed });
    assert.deepEqual(preview, { cleared: false, confirmationRequired: true, plan: { count: 2, newestAt: iso(NOW) }, revision: planned.revision }, "the preview hands the screen the revision a confirm must carry");
    await assert.rejects(handle({ confirmed: true, revision: "stale" }), (err: unknown) => JSON.stringify(err).includes("Review and confirm again"));
    assert.deepEqual(await keys(db, "mail_capture"), ["other:kept", "w:one", "w:two"], "preview and stale confirm delete nothing");
    assert.deepEqual((await handle({ confirmed: true, revision: preview.revision })).value, { cleared: true, deleted: 2 });
    assert.deepEqual(await keys(db, "mail_capture"), ["other:kept"]);
    assert.deepEqual(await keys(db, "mail_send_ledger"), ["other:kept", "w:one", "w:two"], "sent-email records are not test emails");
    assert.deepEqual(await keys(db, "mail_activity_attempts"), ["other:kept", "w:one", "w:two"]);
  });

  test("clear all without the owner permission is refused before anything is read or deleted", async () => {
    const db = make(); await workspaces(db); await seed(db, { workspaceId: "w", at: NOW, key: "one" });
    const asked: string[] = [];
    await assert.rejects(planMailCaptureClear({ principalId: "editor", workspaceId: "w" }, { capture: createMailCaptureRepo({ db }),
      checkPermission: async ({ permission }) => { asked.push(permission); return { allowed: false, reason: "no_grant" }; } }), { name: "MailActivityForbiddenError" });
    assert.deepEqual(asked, [MAIL_CAPTURE_CLEAR_PERMISSION]);
    assert.deepEqual(await keys(db, "mail_capture"), ["w:one"]);
  });
});
