import { SqlEntryRepo } from "@jini-ai/cms/entries/sql";
import { jsonScalarEquals, jsonSortKey } from "@jini-ai/db/kernel";
import { invalidateMediaAccessEvidence } from "#src/platform/media-access-evidence";
import { type ContentKernel, contentKernel, schemaErasedKernel } from "../../platform/db/content-kernel.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";

/** Tovu owns the persisted table names. */
export const ENTRY_TABLES = { entries: "entries", revisions: "entry_revisions" } as const;

/**
 * @file The entry repo on a site's SQLite `content.db`: {@link SqlEntryRepo} (the one Kysely query
 * body, in Jini `@jini-ai/cms/entries/sql`). Kept as a named class so callers can construct it from a content db handle or
 * kernel; new code calls `SqliteEntryRepo`.
 */
/** The entry repo for `kernel`. */
export class SqliteEntryRepo extends SqlEntryRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor({ store }: { store: ContentKernel | ContentDb }) {
    const kernel = contentKernel({ store });
    super({
      kernel: schemaErasedKernel({ store: kernel }),
      tables: ENTRY_TABLES,
      json: {
        scalarEquals: ({ column, path, value }) => jsonScalarEquals({ dialect: kernel.dialect, column, path, value }),
        sortKey: ({ column, path }) => jsonSortKey({ dialect: kernel.dialect, column, path }),
      },
      onWriteSettled: ({ repo }) => invalidateMediaAccessEvidence({ owner: repo }),
    }, {});
  }
}
