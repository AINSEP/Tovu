import { SqlContentTypeRepo } from "@jini-ai/cms/content-types/sql";
import { type ContentKernel, schemaErasedKernel } from "../../platform/db/content-kernel.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import { DECLARED_CONTENT_TYPE_OWNERS } from "./declared-owners.js";

/** Tovu owns the persisted table names. */
export const CONTENT_TYPE_TABLES = { contentTypes: "content_types", revisions: "content_type_revisions" } as const;

/**
 * @file The content-type repo on a site's SQLite `content.db`: {@link SqlContentTypeRepo} (the one
 * Kysely query body, in Jini `@jini-ai/cms/content-types/sql`). Kept as a named class so existing call sites that construct it
 * from the content db handle stay available; new code calls `SqliteContentTypeRepo`.
 */
export class SqliteContentTypeRepo extends SqlContentTypeRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor({ store }: { store: ContentKernel | ContentDb }) {
    super({ kernel: schemaErasedKernel({ store }), tables: CONTENT_TYPE_TABLES, declaredOwners: DECLARED_CONTENT_TYPE_OWNERS }, {});
  }
}
