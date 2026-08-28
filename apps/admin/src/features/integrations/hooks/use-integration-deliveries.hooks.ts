import { describeApiError, type AdminWebhookDelivery } from "@/lib/api";
import { useFetchQuery } from "@/lib/fetch-query";
import { KEYS } from "../rules";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { t as defaultT } from "../integrations-i18n";
import { defaultIntegrationDeliveriesPort } from "./integration-deliveries-dependencies.hooks";
import type { IntegrationDeliveriesPort } from "./integration-deliveries-port.hooks";

/**
 * @file Everything the delivery-log screen does, so `IntegrationDeliveries.tsx` is only markup.
 *
 * Extracted verbatim — same error strings. A second hook file rather than folding into
 * `use-integrations.hooks.ts`: `IntegrationDeliveries` is a distinct component with its own
 * lifecycle (re-fetches whenever `subscriptionId` changes), per this feature's "one hook file per
 * component" convention.
 *
 * `port` is injected — see `integration-deliveries-port.hooks.ts` — rather than importing
 * `lib/api` directly, so a test can describe a subscription's delivery log against
 * `createFakeIntegrationDeliveriesPort` instead of stubbing global `fetch`.
 * `useWiredIntegrationDeliveries` below is the zero-argument pair `IntegrationDeliveries.tsx`
 * actually mounts.
 *
 * `t` (2026-08-11, standing i18n rule — see `use-integrations.hooks.ts`'s own file header for the
 * full rationale): injected as this hook's third parameter. UNLIKE `useIntegrations`, no raw
 * `locale` is threaded — `IntegrationDeliveries.tsx` only ever calls `t(locale, key)` bound-style,
 * it never passes `locale` to a helper that needs it directly.
 *
 * `lib/fetch-query` migration (2026-08-12): the load is one `useFetchQuery` keyed on
 * `KEYS.deliveries(subscriptionId)` — a query cannot commit a response belonging to a prior key,
 * which eliminates the load race an external audit flagged at this file's old line 46 (a plain
 * `.then()`/`.catch()` effect with no cancellation guard, so a `subscriptionId` change mid-flight
 * could commit a stale response) by construction.
 */

export interface IntegrationDeliveriesController {
  deliveries: AdminWebhookDelivery[] | null;
  error: string | null;
  /** Bound translator — `key` already resolved against the caller's locale, so
   *  `IntegrationDeliveries.tsx` never imports `useAdminLocale`/`integrations-i18n` itself. See
   *  this file's header. */
  t: (key: string) => string;
}

export function useIntegrationDeliveries(
  subscriptionId: string,
  port: IntegrationDeliveriesPort,
  t: (key: string) => string
): IntegrationDeliveriesController {
  const list = useFetchQuery({
    key: KEYS.deliveries(subscriptionId),
    fetch: () => port.listIntegrationDeliveries(subscriptionId),
  });

  const deliveries = list.data?.deliveries ?? null;
  const error = list.error ? describeApiError(list.error, "failed to load deliveries") : null;

  return { deliveries, error, t };
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
export function useWiredIntegrationDeliveries(subscriptionId: string): IntegrationDeliveriesController {
  const locale = useAdminLocale();
  const t = (key: string): string => defaultT(locale, key);
  return useIntegrationDeliveries(subscriptionId, defaultIntegrationDeliveriesPort, t);
}
