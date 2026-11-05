import { Kysely, SqliteDialect, type SchemaModule } from 'kysely';
import type { StorageDialect } from '../kernel/port.js';
import type { MigrationStep } from './step.js';

/** Shared owner-factor DDL; only sealed secrets and the last accepted library timestep persist. */
export function ownerMfaSchema(
  { schema, dialect }: { schema: SchemaModule; dialect: StorageDialect },
  _options: Record<string, never> = {},
) {
  const numeric = dialect === 'sqlite' ? 'integer' : 'bigint';
  return [
    schema.createTable('owner_mfa_factors')
      .addColumn('workspace_id', 'text', column => column.notNull())
      .addColumn('principal_id', 'text', column => column.notNull())
      .addColumn('sealed_secret', 'text', column => column.notNull())
      .addColumn('last_step', numeric, column => column.notNull())
      .addPrimaryKeyConstraint('owner_mfa_factors_workspace_id_principal_id_pk', ['workspace_id', 'principal_id']),
    schema.createTable('owner_mfa_pending')
      .addColumn('workspace_id', 'text', column => column.notNull())
      .addColumn('principal_id', 'text', column => column.notNull())
      .addColumn('purpose', 'text', column => column.notNull())
      .addColumn('token_hash', 'text', column => column.notNull())
      .addColumn('expires_at', numeric, column => column.notNull())
      .addColumn('attempts', numeric, column => column.notNull())
      .addColumn('sealed_secret', 'text')
      .addPrimaryKeyConstraint('owner_mfa_pending_workspace_id_principal_id_purpose_pk', ['workspace_id', 'principal_id', 'purpose']),
    schema.createIndex('idx_owner_mfa_pending_workspace_token').on('owner_mfa_pending').columns(['workspace_id', 'token_hash']).unique(),
  ];
}

const sqliteSchema = new Kysely<unknown>({ dialect: new SqliteDialect({ database: {} as never }) }).schema;
export const OWNER_MFA_SQL = ownerMfaSchema({ schema: sqliteSchema, dialect: 'sqlite' }).map(statement => statement.compile().sql);

/** Append owner MFA storage without changing existing credentials or recovery kits.
 * @complexity O(1) DDL: two empty tables and one unique lookup index.
 */
export function ownerMfa({ checksum }: { checksum: string }, _options: Record<string, never> = {}): MigrationStep {
  return { id: '0040_owner_mfa', checksum,
    async up(kernel) {
      await kernel.run(async db => {
        for (const statement of ownerMfaSchema({ schema: db.schema, dialect: kernel.dialect })) await statement.execute();
      });
    },
  };
}
