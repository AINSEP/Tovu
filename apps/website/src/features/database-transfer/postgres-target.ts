/** Compatibility adapter; credential/psql rationale now lives in @jini-ai/db/transfer. */
import { createPsqlPostgresTarget as createTarget, parseConnectionString as parse, type PostgresTargetPort } from "@jini-ai/db/transfer";
export { InvalidConnectionStringError } from "@jini-ai/db/transfer";
export type { PostgresTargetPort, TargetDescription, TargetResult } from "@jini-ai/db/transfer";
export function parseConnectionString(raw: string) { return parse({ raw }, { applicationName: "tovu-database-transfer" }); }
export function createPsqlPostgresTarget(connectionString: string, parentEnv: NodeJS.ProcessEnv = process.env): PostgresTargetPort {
  return createTarget({ connectionString }, { parentEnv, applicationName: "tovu-database-transfer" });
}
