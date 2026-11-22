import { SqlWebhookDeliveryRepo, SqlWebhookSubscriptionRepo } from "@jini-ai/integrations/webhooks/sql";

import { schemaErasedKernel, type ContentKernel } from "../content-kernel.js";
import { WEBHOOK_TABLES } from "../sqlite/webhook-repo.sqlite.js";

/**
 * @file Test-only construction of Jini's webhook SQL adapters over a kernel of any dialect (the SQLite
 * binding classes take a SQLite store; the dialect-matrix suites also run these on PGlite). Same table
 * names as the production binding.
 */

/** The subscription repo over `kernel`, with this site's table names. */
export function webhookSubscriptionsOn({ kernel }: { kernel: ContentKernel }, _optional: Record<string, never> = {}): SqlWebhookSubscriptionRepo {
  return new SqlWebhookSubscriptionRepo({ kernel: schemaErasedKernel({ store: kernel }), tables: WEBHOOK_TABLES }, {});
}

/** The delivery repo (and envelope store) over `kernel`, with this site's table names. */
export function webhookDeliveriesOn({ kernel }: { kernel: ContentKernel }, _optional: Record<string, never> = {}): SqlWebhookDeliveryRepo {
  return new SqlWebhookDeliveryRepo({ kernel: schemaErasedKernel({ store: kernel }), tables: WEBHOOK_TABLES }, {});
}
