import { sql } from "kysely";
import type { KyselyKernel } from "@jini-ai/db/kernel";
import type { MigrationStep } from "@jini-ai/core/contracts/storage";

/**
 * @file Migration 0043: a nullable `created_by_kind` column on `webhook_subscriptions`.
 *
 * The Jini SQL webhook adapter records who created a subscription (a person or an agent) so the
 * delivery worker can pause agent-created subscriptions when the agent switch is off. It writes the
 * column on every insert, so a database without it fails every subscription insert.
 *
 * Additive and O(1): nullable, no default, no row rewrite. Rows from before this step stay NULL,
 * which the adapter reads back as unattributed (a person). Portable DDL for SQLite and Postgres,
 * shared with the fresh-database bootstrap. Added as an ADR-066 step: the Drizzle chain is frozen.
 */
export const WEBHOOK_SUBSCRIPTION_CREATOR_KIND_ID = "0043_webhook_subscription_creator_kind";

export const WEBHOOK_SUBSCRIPTION_CREATOR_KIND_STATEMENTS = [
  "ALTER TABLE webhook_subscriptions ADD COLUMN created_by_kind text",
] as const;

async function up(kernel: KyselyKernel<unknown>): Promise<void> {
  for (const statement of WEBHOOK_SUBSCRIPTION_CREATOR_KIND_STATEMENTS) await kernel.execute(sql.raw(statement));
}

/** Build the immutable ADR-066 step. @example webhookSubscriptionCreatorKind({ checksum: pinnedChecksum }) */
export function webhookSubscriptionCreatorKind(required: { checksum: string }, _options: Record<string, never> = {}): MigrationStep<KyselyKernel<unknown>> {
  return { id: WEBHOOK_SUBSCRIPTION_CREATOR_KIND_ID, checksum: required.checksum, up };
}
