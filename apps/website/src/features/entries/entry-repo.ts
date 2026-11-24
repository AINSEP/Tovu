import { SqlEntryRepo } from "@jini-ai/cms/entries/sql";
import { jsonScalarEquals, jsonSortKey } from "@jini-ai/db/kernel";
import { invalidateMediaAccessEvidence } from "#src/platform/media-access-evidence";
import { type ContentKernel, contentKernel, schemaErasedKernel } from "../../platform/db/content-kernel.js";
import { ENTRY_TABLES } from "../../platform/db/content-tables.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";

/**
 * @file The entry repo on a site's content database: Jini's {@link SqlEntryRepo} (the one Kysely query
 * body, `@jini-ai/cms/entries/sql`) bound to Tovu's table names, the connection's JSON dialect helpers and
 * the host's media-access invalidation hook. A function, not a subclass: there is nothing to override.
 */

/** The entry repo for the connection's kernel, or the content db handle it is derived from. */
export function entryRepoFor({ store }: { store: ContentKernel | ContentDb }, _optional: Record<string, never> = {}): SqlEntryRepo {
  const kernel = contentKernel({ store });
  return new SqlEntryRepo({
    kernel: schemaErasedKernel({ store: kernel }),
    tables: ENTRY_TABLES,
    json: {
      scalarEquals: ({ column, path, value }) => jsonScalarEquals({ dialect: kernel.dialect, column, path, value }),
      sortKey: ({ column, path }) => jsonSortKey({ dialect: kernel.dialect, column, path }),
    },
    onWriteSettled: ({ repo }) => invalidateMediaAccessEvidence({ owner: repo }),
  }, {});
}
