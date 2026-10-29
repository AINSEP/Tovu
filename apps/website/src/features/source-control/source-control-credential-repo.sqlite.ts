import { SqlSourceControlCredentialSetRepo } from "./source-control-credential-repo.js";

/**
 * @file The source-control credential set repo on a site's SQLite `content.db`: {@link SqlSourceControlCredentialSetRepo} (the one Kysely
 * query body, `repos/source-control-credential-repo.ts`), kept as a named class so the call sites that build it
 * from the composed kernel stay as they are.
 *
 * The kernel is supplied by composition; `optional.project` is the
 * project store its rows fall back to (`features/source-control/types.ts`). */
export class SqliteSourceControlCredentialSetRepo extends SqlSourceControlCredentialSetRepo {}
