import { publishTrustRevocations } from "../schema.sqlite.js";
import { contentKernel } from "../content-kernel.js";
import { publishTrustRevocationStoreUnavailable, SqlPublishTrustRevocationStore } from "../repos/publish-trust-revocations.js";
import type { ContentDb } from "./content-db.js";

/**
 * @file The publish-trust deny store on a site's SQLite `content.db`: {@link
 * SqlPublishTrustRevocationStore} (the one Kysely query body, `repos/publish-trust-revocations.ts`).
 *
 * Construction proves the table is readable, synchronously, because the SQLite composition root
 * (`createSqliteRouteDeps`) is synchronous: a missing or inaccessible deny store stops boot rather
 * than making every disconnected publisher silently look connected. That one probe is the only
 * Drizzle query left here; an async composition root uses `publishTrustRevocationStoreFor` instead.
 */
export class SqlitePublishTrustRevocationStore extends SqlPublishTrustRevocationStore {
  constructor(db: ContentDb) {
    super(contentKernel(db));
    try {
      db.select({ sourceInstallationId: publishTrustRevocations.sourceInstallationId })
        .from(publishTrustRevocations)
        .limit(1)
        .all();
    } catch (error) {
      throw publishTrustRevocationStoreUnavailable(error);
    }
  }
}
