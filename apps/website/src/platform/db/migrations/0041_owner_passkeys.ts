import { Kysely, SqliteDialect, type SchemaModule } from 'kysely';
import type { StorageDialect } from '../kernel/port.js';
import type { MigrationStep } from './step.js';

/** Public keys only; scope/credential uniqueness prevents rebinding another owner's key. */
export function ownerPasskeysSchema({ schema, dialect }: { schema: SchemaModule; dialect: StorageDialect }, _options: Record<string, never> = {}) {
  return [schema.createTable('owner_passkeys')
    .addColumn('workspace_id', 'text', c => c.notNull())
    .addColumn('principal_id', 'text', c => c.notNull())
    .addColumn('credential_id', 'text', c => c.notNull())
    .addColumn('public_key', 'text', c => c.notNull())
    .addColumn('counter', dialect === 'sqlite' ? 'integer' : 'bigint', c => c.notNull())
    .addColumn('rp_id', 'text', c => c.notNull())
    .addPrimaryKeyConstraint('owner_passkeys_workspace_credential_pk', ['workspace_id', 'credential_id']),
    schema.createIndex('idx_owner_passkeys_scope').on('owner_passkeys').columns(['workspace_id', 'principal_id'])];
}
const schema = new Kysely<unknown>({ dialect: new SqliteDialect({ database: {} as never }) }).schema;
export const OWNER_PASSKEYS_SQL = ownerPasskeysSchema({ schema, dialect: 'sqlite' }).map(s => s.compile().sql);
/** Append one credential table; reuse existing bounded MFA challenges. O(1) DDL, no data rewrite. */
export function ownerPasskeys({ checksum }: { checksum: string }, _options: Record<string, never> = {}): MigrationStep {
  return { id: '0041_owner_passkeys', checksum, async up(kernel) {
    await kernel.run(async db => {
      for (const statement of ownerPasskeysSchema({ schema: db.schema, dialect: kernel.dialect })) await statement.execute();
    });
  } };
}
