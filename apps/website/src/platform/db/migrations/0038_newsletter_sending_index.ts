import { Kysely, SqliteDialect, type SchemaModule } from 'kysely';
import type { MigrationStep } from './step.js';

/** Common DDL for upgrades and the synchronous fresh SQLite constructor; no campaign data changes. */
export function newsletterSendingIndexSchema({ schema }: { schema: SchemaModule }, _options = {}) {
  return schema.createIndex('idx_newsletter_campaigns_status').ifNotExists()
    .on('newsletter_campaigns').columns(['workspace_id', 'status']);
}

// Compile only: fresh bootstrap must stay synchronous and use the migration's own DDL.
const sqliteSchema = new Kysely<unknown>({ dialect: new SqliteDialect({ database: {} as never }) }).schema;
export const NEWSLETTER_SENDING_INDEX_SQL = newsletterSendingIndexSchema({ schema: sqliteSchema }).compile().sql;

/** Cover the lifecycle's workspace/status existence read without touching campaign payloads.
 * @returns The append-only ADR-066 migration; no data changes.
 * @complexity O(campaigns) once at migration; later probes are indexed and return one scalar.
 */
export function newsletterSendingIndex({ checksum }: { checksum: string }, _options = {}): MigrationStep {
  return { id: '0038_newsletter_sending_index', checksum,
    async up(kernel) {
      await kernel.run(db => newsletterSendingIndexSchema({ schema: db.schema }).execute());
    },
  };
}
