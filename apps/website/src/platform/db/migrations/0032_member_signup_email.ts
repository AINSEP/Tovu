import { sql } from "kysely";
import type { KyselyKernel } from "@jini-ai/db/kernel";
import type { MigrationStep } from "@jini-ai/core/contracts/storage";

/** New-address challenges hold identity until consumption; legacy member-bound links stay valid. */
export const MEMBER_SIGNUP_EMAIL_SQL = "ALTER TABLE member_magic_tokens ADD COLUMN email text";

/** Add the nullable challenge identity in the runner's transaction. Errors propagate.
 * @complexity O(1) DDL; no member creation or historical rewrite.
 */
async function up(kernel: KyselyKernel<unknown>): Promise<void> {
  await kernel.execute(sql.raw(MEMBER_SIGNUP_EMAIL_SQL));
}

/** Immutable additive member challenge migration. @example memberSignupEmail({ checksum }) */
export function memberSignupEmail(required: { checksum: string }, _options: Record<string, never> = {}): MigrationStep<KyselyKernel<unknown>> {
  return { id: "0032_member_signup_email", checksum: required.checksum, up };
}
