import { type ContentKernel, contentKernel, schemaErasedKernel } from "../../platform/db/content-kernel.js";
import { POST_SEARCH_HOST } from "./search-host-config.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import { SqlPostRepo } from "@jini-ai/cms/posts/sql/repo";
import type { MediaAccessEvidence } from "@jini-ai/cms/media/site/access-evidence";
import { postSearchFor } from "@jini-ai/cms/posts/sql";
import { currentIso } from "@jini-ai/core/scheduled-publish";
import { createHash, randomUUID } from "node:crypto";
import { postRevisionLockKey } from "@jini-ai/core/contracts/site/post-revision-lock";

/**
 * @file The post repo on a site's SQLite `content.db`: {@link SqlPostRepo} (the one Kysely query
 * body, `repo.ts`) with its dialect's search projection (FTS5 here). Kept as a named class for callers
 * that construct it from a content db handle; new code calls `postRepoFor`.
 */
export class SqlitePostRepo extends SqlPostRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor({ store, mediaAccessEvidence }: { store: ContentKernel | ContentDb; mediaAccessEvidence: MediaAccessEvidence }) {
    const kernel = contentKernel({ store });
    super({ kernel: schemaErasedKernel({ store: kernel }), search: postSearchFor(schemaErasedKernel({ store: kernel }), POST_SEARCH_HOST), mediaAccessEvidence,
      nowIso: currentIso, newId: randomUUID, hashJsonText: text => createHash("sha256").update(text).digest("hex"), postRevisionLockKey });
  }
}
