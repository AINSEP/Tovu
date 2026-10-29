import { SqlUserPurge } from "./user-purge.js";

/**
 * @file `UserPurgePort` on a site's SQLite `content.db`: {@link SqlUserPurge} (the one Kysely query
 * body, `user-purge.ts`), kept as a named class so the composition root and the trash user adapter,
 * which build it from the composed kernel, stay as they are.
 */
export class SqliteUserPurge extends SqlUserPurge {}
