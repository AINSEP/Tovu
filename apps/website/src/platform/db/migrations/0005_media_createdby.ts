import { sql } from "kysely";
import type { KyselyKernel } from "@jini-ai/db/kernel";
import type { MigrationStep } from "@jini-ai/core/contracts/storage";

async function up(kernel: KyselyKernel<unknown>): Promise<void> {
  await kernel.execute(sql`ALTER TABLE media ADD COLUMN created_by text`);
}

export const mediaCreatedBy = (required: { checksum: string },
  _optional: Record<string, never> = {}): MigrationStep<KyselyKernel<unknown>> => ({
  id: "0005_media_createdby", checksum: required.checksum, up,
});
