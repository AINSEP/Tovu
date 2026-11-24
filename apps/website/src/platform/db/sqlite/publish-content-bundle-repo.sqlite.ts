import { SqlPublishContentBundleRepo } from "@jini-ai/cms/publish/transfer/sql/bundle-repo";
import { type ContentKernel, schemaErasedKernel } from "../content-kernel.js";
import type { ContentDb } from "./content-db.js";

/** Tovu owns the persisted name (migration `0066`); the repo and the dialect suite use the same wiring. */
export const PUBLISH_CONTENT_BUNDLE_TABLES = { bundles: "publish_content_bundles" } as const;

/**
 * @file The publish-content bundle repo on a site's SQLite `content.db`: {@link SqlPublishContentBundleRepo} (the one Kysely
 * query body, in Jini `@jini-ai/cms/publish/transfer/sql/bundle-repo`), kept as a named class so the call sites that build it from the
 * content db handle stay as they are.
 */
export class SqlitePublishContentBundleRepo extends SqlPublishContentBundleRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor({ store }: { store: ContentKernel | ContentDb }) {
    super({ kernel: schemaErasedKernel({ store }), tables: PUBLISH_CONTENT_BUNDLE_TABLES }, {});
  }
}
