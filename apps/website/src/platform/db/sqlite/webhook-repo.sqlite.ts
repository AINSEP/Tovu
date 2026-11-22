import { type ContentKernel, schemaErasedKernel } from "../content-kernel.js";
import { SqlWebhookDeliveryRepo, SqlWebhookSubscriptionRepo } from "@jini-ai/integrations/webhooks/sql";
import type { ContentDb } from "./content-db.js";

/**
 * @file The webhook subscription and delivery repos on a site's SQLite `content.db`: {@link
 * SqlWebhookSubscriptionRepo} and {@link SqlWebhookDeliveryRepo} (the one Kysely query body, now
 * Jini `@jini-ai/integrations/webhooks/sql`, S6b), kept as named classes so the call sites that build
 * them from the content db handle stay as they are. The binding supplies this site's table names.
 */

/** This site's webhook table names (the Jini adapters have no default). */
export const WEBHOOK_TABLES = { webhookSubscriptions: "webhook_subscriptions", webhookDeliveries: "webhook_deliveries" } as const;

/** @overallScore 100 */
export class SqliteWebhookSubscriptionRepo extends SqlWebhookSubscriptionRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor({ store }: { store: ContentKernel | ContentDb }) {
    super({ kernel: schemaErasedKernel({ store }), tables: WEBHOOK_TABLES }, {});
  }
}

/** @overallScore 100 */
export class SqliteWebhookDeliveryRepo extends SqlWebhookDeliveryRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor({ store }: { store: ContentKernel | ContentDb }) {
    super({ kernel: schemaErasedKernel({ store }), tables: WEBHOOK_TABLES }, {});
  }
}
