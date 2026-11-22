import { outboxEventValues } from "@jini-ai/db/events";
import { SqlFormDeliveryRepo } from "@jini-ai/cms/forms/sql";
import { schemaErasedKernel, type ContentKernel } from "../content-kernel.js";

export function createSiteFormDeliveryRepo({ kernel }: { kernel: ContentKernel }, { outboxRow = outboxEventValues }: { outboxRow?: typeof outboxEventValues } = {}) {
  return new SqlFormDeliveryRepo({ kernel: schemaErasedKernel({ store: kernel }), outboxRow,
    tables: { plans: "form_delivery_plans", jobs: "form_delivery_jobs", outboxEvents: "outbox_events" } });
}
