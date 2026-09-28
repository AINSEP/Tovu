import { type ContentKernel, contentKernel } from "../content-kernel.js";
import { SqlWebhookDeliveryRepo, SqlWebhookSubscriptionRepo } from "../repos/webhook-repo.js";
import type { ContentDb } from "./content-db.js";

/**
 * @file The webhook subscription and delivery repos on a site's SQLite `content.db`: {@link
 * SqlWebhookSubscriptionRepo} and {@link SqlWebhookDeliveryRepo} (the one Kysely query body,
 * `repos/webhook-repo.ts`), kept as named classes so the call sites that build them from the
 * content db handle stay as they are.
 */

/** @overallScore 100 */
export class SqliteWebhookSubscriptionRepo extends SqlWebhookSubscriptionRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}

/** @overallScore 100 */
export class SqliteWebhookDeliveryRepo extends SqlWebhookDeliveryRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}
