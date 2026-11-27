import { sql } from "kysely";
import { createMailAttemptObserver, createMailCaptureRepo, createMailSendLedgerRepo } from "@jini-ai/platform/mail/sql";
import type { ContentKernel } from "#src/platform/db/content-kernel";

/**
 * @file Shared mail fixtures for the captured-test-email tests (`capture-clear-retention.dialects.test.ts`
 * and the assistant `mail_clear_captured` test): one send seeds a captured test email, a send-ledger
 * row and a delivery attempt, so a test can prove which of the three a clear touched.
 */
export const DAY = 24 * 60 * 60_000;
export const NOW = Date.parse("2026-11-24T12:00:00Z");
export const iso = (n: number) => new Date(n).toISOString();
export const msg = (workspaceId: string) => ({ workspaceId, to: { email: "qa@example.com" }, from: { email: "s@example.com" }, subject: "Test", text: "body" });

export type Db = ContentKernel;
export const MAIL_TABLES = ["mail_activity_attempts", "mail_send_ledger", "mail_capture", "mail_suppression", "mail_feedback_inbox", "workspaces"];

/** Captures one test email of `workspaceId` at `at` without the ledger rows. */
export async function capture(db: Db, { workspaceId, at, key }: { workspaceId: string; at: number; key: string }) {
  await createMailCaptureRepo({ db }, { nowIso: () => iso(at) }).capture({ message: msg(workspaceId), lane: "transactional", idempotencyKey: key });
}

/** One captured test email plus its send-ledger row and delivery attempt. */
export async function seed(db: Db, { workspaceId, at, key }: { workspaceId: string; at: number; key: string }) {
  await capture(db, { workspaceId, at, key });
  const ledger = createMailSendLedgerRepo({ db }, { nowIso: () => iso(at) });
  const id = { workspaceId, idempotencyKey: key, recipient: "qa@example.com" };
  await ledger.reserve({ ...id, payloadHash: "h", lane: "transactional", providerId: "smtp" }); await ledger.mark({ ...id, outcome: "sent" });
  await createMailAttemptObserver({ db }, { nowIso: () => iso(at), newId: () => `a-${workspaceId}-${key}` })({ message: msg(workspaceId), providerId: "smtp", mode: { mode: "off" },
    options: { workspaceId, idempotencyKey: key, sourceContext: { module: "mail" }, purpose: "transactional", lane: "interactive" }, result: { ok: true, providerMessageId: `m-${key}`, acceptedAt: iso(at) } });
}

/** `workspace:key` of every row of `table`, sorted. */
export const keys = async (db: Db, table: "mail_capture" | "mail_send_ledger" | "mail_activity_attempts") =>
  (await db.query<{ k: string }>(sql`SELECT workspace_id || ':' || idempotency_key AS k FROM ${sql.table(table)} ORDER BY k`)).map(r => r.k);

/** Creates the `w` and `other` workspaces the fixtures write into. */
export const workspaces = async (db: Db) => { for (const w of ["w", "other"]) await db.execute(sql`INSERT INTO workspaces (id,name,slug,created_at) VALUES (${w},${w},${w},${iso(NOW)})`); };
