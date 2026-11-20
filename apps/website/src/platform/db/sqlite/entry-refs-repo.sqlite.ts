import { type ContentKernel, schemaErasedKernel } from "../content-kernel.js";
import type { ContentDatabase } from "../content-database.generated.js";
import type { ContentDb } from "./content-db.js";
import { SqlEntryRefsRepo, type EntryRefsSqlRow } from "@jini-ai/cms/widgets/sql";

true satisfies (ContentDatabase["entry_refs"] extends EntryRefsSqlRow
  ? EntryRefsSqlRow extends ContentDatabase["entry_refs"] ? true : false
  : false);

/**
 * @file The entry-refs repo on a site's SQLite `content.db`: the one Kysely query body
 * (`repos/entry-refs-repo.ts`), kept under the `SqliteEntryRefsRepo` name so the composition root
 * that builds it from the content db handle stays as it is. New code calls `entryRefsRepoFor`.
 */
export class SqliteEntryRefsRepo extends SqlEntryRefsRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor({ store }: { store: ContentKernel | ContentDb }) {
    super({ kernel: schemaErasedKernel({ store }), tables: { entryRefs: "entry_refs" } });
  }
}
