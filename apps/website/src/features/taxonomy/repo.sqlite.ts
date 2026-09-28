import { type ContentKernel, contentKernel } from "../../platform/db/content-kernel.js";
import { stampWatermarkTx, type ContentDbTransaction } from "../../platform/db/sqlite/watermark.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import { SqlEntryTermRepo, SqlTaxonomyRepo, SqlTaxonomyRevisionRepo, SqlTermRepo } from "./repo.js";

/**
 * @file The taxonomy repos on a site's SQLite `content.db`: thin named subclasses of the one Kysely
 * query body in `repo.ts` (`SqlTaxonomyRepo` / `SqlTermRepo` / `SqlEntryTermRepo` /
 * `SqlTaxonomyRevisionRepo`), kept so existing call sites that construct them from the content db
 * handle stay as they are; new code calls the `…For(kernel, workspaceId)` factories. Also
 * {@link sqliteStampWatermark}, the sync render-path watermark binding (not part of the repos).
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

/** Sync `WriteServiceDeps.stampWatermark` binding over the real `content.db` watermark
 * (`db/sqlite/watermark.ts`'s certified `stampWatermarkTx`) — see that module's own
 * doc comment for why passing the plain `db` handle is safe here (no `db.transaction()` wraps
 * `taxonomy/write-service.ts`'s own mutations, so each call is its own implicit autocommit
 * statement; this stamp call is likewise its own autocommit statement, same atomicity envelope
 * every other individual write in this write-service already has). Disclosed narrowing, not a
 * silent gap: this package's write-service never wraps its own multi-row writes in one
 * transaction at all (see `write-service.ts`'s header), so the watermark stamp cannot be made any
 * more atomic with its sibling writes than those sibling writes already are with each other. */
export function sqliteStampWatermark(db: ContentDb): () => void {
  return () => {
    stampWatermarkTx({ tx: db as unknown as ContentDbTransaction });
  };
}
