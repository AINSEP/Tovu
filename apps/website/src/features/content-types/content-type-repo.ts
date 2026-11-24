import { SqlContentTypeRepo } from "@jini-ai/cms/content-types/sql";
import { DECLARED_CONTENT_TYPE_OWNERS } from "@jini-ai/cms/widgets/site/declared-content-type-owners";
import { type ContentKernel, schemaErasedKernel } from "../../platform/db/content-kernel.js";
import { CONTENT_TYPE_TABLES } from "../../platform/db/content-tables.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";

/**
 * @file The content-type repo on a site's content database: Jini's {@link SqlContentTypeRepo} (the one
 * Kysely query body, `@jini-ai/cms/content-types/sql`) bound to Tovu's table names and declared owners.
 * A function, not a subclass: there is nothing to override.
 */

/** The content-type repo for the connection's kernel, or the content db handle it is derived from. */
export function contentTypeRepoFor({ store }: { store: ContentKernel | ContentDb }, _optional: Record<string, never> = {}): SqlContentTypeRepo {
  return new SqlContentTypeRepo({ kernel: schemaErasedKernel({ store }), tables: CONTENT_TYPE_TABLES, declaredOwners: DECLARED_CONTENT_TYPE_OWNERS }, {});
}
