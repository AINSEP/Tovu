import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "kysely";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { createMailAttemptObserver, createMailCaptureRepo, createMailSendLedgerRepo, purgeExpiredMail } from "@jini-ai/platform/mail/sql";
import express from "express";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminMailActivityRoutes, type AdminMailActivityDeps } from "#src/server/runtime/composition/modules/system-mail";
import { MAIL_CAPTURE_CLEAR_PERMISSION } from "@jini-ai/core/contracts/mail";
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
type Authorize = (required: { permission: string }) => Promise<{ allowed: boolean; reason: string }>;
const owner: Authorize = async ({ permission }) => ({ allowed: permission === MAIL_CAPTURE_CLEAR_PERMISSION, reason: "owner" });
/** The statement text of a raw `sql` template (its fragments, parameters elided). */
const sqlText = (q: unknown) => (q as { toOperationNode: () => { sqlFragments: readonly string[] } }).toOperationNode().sqlFragments.join("?");
/** `POST .../system/mail-capture/clear` through the composition's real mount: owner permission, confirm card, workspace "w". */
async function clearCall(db: Db, body: Record<string, unknown>, authorize: Authorize = owner) {
  const app = express();
  registerAdminMailActivityRoutes({ app, deps: { workspaceId: "w", authorize, contentKernel: db } as unknown as AdminMailActivityDeps });
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "owner" };
  await extractRouteHandler(app, "post", "/api/admin/v1/workspaces/:workspaceId/system/mail-capture/clear")({ query: {}, body, params: { workspaceId: "w" } }, res);
  return capture;
}
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

  test("clear all (mounted): unconfirmed deletes nothing; confirmed deletes only this workspace's reviewed captured test emails", async () => {
    const db = make(); await workspaces(db);
    await seed(db, { workspaceId: "w", at: NOW - DAY, key: "one" }); await seed(db, { workspaceId: "w", at: NOW, key: "two" });
    await seed(db, { workspaceId: "other", at: NOW, key: "kept" });
    const preview = await clearCall(db, {});
    assert.equal(preview.statusCode, 200);
    const body = preview.jsonBody as { cleared: boolean; confirmationRequired: boolean; plan: unknown; revision: string };
    assert.deepEqual([body.cleared, body.confirmationRequired, body.plan], [false, true, { count: 2, newestAt: iso(NOW) }]);
    assert.equal(typeof body.revision, "string");
    assert.equal((await clearCall(db, { confirmed: true, revision: "stale" })).statusCode, 400);
    assert.equal((await clearCall(db, { confirmed: true })).statusCode, 400, "a confirm without the reviewed revision is refused");
    assert.deepEqual(await keys(db, "mail_capture"), ["other:kept", "w:one", "w:two"], "preview and stale confirm delete nothing");
    const done = await clearCall(db, { confirmed: true, revision: body.revision });
    assert.deepEqual([done.statusCode, done.jsonBody], [200, { cleared: true, deleted: 2 }]);
    assert.deepEqual(await keys(db, "mail_capture"), ["other:kept"], "another workspace's captures are never touched");
    assert.deepEqual(await keys(db, "mail_send_ledger"), ["other:kept", "w:one", "w:two"], "sent-email records are not test emails");
    assert.deepEqual(await keys(db, "mail_activity_attempts"), ["other:kept", "w:one", "w:two"]);
  });

  test("clear all: a capture arriving while the confirmed clear runs survives", async () => {
    const db = make(); await workspaces(db);
    await seed(db, { workspaceId: "w", at: NOW - DAY, key: "one" }); await seed(db, { workspaceId: "w", at: NOW - DAY, key: "two" });
    const { revision } = (await clearCall(db, {})).jsonBody as { revision: string };
    let arrived = false;
    const racing = new Proxy(db, { get: (target, key) => {
      const value = Reflect.get(target, key) as unknown;
      if (key !== "query") return typeof value === "function" ? (value as () => unknown).bind(target) : value;
      return async (q: Parameters<Db["query"]>[0]) => {
        if (!arrived && /^\s*DELETE FROM mail_capture/i.test(sqlText(q))) {
          arrived = true; await createMailCaptureRepo({ db }, { nowIso: () => iso(NOW - DAY) }).capture({ message: msg("w"), lane: "transactional", idempotencyKey: "late" });
        }
        return target.query(q);
      };
    } });
    const done = await clearCall(racing, { confirmed: true, revision });
    assert.ok(arrived, "the arrival ran inside the confirmed clear");
    assert.deepEqual([done.statusCode, done.jsonBody], [200, { cleared: true, deleted: 2 }]);
    assert.deepEqual(await keys(db, "mail_capture"), ["w:late"], "only the reviewed captures are deleted");
  });

  test("clear all: a same-count, same-newest replacement set is a changed set and is not deleted", async () => {
    const db = make(); await workspaces(db);
    await seed(db, { workspaceId: "w", at: NOW - DAY, key: "one" }); await seed(db, { workspaceId: "w", at: NOW, key: "two" });
    const { revision } = (await clearCall(db, {})).jsonBody as { revision: string };
    await db.execute(sql`DELETE FROM mail_capture WHERE idempotency_key = 'one'`);
    await createMailCaptureRepo({ db }, { nowIso: () => iso(NOW - DAY) }).capture({ message: msg("w"), lane: "transactional", idempotencyKey: "swap" });
    assert.equal((await clearCall(db, { confirmed: true, revision })).statusCode, 400, "the owner must review the new set");
    assert.deepEqual(await keys(db, "mail_capture"), ["w:swap", "w:two"]);
  });

  test("clear all (mounted) without the owner permission is refused before anything is read or deleted", async () => {
    const db = make(); await workspaces(db); await seed(db, { workspaceId: "w", at: NOW, key: "one" });
    const asked: string[] = [];
    const refused = await clearCall(db, { confirmed: true, revision: "any" }, async ({ permission }) => { asked.push(permission); return { allowed: false, reason: "no_grant" }; });
    assert.equal(refused.statusCode, 403);
    assert.deepEqual(asked, [MAIL_CAPTURE_CLEAR_PERMISSION]);
    assert.deepEqual(await keys(db, "mail_capture"), ["w:one"]);
    await assert.rejects(planMailCaptureClear({ principalId: "editor", workspaceId: "w" }, { capture: createMailCaptureRepo({ db }),
      checkPermission: async () => ({ allowed: false, reason: "no_grant" }) }), { name: "MailActivityForbiddenError" });
  });
});
