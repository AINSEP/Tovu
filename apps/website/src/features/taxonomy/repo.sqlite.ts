import { type ContentKernel, contentKernel } from "../../platform/db/content-kernel.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import { SqlEntryTermRepo, SqlTaxonomyRepo, SqlTaxonomyRevisionRepo, SqlTermRepo } from "./repo.js";

/**
 * @file The taxonomy repos on a site's SQLite `content.db`: thin named subclasses of the one Kysely
 * query body in `repo.ts` (`SqlTaxonomyRepo` / `SqlTermRepo` / `SqlEntryTermRepo` /
 * `SqlTaxonomyRevisionRepo`), kept so existing call sites that construct them from the content db
 * handle stay as they are; new code calls the `…For(kernel, workspaceId)` factories.
 *
 * The port-adjacent types live with the query body and are re-exported here for their importers.
 */

export type { AssignedTermView, EntryTermReadPort, TaxonomyPublishReadPort, TermPublishReadPort } from "./repo.js";

/** Constructor deps shared by every class here: the connection's kernel (or the db handle it derives from). */
interface SqliteTaxonomyDeps {
  db: ContentKernel | ContentDb;
  workspaceId: string;
}

export class SqliteTaxonomyRepo extends SqlTaxonomyRepo {
  constructor(deps: SqliteTaxonomyDeps) {
    super(contentKernel(deps.db), deps.workspaceId);
  }
}

export class SqliteTermRepo extends SqlTermRepo {
  constructor(deps: SqliteTaxonomyDeps) {
    super(contentKernel(deps.db), deps.workspaceId);
  }
}

export class SqliteEntryTermRepo extends SqlEntryTermRepo {
  constructor(deps: SqliteTaxonomyDeps) {
    super(contentKernel(deps.db), deps.workspaceId);
  }
}

export class SqliteTaxonomyRevisionRepo extends SqlTaxonomyRevisionRepo {
  constructor(deps: SqliteTaxonomyDeps) {
    super(contentKernel(deps.db), deps.workspaceId);
  }
}
