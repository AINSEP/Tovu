import { Kysely, SqliteDialect, type SchemaModule } from 'kysely';
import type { MigrationStep } from './step.js';

/** Shared DDL for upgrades and synchronous fresh SQLite bootstrap; only scoped digests persist. */
export function ownerRecoveryCodesSchema({ schema }: { schema: SchemaModule }, _options: Record<string, never> = {}) {
  return schema.createTable('owner_recovery_codes')
    .addColumn('workspace_id', 'text', column => column.notNull())
    .addColumn('principal_id', 'text', column => column.notNull())
    .addColumn('code_hash', 'text', column => column.notNull())
    .addPrimaryKeyConstraint('owner_recovery_codes_workspace_id_principal_id_code_hash_pk', ['workspace_id', 'principal_id', 'code_hash']);
}

const sqliteSchema = new Kysely<unknown>({ dialect: new SqliteDialect({ database: {} as never }) }).schema;
export const OWNER_RECOVERY_CODES_SQL = ownerRecoveryCodesSchema({ schema: sqliteSchema }).compile().sql;

/** Append the recovery table without changing existing identity data.
 * @returns The checksum-pinned ADR-066 step, applied once by the migration runner.
 * @complexity O(1) DDL for one empty table and its composite primary key.
 */
export function ownerRecoveryCodes({ checksum }: { checksum: string }, _options: Record<string, never> = {}): MigrationStep {
  return { id: '0039_owner_recovery_codes', checksum,
    async up(kernel) {
      await kernel.run(db => ownerRecoveryCodesSchema({ schema: db.schema }).execute());
    },
  };
}
