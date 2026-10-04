import { sql } from "kysely";
import type { StorageKernel } from "../kernel/port.js";
import type { MigrationStep } from "./step.js";

async function up(kernel: StorageKernel<unknown>): Promise<void> {
  await kernel.execute(sql`ALTER TABLE media ADD COLUMN created_by text`);
}

export const mediaCreatedBy = (required: { checksum: string },
  _optional: Record<string, never> = {}): MigrationStep => ({
  id: "0005_media_createdby", checksum: required.checksum, up,
});
