import { type ContentKernel, contentKernel } from "../../platform/db/content-kernel.js";
import { SqlExternalMcpServerRepo } from "./external-mcp-repo.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";

/**
 * @file The external MCP server store on a site's SQLite `content.db`: {@link
 * SqlExternalMcpServerRepo} (the one Kysely query body, `apps/website/src/features/external-mcp/external-mcp-repo.ts`), kept as a
 * named class so callers can construct it from the content db handle or kernel.
 */
export class SqliteExternalMcpServerRepo extends SqlExternalMcpServerRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor({ store }: { store: ContentKernel | ContentDb }) {
    super(contentKernel({ store }));
  }
}
