import { sql } from "kysely";
import type { KyselyKernel } from "@jini-ai/db/kernel";
import type { MigrationStep } from "@jini-ai/core/contracts/storage";

/** Existing activity remains readable; diagnostic text is never reconstructed from old codes. */
export const MAIL_ACTIVITY_MESSAGE_SQL = "ALTER TABLE mail_activity_attempts ADD COLUMN message text";

/** Add nullable, redacted provider diagnostics without rewriting existing activity.
 * @complexity O(1) additive DDL; errors propagate through the migration transaction.
 */
async function up(kernel: KyselyKernel<unknown>): Promise<void> {
  await kernel.execute(sql.raw(MAIL_ACTIVITY_MESSAGE_SQL));
}

/** Immutable activity diagnostic migration. */
export function mailActivityMessage(required: { checksum: string }, _options: Record<string, never> = {}): MigrationStep<KyselyKernel<unknown>> {
  return { id: "0033_mail_activity_message", checksum: required.checksum, up };
}
