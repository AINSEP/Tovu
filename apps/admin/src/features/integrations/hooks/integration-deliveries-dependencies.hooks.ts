import { useIntegrationDeliveries, type IntegrationDeliveriesController } from "@jini-ai/integrations/react/webhooks/hooks/use-integration-deliveries.hooks";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { tIntegrations as defaultT } from "@/lib/i18n-common";
import { describeApiError } from "@/lib/admin-http/request";
import { useFetchQuery } from "@jini-ai/ui/fetch-query";
import type { AdminWebhookDeliveryResponse } from "@jini-ai/core/contracts/site/cms-integrations";
import { integrationsApi } from "@/features/integrations/integrations-host-ports";
import type { IntegrationDeliveriesPort } from "@jini-ai/integrations/react/webhooks/hooks/use-integration-deliveries.hooks";

/**
 * @file The only place under `features/integrations/hooks` that reaches `lib/api` for the
 * delivery log — see `integration-deliveries-port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton — matches `integrations/jini-admin/redirects-ports.ts`'s
 *  `redirectsHostPorts`. */
export const defaultIntegrationDeliveriesPort: IntegrationDeliveriesPort = {
  listIntegrationDeliveries: ({ subscriptionId }, _optional = {}) => integrationsApi.listIntegrationDeliveries({ subscriptionId }),
};

/** Seed state for {@link createFakeIntegrationDeliveriesPort}. */
export interface FakeIntegrationDeliveriesPortOptions {
  deliveries?: AdminWebhookDeliveryResponse[];
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

/**
 * Binds the real `/api/.../integrations/subscriptions/:id/deliveries` client, and a `t` bound to
 * the real resolved locale (`useAdminLocale()`, called here and ONLY here — see this file's
 * header) — see `integration-deliveries-dependencies.hooks.ts`.
 *
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so
 * `IntegrationDeliveries.tsx` composes this and a test composes {@link useIntegrationDeliveries}
 * with `createFakeIntegrationDeliveriesPort` and a fake `t`.
 */
export function useWiredIntegrationDeliveries({ subscriptionId }: { subscriptionId: string }, _optional = {}): IntegrationDeliveriesController {
  const locale = useAdminLocale();
  const t = ({ key }: { key: string }, _optional = {}): string => defaultT({ locale, key });
  return useIntegrationDeliveries({ subscriptionId: subscriptionId, port: defaultIntegrationDeliveriesPort, t: t, queryHooks: { useFetchQuery }, describeApiError });
}
