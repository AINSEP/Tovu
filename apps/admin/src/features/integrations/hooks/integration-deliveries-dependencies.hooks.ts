import { api, type AdminWebhookDelivery } from "../../../lib/api";
import type { IntegrationDeliveriesPort } from "./integration-deliveries-port.hooks";

/**
 * @file The only place under `features/integrations/hooks` that reaches `lib/api` for the
 * delivery log — see `integration-deliveries-port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton — matches `redirects-dependencies.hooks.ts`'s
 *  `defaultRedirectsPort`. */
export const defaultIntegrationDeliveriesPort: IntegrationDeliveriesPort = {
  listIntegrationDeliveries: (subscriptionId) => api.listIntegrationDeliveries(subscriptionId),
};

/** Seed state for {@link createFakeIntegrationDeliveriesPort}. */
export interface FakeIntegrationDeliveriesPortOptions {
  deliveries?: AdminWebhookDelivery[];
}

/**
 * An in-memory {@link IntegrationDeliveriesPort} for tests — the fake that lets a test describe
 * "this subscription has these deliveries" directly, instead of hand-building fetch `Response`s.
 * Shipped alongside the real binding per the pattern's "every port gets a fake" rule (see
 * `assistant-chats-dependencies.hooks.ts`).
 */
export function createFakeIntegrationDeliveriesPort(
  options: FakeIntegrationDeliveriesPortOptions = {}
): IntegrationDeliveriesPort {
  const deliveries = options.deliveries ?? [];

  return {
    async listIntegrationDeliveries() {
      return { deliveries };
    },
  };
}
