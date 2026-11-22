import { type ContentKernel, schemaErasedKernel } from "../../platform/db/content-kernel.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import { SqlWorkspaceRepo } from "@jini-ai/cms/workspace/sql";

/** Tovu owns the persisted table name. */
export const WORKSPACE_TABLES = { workspaces: "workspaces" } as const;

/**
 * @file The workspace repo on a site's SQLite `content.db`. The one Kysely query body lives in Jini
 * `@jini-ai/cms/workspace/sql`; this named class keeps the composition root that builds it from the content db handle.
 */
export class SqliteWorkspaceRepo extends SqlWorkspaceRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor({ store }: { store: ContentKernel | ContentDb }) {
    super({ kernel: schemaErasedKernel({ store }), tables: WORKSPACE_TABLES }, {});
  }
}
