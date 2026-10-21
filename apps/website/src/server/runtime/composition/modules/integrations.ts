import { InMemoryDeliveryEnvelopeStore } from "#src/features/webhooks/index";
import type {
  DeliveryEnvelopeStore,
  WebhookDeliveryRepoPort,
  WebhookSubscriptionRepoPort,
  WebhookTopic,
} from "#src/features/webhooks/index";
import { enqueueDelivery } from "#src/features/webhooks/delivery";
import type { Clock as ClockPort, IdGenerator as IdGeneratorPort, JsonObject } from "@jini-ai/core/primitives";
import type { EventBusPort } from "@jini-ai/cms/core";
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
  /** Durable form delivery to the site's delivery bindings (`composition/form-delivery.ts`), a
   *  second consumer of `form.submission.received` beside the webhook fan-out. Absent: not wired. */
  formDelivery?: { start(): Promise<void> };
  webhookSubscriptionRepo: WebhookSubscriptionRepoPort;
  webhookDeliveryRepo: WebhookDeliveryRepoPort;
  idGen: IdGeneratorPort;
  /** Webhook enqueueing consumes ISO time from the same host clock as the rest of the site. */
  clock: ClockPort & { nowIso(): string };
}

/** One envelope store per delivery repo, so every `createApp` over the same deps shares it. */
const envelopeStoresByRepo = new WeakMap<WebhookDeliveryRepoPort, DeliveryEnvelopeStore>();

/**
 * The envelope store BOTH halves of a delivery must use: fan-out (`createIntegrationsModule`) saves
 * the envelope, and the delivery worker (`webhook-delivery-worker.ts`) reads it back to sign and
 * send. Two separate stores meant every delivery the worker claimed found no envelope.
 *
 * A durable delivery repo is its own store (`SqlWebhookDeliveryRepo` keeps the envelope on the
 * delivery row, so it survives a restart). The in-memory repo keeps none, so it gets one in-memory
 * store, cached per repo instance.
 *
 * @complexity O(1).
 */
export function webhookEnvelopeStoreFor(required: { deliveryRepo: WebhookDeliveryRepoPort }, _optional = {}): DeliveryEnvelopeStore {
  const { deliveryRepo } = required;
  const candidate = deliveryRepo as WebhookDeliveryRepoPort & Partial<DeliveryEnvelopeStore>;
  if (typeof candidate.find === "function" && typeof candidate.save === "function") return candidate as DeliveryEnvelopeStore;
  let store = envelopeStoresByRepo.get(deliveryRepo);
  if (store === undefined) {
    store = new InMemoryDeliveryEnvelopeStore();
    envelopeStoresByRepo.set(deliveryRepo, store);
  }
  return store;
}

export function createIntegrationsModule(deps: IntegrationsModuleDeps): ServerModuleHandle {
  return {
    name: "integrations",
    start: () => {
      const formsWebhookEnvelopeStore = webhookEnvelopeStoreFor({ deliveryRepo: deps.webhookDeliveryRepo });
      void deps.bus.subscribe<JsonObject>({
        eventName: "form.submission.received",
        handler: async (event) => {
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
                payload: event.payload,
              },
            },
          });
        },
      });
      // After the webhook fan-out: the bus runs an event's handlers in subscription order and stops
      // at the first that throws, so a delivery planner that throws can no longer cost the webhook.
      void deps.formDelivery?.start();
    },
  };
}
