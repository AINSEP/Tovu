import { type ContentKernel, contentKernel } from "../../platform/db/content-kernel.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import { SqlFormDefinitionRepo, SqlFormSubmissionRepo } from "./repo.js";

/**
 * @file The forms repos on a site's SQLite `content.db`: {@link SqlFormDefinitionRepo} and
 * {@link SqlFormSubmissionRepo} (the one Kysely query body, `repo.ts`). Kept as named classes so
 * existing call sites that construct them from the content db handle stay as they are; new code
 * calls `formDefinitionRepoFor` / `formSubmissionRepoFor`.
 */
export class SqliteFormDefinitionRepo extends SqlFormDefinitionRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}

export class SqliteFormSubmissionRepo extends SqlFormSubmissionRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}
