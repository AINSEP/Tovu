import { SqlCustomCredentialSetRepo } from "./custom-credential-repo.js";

/**
 * @file The custom credential set repo on a site's SQLite `content.db`: {@link
 * SqlCustomCredentialSetRepo} (the one Kysely query body, `repos/custom-credential-repo.ts`), kept
 * as a named class so the call sites that build it from the composed kernel stay as they are.
 *
 * The kernel is supplied by composition; `optional.project` is the
 * project store its rows fall back to (`features/custom-credentials/types.ts`). */
export class SqliteCustomCredentialSetRepo extends SqlCustomCredentialSetRepo {}
