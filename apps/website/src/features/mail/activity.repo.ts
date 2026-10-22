/**
 * @file Read projection over the send ledger joined with provider feedback (email phase 4): the
 * Email page's **Recent sends and failures** and `mail_list_activity`/`mail_get_activity`. One SQL
 * body for SQLite and Postgres; migration 0029 adds the two indexes these reads use.
 *
 * Only body-free metadata leaves here: the ledger stores no subject, body or link, and this never
 * reads `mail_capture`. Outcomes are derived, never stored:
 *
 * - `sent` rows are `accepted` until feedback says more; the most severe event wins
 *   (complained > bounced > delivered), joined by the provider's message id.
 * - `failed` rows keep the policy's reason: `MAIL_RECIPIENT_SUPPRESSED` is `suppressed`,
 *   `MAIL_RATE_LIMITED` is `deferred`, anything else `failed`.
 * - `reserved` (in flight, or a crash mid-send) and `unknown` are `unknown`: the provider may have
 *   taken it, which is exactly why there is no general Resend.
 *
 * The use (purpose) is read from the idempotency key prefix each owner already writes
 * (`members:signin:`, `newsletter:confirm-email:`, `forms:notify:`, `newsletter:`, `mail:test:`).
 * 0023 stores no purpose column, so any other key, historical or new, is `unknown` rather than
 * guessed.
 */
import { sql, type RawBuilder } from "kysely";
import type { MailRepoDeps } from "./ledger.repo.js";

export const MAIL_ACTIVITY_OUTCOMES = ["accepted", "delivered", "bounced", "complained", "suppressed", "deferred", "failed", "unknown", "captured"] as const;
export type MailActivityOutcome = (typeof MAIL_ACTIVITY_OUTCOMES)[number];
export const MAIL_ACTIVITY_USES = ["sign_in", "newsletter_confirmation", "form_notification", "newsletter", "test", "unknown"] as const;
export type MailActivityUse = (typeof MAIL_ACTIVITY_USES)[number];

export interface MailActivityRecord {
  cursorKey: string;
  originalRecipient?: string;
  deliveryMode?: "redirect" | "capture";
  idempotencyKey: string;
  recipient: string;
  lane: "transactional" | "bulk";
  providerId: string;
  use: MailActivityUse;
  outcome: MailActivityOutcome;
  providerMessageId: string | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MailFeedbackRecord {
  kind: "delivered" | "bounced" | "complained";
  hardBounce: boolean;
  providerId: string;
  occurredAt: string;
  receivedAt: string;
}

/** Keyset position: rows at or before `createdAt`, skipping the `skip` already returned at exactly that time. */
export interface MailActivityPosition {
  createdAt: string;
  key: string;
}

export interface MailActivityFilter {
  outcome?: MailActivityOutcome;
  use?: MailActivityUse;
  /** Exact address, compared lowercased as the ledger stores it. */
  recipient?: string;
}

export interface MailActivityRepo {
  list(required: { workspaceId: string; limit: number }, optional?: MailActivityFilter & { before?: MailActivityPosition }): Promise<MailActivityRecord[]>;
  get(required: { workspaceId: string; idempotencyKey: string; recipient: string }): Promise<{ record: MailActivityRecord; feedback: MailFeedbackRecord[] } | null>;
}

type Row = {
  activity_id: string; effective_recipient: string; delivery_mode: "off" | "capture" | "redirect"; idempotency_key: string; recipient: string; lane: "transactional" | "bulk"; provider_id: string; use_id: MailActivityUse;
  activity_outcome: MailActivityOutcome; provider_message_id: string | null; error_code: string | null; created_at: string; updated_at: string;
};

const feedbackExists = (kind: MailFeedbackRecord["kind"]) => sql`EXISTS (SELECT 1 FROM mail_feedback_inbox f
  WHERE f.workspace_id = l.workspace_id AND f.provider_message_id = l.provider_message_id AND f.provider_id = l.provider_id AND f.recipient = l.effective_recipient AND f.kind = ${kind} AND f.processed_at IS NOT NULL)`;

/** The derived projection, one row per ledger identity; filters apply to its derived columns. */
function projection(workspaceId: string): RawBuilder<unknown> {
  return sql`SELECT l.activity_id, l.effective_recipient, l.delivery_mode, l.idempotency_key, l.recipient, l.lane, l.provider_id, l.provider_message_id, l.error_code, l.created_at, l.updated_at,
    CASE WHEN l.idempotency_key LIKE 'members:signin:%' THEN 'sign_in'
      WHEN l.idempotency_key LIKE 'newsletter:confirm-email:%' THEN 'newsletter_confirmation'
      WHEN l.idempotency_key LIKE 'forms:notify:%' THEN 'form_notification'
      WHEN l.idempotency_key LIKE 'mail:test:%' THEN 'test'
      WHEN l.idempotency_key LIKE 'newsletter:%' THEN 'newsletter'
      ELSE 'unknown' END AS use_id,
    CASE WHEN l.outcome = 'captured' THEN 'captured' WHEN l.outcome = 'sent' THEN
        CASE WHEN ${feedbackExists("complained")} THEN 'complained' WHEN ${feedbackExists("bounced")} THEN 'bounced'
          WHEN ${feedbackExists("delivered")} THEN 'delivered' ELSE 'accepted' END
      WHEN l.outcome = 'failed' THEN
        CASE WHEN l.error_code = 'MAIL_RECIPIENT_SUPPRESSED' THEN 'suppressed' WHEN l.error_code = 'MAIL_RATE_LIMITED' THEN 'deferred' ELSE 'failed' END
      ELSE 'unknown' END AS activity_outcome
    FROM (
      SELECT a.id AS activity_id, a.workspace_id, a.idempotency_key, a.recipient, a.effective_recipient, a.delivery_mode,
        a.lane, a.provider_id, a.outcome, a.provider_message_id, a.error_code, a.created_at, a.updated_at FROM mail_activity_attempts a
      UNION ALL
      SELECT activity_id, workspace_id, idempotency_key, recipient, recipient AS effective_recipient, 'off' AS delivery_mode,
        lane, provider_id, outcome, provider_message_id, error_code, created_at, updated_at FROM mail_send_ledger old
        WHERE old.activity_retained = 1 AND NOT EXISTS (SELECT 1 FROM mail_activity_attempts a WHERE a.workspace_id = old.workspace_id AND a.idempotency_key = old.idempotency_key AND a.recipient = old.recipient)
    ) l WHERE l.workspace_id = ${workspaceId}`;
}

function toRecord(row: Row): MailActivityRecord {
  return {
    cursorKey: row.activity_id, idempotencyKey: row.idempotency_key, recipient: row.effective_recipient,
    ...(row.delivery_mode === "off" ? {} : { originalRecipient: row.recipient, deliveryMode: row.delivery_mode }), lane: row.lane, providerId: row.provider_id, use: row.use_id,
    outcome: row.activity_outcome, providerMessageId: row.provider_message_id, errorCode: row.error_code, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function conditions(optional: MailActivityFilter & { before?: MailActivityPosition }): RawBuilder<unknown>[] {
  const where: RawBuilder<unknown>[] = [sql`1 = 1`];
  if (optional.before) where.push(sql`(a.created_at < ${optional.before.createdAt} OR (a.created_at = ${optional.before.createdAt} AND a.activity_id < ${optional.before.key}))`);
  if (optional.outcome) where.push(sql`a.activity_outcome = ${optional.outcome}`);
  if (optional.use) where.push(sql`a.use_id = ${optional.use}`);
  if (optional.recipient) where.push(sql`(a.recipient = ${optional.recipient.trim().toLowerCase()} OR a.effective_recipient = ${optional.recipient.trim().toLowerCase()})`);
  return where;
}

/**
 * The activity reads. Newest first by creation, ties broken by the ledger key, so a page boundary
 * inside one timestamp is resumed by `skip` without exposing a key or address in the cursor.
 * @complexity One indexed range read per page plus three feedback probes per returned row.
 * @example createMailActivityRepo({ db: kernel }).list({ workspaceId, limit: 26 }, { outcome: "bounced" })
 */
export function createMailActivityRepo<DB>({ db }: MailRepoDeps<DB>): MailActivityRepo {
  return {
    async list(required, optional = {}) {
      const rows = await db.query<Row>(sql`SELECT * FROM (${projection(required.workspaceId)}) a WHERE ${sql.join(conditions(optional), sql` AND `)}
        ORDER BY a.created_at DESC, a.activity_id DESC LIMIT ${required.limit}`);
      return rows.map(toRecord);
    },
    async get({ workspaceId, idempotencyKey, recipient }) {
      const [row] = await db.query<Row>(sql`SELECT * FROM (${projection(workspaceId)}) a WHERE a.idempotency_key = ${idempotencyKey} AND a.effective_recipient = ${recipient}`);
      if (!row) return null;
      const feedback = row.provider_message_id === null ? [] : await db.query<{ kind: MailFeedbackRecord["kind"]; hard_bounce: number; provider_id: string; occurred_at: string; received_at: string }>(
        sql`SELECT kind, hard_bounce, provider_id, occurred_at, received_at FROM mail_feedback_inbox
          WHERE workspace_id = ${workspaceId} AND provider_message_id = ${row.provider_message_id} AND provider_id = ${row.provider_id} AND recipient = ${row.effective_recipient} AND processed_at IS NOT NULL ORDER BY occurred_at, event_id`);
      return {
        record: toRecord(row),
        feedback: feedback.map((event) => ({ kind: event.kind, hardBounce: Number(event.hard_bounce) === 1, providerId: event.provider_id, occurredAt: event.occurred_at, receivedAt: event.received_at })),
      };
    },
  };
}
