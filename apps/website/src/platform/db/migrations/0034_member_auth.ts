import { sql } from "kysely";
import type { StorageDialect, StorageKernel } from "../kernel/port.js";
import type { MigrationStep } from "./step.js";

/** Keep legacy credentials usable; Postgres counters follow the generated schema's bigint mapping. */
export function memberAuthStatements(required: { dialect: StorageDialect }, _options: Record<string, never> = {}): readonly string[] {
  return [
    "ALTER TABLE members ADD COLUMN password_hash text",
    "ALTER TABLE member_magic_tokens ADD COLUMN code_hash text",
    `ALTER TABLE member_magic_tokens ADD COLUMN failed_attempts ${required.dialect === "postgres" ? "bigint" : "integer"} NOT NULL DEFAULT 0`,
  ];
}

/** Add credential storage inside the runner's transaction; errors propagate.
 * @complexity O(1) additive DDL, without a credential or challenge data rewrite.
 */
async function up(kernel: StorageKernel<unknown>): Promise<void> {
  for (const statement of memberAuthStatements({ dialect: kernel.dialect })) await kernel.execute(sql.raw(statement));
}

/** Immutable member credential migration. @example memberAuth({ checksum }) */
export function memberAuth(required: { checksum: string }, _options: Record<string, never> = {}): MigrationStep {
  return { id: "0034_member_auth", checksum: required.checksum, up };
}
