import { sql } from "kysely";
import type { KyselyKernel } from "@jini-ai/db/kernel";
import type { MigrationStep } from "@jini-ai/core/contracts/storage";

/** Keep legacy rows static while distinguishing outbound pushes and server deploys in one ledger. */
async function up(kernel: KyselyKernel<unknown>): Promise<void> {
  await kernel.execute(sql`ALTER TABLE publish_history ADD COLUMN kind text DEFAULT 'static'`);
}

/** Add the nullable discriminator in both dialects. @example publishHistoryKind({ checksum }) */
export function publishHistoryKind(required: { checksum: string }, _options: Record<string, never> = {}): MigrationStep<KyselyKernel<unknown>> {
  return { id: "0017_publish_history_kind", checksum: required.checksum, up };
}
