import { useEffect, useState } from "react";

import type { AdminWebhookDelivery } from "../../../lib/api";
import { defaultIntegrationDeliveriesPort } from "./integration-deliveries-dependencies.hooks";
import type { IntegrationDeliveriesPort } from "./integration-deliveries-port.hooks";

/**
 * @file Everything the delivery-log screen does, so `IntegrationDeliveries.tsx` is only markup.
 *
 * Extracted verbatim — same state, same effect, same error strings. A second hook file rather than
 * folding into `use-integrations.hooks.ts`: `IntegrationDeliveries` is a distinct component with
 * its own lifecycle (re-fetches whenever `subscriptionId` changes), per this feature's "one hook
 * file per component" convention.
 *
 * `port` is injected — see `integration-deliveries-port.hooks.ts` — rather than importing
 * `lib/api` directly, so a test can describe a subscription's delivery log against
 * `createFakeIntegrationDeliveriesPort` instead of stubbing global `fetch`.
 * `useWiredIntegrationDeliveries` below is the zero-argument pair `IntegrationDeliveries.tsx`
 * actually mounts.
 */

export interface IntegrationDeliveriesController {
  deliveries: AdminWebhookDelivery[] | null;
  error: string | null;
}

export function useIntegrationDeliveries(
  subscriptionId: string,
  port: IntegrationDeliveriesPort
): IntegrationDeliveriesController {
  const [deliveries, setDeliveries] = useState<AdminWebhookDelivery[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDeliveries(null);
    setError(null);
    port
      .listIntegrationDeliveries(subscriptionId)
      .then((r) => setDeliveries(r.deliveries))
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load deliveries"));
  }, [subscriptionId, port]);

  return { deliveries, error };
}

/**
 * Binds the real `/api/.../integrations/subscriptions/:id/deliveries` client — see
 * `integration-deliveries-dependencies.hooks.ts`.
 *
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so
 * `IntegrationDeliveries.tsx` composes this and a test composes {@link useIntegrationDeliveries}
 * with `createFakeIntegrationDeliveriesPort`.
 */
export function useWiredIntegrationDeliveries(subscriptionId: string): IntegrationDeliveriesController {
  return useIntegrationDeliveries(subscriptionId, defaultIntegrationDeliveriesPort);
}
