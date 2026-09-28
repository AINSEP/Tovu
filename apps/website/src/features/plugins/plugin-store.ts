import type { Generated } from "kysely";

import { type ContentKernel, contentKernel } from "../../platform/db/content-kernel.js";
import type { SqliteConnectionSource } from "../../platform/db/kernel/drivers/sqlite.js";
import type { StorageKernel } from "../../platform/db/kernel/port.js";

/**
 * @file The database a plugin data module works on: the storage kernel, whichever driver is
 * underneath (ADR-066). The core's own `_plugin_*` bookkeeping tables are typed here; the plugins'
 * own `p_{pluginId}__*` tables are declared at runtime and reached through raw kernel statements.
 */

/**
 * A kernel over ANY table typing (a `ContentKernel`, a `PluginKernel`…), or a SQLite connection (raw
 * client or Drizzle handle) while call sites still pass one. `any`: a `Kysely<DB>` is invariant in
 * `DB`, so no narrower type admits every kernel; the engine only reads its own tables through it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PluginStore = StorageKernel<any> | SqliteConnectionSource;

export interface PluginCoreTables {
  _plugin_migration_journal: {
    id: Generated<number>;
    plugin_id: string;
    phase: string;
    snapshot_path: string;
    started_at: number;
    updated_at: number;
  };
  _plugin_identity: {
    plugin_id: string;
    source_url: string;
    publisher: string;
    signature: string | null;
    minted_at: number;
  };
  _plugin_migrations: {
    id: Generated<number>;
    plugin_id: string;
    table_name: string;
    ddl: string;
    snapshot_path: string | null;
    at: number;
  };
}

export type PluginKernel = StorageKernel<PluginCoreTables>;

/** The kernel behind `store`: the kernel itself, or the one kernel of a SQLite connection. */
export function pluginKernel(store: PluginStore): PluginKernel {
  // The type parameter only names the tables Kysely checks queries against; the kernel is the same.
  return contentKernel(store as ContentKernel | SqliteConnectionSource) as unknown as PluginKernel;
}
