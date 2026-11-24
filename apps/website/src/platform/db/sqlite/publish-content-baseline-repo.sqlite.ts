import { SqlPublishContentBaselineRepo } from "@jini-ai/cms/publish/content/sql/baseline-repo";
import { type ContentKernel, schemaErasedKernel } from "../content-kernel.js";
import type { ContentDb } from "./content-db.js";

/** Tovu owns the persisted name (migration `0066`); the repo and the dialect suite use the same wiring. */
export const PUBLISH_CONTENT_BASELINE_TABLES = { baselines: "publish_content_baselines" } as const;

/**
 * @file The publish-content baseline repo on a site's SQLite `content.db`: {@link SqlPublishContentBaselineRepo} (the one Kysely
 * query body, in Jini `@jini-ai/cms/publish/content/sql/baseline-repo`), kept as a named class so the call sites that build it from the
 * content db handle stay as they are.
 */
export class SqlitePublishContentBaselineRepo extends SqlPublishContentBaselineRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor({ store }: { store: ContentKernel | ContentDb }) {
    super({ kernel: schemaErasedKernel({ store }), tables: PUBLISH_CONTENT_BASELINE_TABLES }, {});
  }
}
