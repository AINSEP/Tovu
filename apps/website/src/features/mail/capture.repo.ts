/** @file SQL adapter for Jini's `MailCapturePort` (migration 0023): test/capture mode's message sink. */
import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import type { MailCapturePort, MailDeliveryLane, OutboundEmail } from "@jini-ai/platform/mail";
import type { MailRepoDeps, MailRepoOptions } from "./ledger.repo.js";

export interface CapturedMail {
  id: string;
  lane: MailDeliveryLane;
  idempotencyKey: string;
  to: string;
  subject: string;
  message: OutboundEmail;
  createdAt: string;
}

export interface MailCaptureRepo extends MailCapturePort {
  /** Newest first. `limit` is clamped to 1..{@link MAX_CAPTURE_LIST}; default {@link DEFAULT_CAPTURE_LIST}. */
  listCaptured(required: { workspaceId: string }, optional?: { limit?: number }): Promise<readonly CapturedMail[]>;
}

export const DEFAULT_CAPTURE_LIST = 50;
export const MAX_CAPTURE_LIST = 200;

type Row = { id: string; lane: MailDeliveryLane; idempotency_key: string; to_address: string; subject: string; payload_json: string; created_at: string };

const clampLimit = (limit: number | undefined): number =>
  Math.min(MAX_CAPTURE_LIST, Math.max(1, Math.trunc(limit ?? DEFAULT_CAPTURE_LIST)));

/**
 * Stores captured messages whole (rendered content, headers, attachments) so the operator can read
 * exactly what would have been sent. Nothing here leaves the process.
 * @complexity capture O(1); listCaptured O(limit) via `idx_mail_capture_workspace_created`.
 * @example createMailCaptureRepo({ db: kernel }).capture({ message, lane: "transactional", idempotencyKey })
 */
export function createMailCaptureRepo<DB>(
  { db }: MailRepoDeps<DB>,
  optional: MailRepoOptions & { newId?: () => string } = {},
): MailCaptureRepo {
  const nowIso = optional.nowIso ?? (() => new Date().toISOString());
  const newId = optional.newId ?? randomUUID;
  return {
    async capture({ message, lane, idempotencyKey }) {
      const id = newId();
      await db.execute(sql`INSERT INTO mail_capture (id, workspace_id, lane, idempotency_key, to_address, subject, payload_json, created_at)
        VALUES (${id}, ${message.workspaceId}, ${lane}, ${idempotencyKey}, ${message.to.email}, ${message.subject}, ${JSON.stringify(message)}, ${nowIso()})`);
      return { id };
    },
    async listCaptured({ workspaceId }, options = {}) {
      const rows = await db.query<Row>(sql`SELECT id, lane, idempotency_key, to_address, subject, payload_json, created_at FROM mail_capture
        WHERE workspace_id = ${workspaceId} ORDER BY created_at DESC, id DESC LIMIT ${clampLimit(options.limit)}`);
      return rows.map((row) => ({
        id: row.id, lane: row.lane, idempotencyKey: row.idempotency_key, to: row.to_address, subject: row.subject,
        message: JSON.parse(row.payload_json) as OutboundEmail, createdAt: row.created_at,
      }));
    },
  };
}
