import { SqlVendorCredentialSetRepo } from "./vendor-credential-repo.js";

/**
 * @file The vendor credential set repo on a site's SQLite `content.db`: {@link SqlVendorCredentialSetRepo} (the one Kysely
 * query body, `repos/vendor-credential-repo.ts`), kept as a named class so the call sites that build it
 * from the composed kernel stay as they are.
 *
 * The kernel is supplied by composition; `optional.project` is the
 * project store its rows fall back to (`features/vendor-credentials/types.ts`). */
export class SqliteVendorCredentialSetRepo extends SqlVendorCredentialSetRepo {}
