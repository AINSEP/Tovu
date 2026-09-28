import { type ContentKernel, contentKernel } from "../content-kernel.js";
import { SqlBufferSink } from "../repos/analytics-sink.js";
import type { ContentDb } from "./content-db.js";

/**
 * @file The durable analytics hit buffer on a site's SQLite `content.db`: {@link SqlBufferSink}
 * (the one Kysely query body, `repos/analytics-sink.ts`), kept as a named class so the composition
 * root that builds it from the content db handle stays as it is.
 */
export class SqliteBufferSink extends SqlBufferSink {
  /** `db`: the connection's kernel, or the content db handle it is derived from. */
  constructor(deps: { db: ContentKernel | ContentDb; workspaceId: string }) {
    super({ kernel: contentKernel(deps.db), workspaceId: deps.workspaceId });
  }
}
