import { sql } from "kysely";
import type { KyselyKernel } from "@jini-ai/db/kernel";
import type { MigrationStep } from "@jini-ai/core/contracts/storage";

async function up(kernel: KyselyKernel<unknown>): Promise<void> {
  const jsonType = sql.raw(kernel.dialect === "postgres" ? "jsonb" : "text");
  await kernel.execute(sql`CREATE TABLE publish_backstop_log (
    id text PRIMARY KEY NOT NULL, workspace_id text NOT NULL,
    direction text NOT NULL CONSTRAINT publish_backstop_log_direction_check CHECK(direction IN ('source','destination')),
    actor_id text NOT NULL, destination text NOT NULL, reason text NOT NULL,
    at text NOT NULL, items_json ${jsonType} NOT NULL, gap_labels_json ${jsonType} NOT NULL,
    result text NOT NULL, run_id text, details_json ${jsonType} NOT NULL, inverses_json ${jsonType} NOT NULL
  )`);
  await kernel.execute(sql`CREATE INDEX publish_backstop_log_workspace_at ON publish_backstop_log(workspace_id, at)`);
  await kernel.execute(sql`CREATE INDEX publish_backstop_log_run ON publish_backstop_log(workspace_id, run_id)`);
}

export const publishBackstop = (required: { checksum: string },
  _optional: Record<string, never> = {}): MigrationStep<KyselyKernel<unknown>> => ({
  id: "0007_publish_backstop", checksum: required.checksum, up,
});
