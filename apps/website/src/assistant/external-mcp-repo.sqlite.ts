import { type ContentKernel, contentKernel } from "../platform/db/content-kernel.js";
import { SqlExternalMcpServerRepo } from "./external-mcp-repo.js";
import type { ContentDb } from "../platform/db/sqlite/content-db.js";

/**
 * @file The external MCP server store on a site's SQLite `content.db`: {@link
 * SqlExternalMcpServerRepo} (the one Kysely query body, `repos/external-mcp-repo.ts`), kept as a
 * named class so the call sites that build it from the content db handle stay as they are.
 */
export class SqliteExternalMcpServerRepo extends SqlExternalMcpServerRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}
