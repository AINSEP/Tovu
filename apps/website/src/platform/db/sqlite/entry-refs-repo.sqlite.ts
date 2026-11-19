import { type ContentKernel, schemaErasedKernel } from "../content-kernel.js";
import type { ContentDatabase } from "../content-database.generated.js";
import type { ContentDb } from "./content-db.js";
import { SqlEntryRefsRepo, type EntryRefsSqlRow } from "@jini-ai/cms/widgets/sql";

true satisfies (ContentDatabase["entry_refs"] extends EntryRefsSqlRow
  ? EntryRefsSqlRow extends ContentDatabase["entry_refs"] ? true : false
  : false);

/**
 * @file The entry-refs repo on a site's SQLite `content.db`: Jini's `@jini-ai/cms/widgets/sql`
 * query body bound to the content kernel and `entry_refs` table, kept under the
 * `SqliteEntryRefsRepo` name for the composition root.
 */
export class SqliteEntryRefsRepo extends SqlEntryRefsRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor({ store }: { store: ContentKernel | ContentDb }) {
    super({ kernel: schemaErasedKernel({ store }), tables: { entryRefs: "entry_refs" } });
  }
}
