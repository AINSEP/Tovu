import { type ContentKernel, contentKernel } from "../content-kernel.js";
import { SqlSiteAssistantCredentialRepo } from "../repos/site-credential-repo.js";
import type { ContentDb } from "./content-db.js";

/**
 * @file The site assistant credential repo on a site's SQLite `content.db`: {@link
 * SqlSiteAssistantCredentialRepo} (the one Kysely query body, `repos/site-credential-repo.ts`),
 * kept as a named class so the call sites that build it from the content db handle stay as they
 * are.
 */
export class SqliteSiteAssistantCredentialRepo extends SqlSiteAssistantCredentialRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}
