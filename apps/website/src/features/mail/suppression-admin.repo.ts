/**
 * @file The operator side of the do-not-send list and the feedback inbox (email phase 5, migration
 * 0030): list and search suppressions, remove one with an audit record, and read the newest
 * verified feedback event per provider. One SQL body for SQLite and Postgres.
 *
 * The send-time side stays `suppression.repo.ts` (Jini's `MailSuppressionRepoPort`), untouched: a
 * removal deletes the 0023 row so send-time checks remain one primary-key probe, and the audit row
 * written in the same transaction keeps what was removed, by whom, when and why.
 */
import { randomUUID } from "node:crypto";
import { sql, type RawBuilder } from "kysely";
import type { MailSuppressionScope } from "@jini-ai/platform/mail";
import type { MailRepoDeps } from "./ledger.repo.js";

export type MailSuppressionReason = "bounced" | "complained" | "manual";

export interface MailSuppressionEntry {
  address: string;
  scope: MailSuppressionScope;
  reason: MailSuppressionReason;
  createdAt: string;
}

export interface MailSuppressionRemoval {
  id: string;
  address: string;
  scope: MailSuppressionScope;
  suppressionReason: MailSuppressionReason;
  suppressedAt: string;
  removalReason: string;
  removedBy: string;
  removedAt: string;
}

export interface MailSuppressionListFilter {
  /** Substring of the address, matched lowercased; `%` and `_` are literal. */
  search?: string;
  scope?: MailSuppressionScope;
  reason?: MailSuppressionReason;
  before?: { createdAt: string; skip: number };
}

export interface MailSuppressionAdminRepo {
  list(required: { workspaceId: string; limit: number }, optional?: MailSuppressionListFilter): Promise<MailSuppressionEntry[]>;
  find(required: { workspaceId: string; address: string; scope: MailSuppressionScope }): Promise<MailSuppressionEntry | null>;
  /** Deletes the suppression and records the removal atomically; `null` when it was not suppressed. */
  remove(required: { workspaceId: string; address: string; scope: MailSuppressionScope; removalReason: string; removedBy: string }): Promise<MailSuppressionRemoval | null>;
  /** The newest verified webhook event for a provider; only verified events are ever recorded. */
  lastFeedbackEvent(required: { workspaceId: string; providerId: string }): Promise<{ kind: "delivered" | "bounced" | "complained"; receivedAt: string } | null>;
}

type Row = { normalized_address: string; scope: MailSuppressionScope; reason: MailSuppressionReason; created_at: string };

const toEntry = (row: Row): MailSuppressionEntry => ({ address: row.normalized_address, scope: row.scope, reason: row.reason, createdAt: row.created_at });
const normalize = (address: string): string => address.trim().toLowerCase();
const likeLiteral = (term: string): string => `%${normalize(term).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

function conditions(workspaceId: string, optional: MailSuppressionListFilter): RawBuilder<unknown>[] {
  const where: RawBuilder<unknown>[] = [sql`workspace_id = ${workspaceId}`];
  if (optional.search) where.push(sql`normalized_address LIKE ${likeLiteral(optional.search)} ESCAPE '\\'`);
  if (optional.scope) where.push(sql`scope = ${optional.scope}`);
  if (optional.reason) where.push(sql`reason = ${optional.reason}`);
  if (optional.before) where.push(sql`created_at <= ${optional.before.createdAt}`);
  return where;
}

/**
 * @complexity One indexed page read per list; O(1) primary-key statements per find/remove.
 * @example createMailSuppressionAdminRepo({ db: kernel }).list({ workspaceId, limit: 26 }, { search: "example.com" })
 */
export function createMailSuppressionAdminRepo<DB>({ db }: MailRepoDeps<DB>, optional: { nowIso?: () => string; newId?: () => string } = {}): MailSuppressionAdminRepo {
  const nowIso = optional.nowIso ?? (() => new Date().toISOString());
  const newId = optional.newId ?? randomUUID;
  const find: MailSuppressionAdminRepo["find"] = async ({ workspaceId, address, scope }) => {
    const [row] = await db.query<Row>(sql`SELECT normalized_address, scope, reason, created_at FROM mail_suppression
      WHERE workspace_id = ${workspaceId} AND normalized_address = ${normalize(address)} AND scope = ${scope}`);
    return row ? toEntry(row) : null;
  };
  return {
    async list(required, filter = {}) {
      const rows = await db.query<Row>(sql`SELECT normalized_address, scope, reason, created_at FROM mail_suppression
        WHERE ${sql.join(conditions(required.workspaceId, filter), sql` AND `)}
        ORDER BY created_at DESC, normalized_address DESC, scope DESC LIMIT ${required.limit} OFFSET ${filter.before?.skip ?? 0}`);
      return rows.map(toEntry);
    },
    find,
    remove: (required) => db.transaction(async () => {
      const entry = await find(required);
      if (!entry) return null;
      const removal: MailSuppressionRemoval = {
        id: newId(), address: entry.address, scope: entry.scope, suppressionReason: entry.reason, suppressedAt: entry.createdAt,
        removalReason: required.removalReason, removedBy: required.removedBy, removedAt: nowIso(),
      };
      await db.execute(sql`INSERT INTO mail_suppression_removals (id, workspace_id, normalized_address, scope, suppression_reason, suppressed_at, removal_reason, removed_by, removed_at)
        VALUES (${removal.id}, ${required.workspaceId}, ${removal.address}, ${removal.scope}, ${removal.suppressionReason}, ${removal.suppressedAt}, ${removal.removalReason}, ${removal.removedBy}, ${removal.removedAt})`);
      await db.execute(sql`DELETE FROM mail_suppression WHERE workspace_id = ${required.workspaceId} AND normalized_address = ${removal.address} AND scope = ${removal.scope}`);
      return removal;
    }),
    async lastFeedbackEvent({ workspaceId, providerId }) {
      const [row] = await db.query<{ kind: "delivered" | "bounced" | "complained"; received_at: string }>(sql`SELECT kind, received_at FROM mail_feedback_inbox
        WHERE workspace_id = ${workspaceId} AND provider_id = ${providerId} ORDER BY received_at DESC, event_id DESC LIMIT 1`);
      return row ? { kind: row.kind, receivedAt: row.received_at } : null;
    },
  };
}
