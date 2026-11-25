import { useIntegrations, type IntegrationsController } from "@jini-ai/integrations/react/webhooks/hooks/use-integrations.hooks";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { tIntegrations as defaultT } from "@/lib/i18n-common";
import { describeApiError } from "@/lib/admin-http/request";
import { useFetchMutation, useFetchQuery, useInvalidate } from "@jini-ai/ui/fetch-query";
import { useContentRefreshSubscription } from "@jini-ai/admin/shell/hooks/use-content-refresh-subscription.hooks";
import type { AdminWebhookSubscriptionResponse } from "@jini-ai/core/contracts/site/cms-integrations";
import { integrationsApi } from "@/features/integrations/integrations-host-ports";
import type { IntegrationsPort } from "@jini-ai/integrations/react/webhooks/hooks/use-integrations.hooks";

/**
 * @file The only place under `features/integrations/hooks` that reaches `lib/api` for
 * subscription CRUD — see `integrations-port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton — matches `integrations/jini-admin/redirects-ports.ts`'s
 *  `redirectsHostPorts`. */
export const defaultIntegrationsPort: IntegrationsPort = {
  listIntegrationSubscriptions: () => integrationsApi.listIntegrationSubscriptions(),
  createIntegrationSubscription: (input, _optional = {}) => integrationsApi.createIntegrationSubscription(input),
  pauseIntegrationSubscription: ({ id, paused }) => integrationsApi.pauseIntegrationSubscription({ id, paused }),
  deleteIntegrationSubscription: ({ id }, _optional = {}) => integrationsApi.deleteIntegrationSubscription({ id }),
};

/** Seed state for {@link createFakeIntegrationsPort}. */
export interface FakeIntegrationsPortOptions {
  subscriptions?: AdminWebhookSubscriptionResponse[];
}

/**
 * An in-memory {@link IntegrationsPort} for tests — the fake that lets a test describe "this
 * subscription exists" or "the create fails" directly, instead of hand-building fetch `Response`s.
 * Shipped alongside the real binding per the pattern's "every port gets a fake" rule (see
 * `assistant-chats-dependencies.hooks.ts`).
 */
export function createFakeIntegrationsPort(options: FakeIntegrationsPortOptions = {}): IntegrationsPort & {
  /** Every subscription currently in the fake's store, in list order. */
  readonly subscriptions: AdminWebhookSubscriptionResponse[];
} {
  const subscriptions = [...(options.subscriptions ?? [])];

  return {
    subscriptions,

    async listIntegrationSubscriptions() {
      return { subscriptions: [...subscriptions] };
    },

    async createIntegrationSubscription(input, _optional = {}) {
      const created: AdminWebhookSubscriptionResponse = {
        id: `fake-${subscriptions.length + 1}`,
        label: input.label,
        targetUrl: input.targetUrl,
        topics: input.topics,
        status: "active",
        secretVersion: 1,
        previousSecretVersion: null,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
        disabledAt: null,
        lastDelivery: null,
      };
      subscriptions.push(created);
      return { subscription: created };
    },

    async pauseIntegrationSubscription({ id, paused }) {
      const index = subscriptions.findIndex((s) => s.id === id);
      if (index < 0) throw new Error(`fake integrations port: unknown subscription ${id}`);
      const updated = { ...subscriptions[index], status: (paused ? "paused" : "active") as AdminWebhookSubscriptionResponse["status"] };
      subscriptions[index] = updated;
      return { subscription: updated };
    },

    async deleteIntegrationSubscription({ id }, _optional = {}) {
      const index = subscriptions.findIndex((s) => s.id === id);
      if (index < 0) throw new Error(`fake integrations port: unknown subscription ${id}`);
      const [removed] = subscriptions.splice(index, 1);
      return { subscription: removed };
    },
  };
}

/**
 * Binds the real `/api/.../integrations/subscriptions` client, and a `t` bound to the real
 * resolved locale (`useAdminLocale()`, called here and ONLY here — see this file's header) — see
 * `integrations-dependencies.hooks.ts`.
 *
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so `Integrations.tsx`
 * composes this and a test composes {@link useIntegrations} with `createFakeIntegrationsPort` and
 * a fake `t`/`locale`.
 */
export function useWiredIntegrations(): IntegrationsController {
  const locale = useAdminLocale();
  const t = ({ key }: { key: string }, _optional = {}): string => defaultT({ locale, key });
  return useIntegrations({ port: defaultIntegrationsPort, t: t, locale: locale, queryHooks: { useFetchQuery, useFetchMutation, useInvalidate }, useContentRefreshSubscriptionHook: useContentRefreshSubscription, describeApiError, translate: defaultT });
}
