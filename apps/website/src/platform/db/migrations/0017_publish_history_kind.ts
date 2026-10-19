import { sql } from "kysely";
import type { StorageKernel } from "../kernel/port.js";
import type { MigrationStep } from "./step.js";

/** Keep legacy rows static while distinguishing outbound pushes and server deploys in one ledger. */
async function up(kernel: StorageKernel<unknown>): Promise<void> {
  await kernel.execute(sql`ALTER TABLE publish_history ADD COLUMN kind text DEFAULT 'static'`);
}

/** Add the nullable discriminator in both dialects. @example publishHistoryKind({ checksum }) */
export function publishHistoryKind(required: { checksum: string }, _options: Record<string, never> = {}): MigrationStep {
  return { id: "0017_publish_history_kind", checksum: required.checksum, up };
}
