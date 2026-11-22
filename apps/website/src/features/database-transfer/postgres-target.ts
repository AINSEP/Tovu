/** Compatibility adapter; credential/psql rationale now lives in @jini-ai/db/transfer. */
import { createPsqlPostgresTarget as createTarget, type PostgresTargetPort } from "@jini-ai/db/transfer";
export function createPsqlPostgresTarget(
  { connectionString }: { connectionString: string },
  { parentEnv = process.env }: { parentEnv?: NodeJS.ProcessEnv } = {},
): PostgresTargetPort {
  return createTarget({ connectionString }, { parentEnv, applicationName: "tovu-database-transfer" });
}
