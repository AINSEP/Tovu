import { SqlPublishContentPeerRepo } from "./publish-content-peer-repo.js";

/**
 * @file The publish-content peer repo on a site's SQLite `content.db`: {@link SqlPublishContentPeerRepo} (the one Kysely
 * query body, `repos/publish-content-peer-repo.ts`), kept as a named class so the call sites that build it from the
 * composed kernel stay as they are.
 */
export class SqlitePublishContentPeerRepo extends SqlPublishContentPeerRepo {}
