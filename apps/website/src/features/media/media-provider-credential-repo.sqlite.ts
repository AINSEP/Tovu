import { SqlMediaProviderCredentialRepo } from "./media-provider-credential-repo.js";

/**
 * @file The media provider credential repo on a site's SQLite `content.db`: {@link
 * SqlMediaProviderCredentialRepo} (the one Kysely query body,
 * `repos/media-provider-credential-repo.ts`), kept as a named class so the call sites that build it
 * from the composed kernel stay as they are.
 */
export class SqliteMediaProviderCredentialRepo extends SqlMediaProviderCredentialRepo {}
