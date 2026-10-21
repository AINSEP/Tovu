/** @file SQL adapter for Jini's `MailFeedbackInboxPort` (migration 0023), one body for SQLite and Postgres. */
import { sql } from "kysely";
import type { MailFeedbackInboxPort } from "@jini-ai/platform/mail";
import type { MailRepoDeps, MailRepoOptions } from "./ledger.repo.js";

/**
 * Provider feedback events, insert-if-absent on (provider, event id): a provider's replay of an
 * event it already delivered is reported `duplicate`, so suppression is written once.
 * @complexity O(1) per event.
 * @example createMailFeedbackInboxRepo({ db: kernel }).record({ providerId: "resend", event })
 */
export function createMailFeedbackInboxRepo<DB>({ db }: MailRepoDeps<DB>, optional: MailRepoOptions = {}): MailFeedbackInboxPort {
  const nowIso = optional.nowIso ?? (() => new Date().toISOString());
  return {
    async record({ providerId, event }) {
      const inserted = await db.query(sql`INSERT INTO mail_feedback_inbox
        (provider_id, event_id, workspace_id, recipient, kind, hard_bounce, provider_message_id, occurred_at, received_at)
        VALUES (${providerId}, ${event.eventId}, ${event.workspaceId}, ${event.recipient}, ${event.kind}, ${event.hardBounce ? 1 : 0},
          ${event.providerMessageId}, ${event.occurredAt}, ${nowIso()})
        ON CONFLICT (provider_id, event_id) DO NOTHING RETURNING event_id`);
      return inserted.length > 0 ? "inserted" : "duplicate";
    },
  };
}
