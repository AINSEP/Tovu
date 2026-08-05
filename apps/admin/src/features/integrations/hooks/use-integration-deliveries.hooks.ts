import { useEffect, useState } from "react";

import { api, type AdminWebhookDelivery } from "../../../lib/api";

/**
 * @file Everything the delivery-log screen does, so `IntegrationDeliveries.tsx` is only markup.
 *
 * Extracted verbatim — same state, same effect, same error strings. A second hook file rather than
 * folding into `use-integrations.hooks.ts`: `IntegrationDeliveries` is a distinct component with
 * its own lifecycle (re-fetches whenever `subscriptionId` changes), per this feature's "one hook
 * file per component" convention.
 */

export interface IntegrationDeliveriesController {
  deliveries: AdminWebhookDelivery[] | null;
  error: string | null;
}

export function useIntegrationDeliveries(subscriptionId: string): IntegrationDeliveriesController {
  const [deliveries, setDeliveries] = useState<AdminWebhookDelivery[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDeliveries(null);
    setError(null);
    api
      .listIntegrationDeliveries(subscriptionId)
      .then((r) => setDeliveries(r.deliveries))
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load deliveries"));
  }, [subscriptionId]);

  return { deliveries, error };
}
