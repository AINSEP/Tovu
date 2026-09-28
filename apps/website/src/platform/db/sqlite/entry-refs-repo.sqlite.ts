import { type ContentKernel, contentKernel } from "../content-kernel.js";
import type { ContentDb } from "./content-db.js";
import { SqlEntryRefsRepo } from "../repos/entry-refs-repo.js";

/**
 * @file The entry-refs repo on a site's SQLite `content.db`: the one Kysely query body
 * (`repos/entry-refs-repo.ts`), kept under the `SqliteEntryRefsRepo` name so the composition root
 * that builds it from the content db handle stays as it is. New code calls `entryRefsRepoFor`.
 */
export class SqliteEntryRefsRepo extends SqlEntryRefsRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}
