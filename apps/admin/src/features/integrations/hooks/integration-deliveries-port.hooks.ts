import type { AdminWebhookDelivery } from "@/lib/api";

/**
 * @file What `useIntegrationDeliveries` needs from the outside world, as an interface rather than
 * a direct `lib/api` import.
 *
 * A separate port from `integrations-port.hooks.ts` rather than folding in: this hook reads a
 * single subscription's delivery log (read-only), a different sub-resource with no method overlap
 * with subscription CRUD — narrowing to what this hook actually consumes, per `page-editor-
 * port.hooks.ts`'s "narrowing here is not a shared contract, it is this hook's own consumption"
 * reasoning, rather than forcing a shared shape neither hook's contract needs.
 */
export interface IntegrationDeliveriesPort {
  listIntegrationDeliveries(subscriptionId: string): Promise<{ deliveries: AdminWebhookDelivery[] }>;
}
