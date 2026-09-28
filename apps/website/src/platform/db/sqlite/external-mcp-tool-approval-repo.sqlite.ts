import { type ContentKernel, contentKernel } from "../content-kernel.js";
import { SqlExternalMcpToolApprovalRepo } from "../repos/external-mcp-tool-approval-repo.js";
import type { ContentDb } from "./content-db.js";

/**
 * @file The G3 "Always allow" store on a site's SQLite `content.db`: {@link
 * SqlExternalMcpToolApprovalRepo} (the one Kysely query body,
 * `repos/external-mcp-tool-approval-repo.ts`), kept as a named class so the composition root that
 * builds it from the content db handle stays as it is.
 */
export class SqliteExternalMcpToolApprovalRepo extends SqlExternalMcpToolApprovalRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}
