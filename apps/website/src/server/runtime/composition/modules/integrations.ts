import { InMemoryDeliveryEnvelopeStore } from "../../../../features/webhooks/index.js";
import type {
  WebhookDeliveryRepoPort,
  WebhookSubscriptionRepoPort,
  WebhookTopic,
} from "../../../../features/webhooks/index.js";
import { enqueueDelivery } from "../../../../features/webhooks/delivery.js";
import type { ClockPort, EventBusPort, IdGeneratorPort, JsonObject } from "@jini-ai/cms/core";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file ADR-046 Phase 3 (SPEC-031) — the `integrations` module.
 *
 * Owns the Forms-to-webhook fan-out subscription, moved here verbatim from `app.ts`'s
 * `createApp()` per the ADR's explicit Phase 3 rule: "Cross-feature integration is owned by the
 * consuming module. Move the Forms-to-webhook fan-out from createApp() into Integrations' event
 * subscriber, subscribed through the existing event abstraction. The Forms module emits its
 * domain event only." Forms (`modules/forms.ts`) never references webhooks; this module never
 * references Forms beyond the bus topic name string it subscribes to.
 *
 * Scope note: this slice moves subscription OWNERSHIP only. Webhook admin/public ROUTE
 * registration itself stays inline in `app.ts` for now (a larger, separately-verifiable
 * migration, not bundled into this first Phase 3 slice — see SPEC-031's Non-Goals).
 */
export interface IntegrationsModuleDeps {
  bus: EventBusPort;
  webhookSubscriptionRepo: WebhookSubscriptionRepoPort;
  webhookDeliveryRepo: WebhookDeliveryRepoPort;
  idGen: IdGeneratorPort;
  clock: ClockPort;
}

export function createIntegrationsModule(deps: IntegrationsModuleDeps): ServerModuleHandle {
  return {
    name: "integrations",
    start: () => {
      const formsWebhookEnvelopeStore = new InMemoryDeliveryEnvelopeStore();
      void deps.bus.subscribe("form.submission.received", async (event) => {
        await enqueueDelivery({
          deps: {
            subscriptionRepo: deps.webhookSubscriptionRepo,
            deliveryRepo: deps.webhookDeliveryRepo,
            envelopeStore: formsWebhookEnvelopeStore,
            idGenerator: deps.idGen,
            clock: deps.clock,
          },
          input: {
            event: {
              id: event.id,
              name: event.name as WebhookTopic,
              workspaceId: event.workspaceId,
              occurredAt: event.occurredAt,
              payload: event.payload as JsonObject,
            },
          },
        });
      });
    },
  };
}
