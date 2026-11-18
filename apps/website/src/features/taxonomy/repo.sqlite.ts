import { SqlEntryTermRepo, SqlTaxonomyRepo, SqlTaxonomyRevisionRepo, SqlTermRepo } from "@jini-ai/cms/taxonomy/sql";
import { type ContentKernel, schemaErasedKernel } from "../../platform/db/content-kernel.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";

/** Tovu owns the persisted table names. */
export const TAXONOMY_TABLES = {
  taxonomies: "taxonomies",
  terms: "terms",
  entryTerms: "entry_terms",
  taxonomyRevisions: "taxonomy_revisions",
} as const;

/**
 * @file The taxonomy repos on a site's SQLite `content.db`: thin named subclasses of the one Kysely
 * query body in Jini `@jini-ai/cms/taxonomy/sql` (`SqlTaxonomyRepo` / `SqlTermRepo` / `SqlEntryTermRepo` /
 * `SqlTaxonomyRevisionRepo`), kept so existing call sites that construct them from the content db
 * handle stay as they are; kernel callers construct the SQL classes directly.
 *
 * The port-adjacent read types (`TaxonomyPublishReadPort` and friends) are Jini's, from `@jini-ai/cms/taxonomy`.
 */

/** Constructor deps shared by every class here: the connection's kernel (or the db handle it derives from). */
interface SqliteTaxonomyDeps {
  db: ContentKernel | ContentDb;
  workspaceId: string;
}

export class SqliteTaxonomyRepo extends SqlTaxonomyRepo {
  constructor(deps: SqliteTaxonomyDeps) {
    super({ kernel: schemaErasedKernel({ store: deps.db }), tables: TAXONOMY_TABLES, workspaceId: deps.workspaceId }, {});
  }
}

export class SqliteTermRepo extends SqlTermRepo {
  constructor(deps: SqliteTaxonomyDeps) {
    super({ kernel: schemaErasedKernel({ store: deps.db }), tables: TAXONOMY_TABLES, workspaceId: deps.workspaceId }, {});
  }
}

export class SqliteEntryTermRepo extends SqlEntryTermRepo {
  constructor(deps: SqliteTaxonomyDeps) {
    super({ kernel: schemaErasedKernel({ store: deps.db }), tables: TAXONOMY_TABLES, workspaceId: deps.workspaceId }, {});
  }
}

export class SqliteTaxonomyRevisionRepo extends SqlTaxonomyRevisionRepo {
  constructor(deps: SqliteTaxonomyDeps) {
    super({ kernel: schemaErasedKernel({ store: deps.db }), tables: TAXONOMY_TABLES, workspaceId: deps.workspaceId }, {});
  }
}
