import { api, type AdminWebhookSubscription } from "../../../lib/api";
import type { IntegrationsPort } from "./integrations-port.hooks";

/**
 * @file The only place under `features/integrations/hooks` that reaches `lib/api` for
 * subscription CRUD — see `integrations-port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton — matches `redirects-dependencies.hooks.ts`'s
 *  `defaultRedirectsPort`. */
export const defaultIntegrationsPort: IntegrationsPort = {
  listIntegrationSubscriptions: () => api.listIntegrationSubscriptions(),
  createIntegrationSubscription: (input) => api.createIntegrationSubscription(input),
  pauseIntegrationSubscription: ({ id, paused }) => api.pauseIntegrationSubscription({ id, paused }),
  deleteIntegrationSubscription: (id) => api.deleteIntegrationSubscription(id),
};

/** Seed state for {@link createFakeIntegrationsPort}. */
export interface FakeIntegrationsPortOptions {
  subscriptions?: AdminWebhookSubscription[];
}

/**
 * An in-memory {@link IntegrationsPort} for tests — the fake that lets a test describe "this
 * subscription exists" or "the create fails" directly, instead of hand-building fetch `Response`s.
 * Shipped alongside the real binding per the pattern's "every port gets a fake" rule (see
 * `assistant-chats-dependencies.hooks.ts`).
 */
export function createFakeIntegrationsPort(options: FakeIntegrationsPortOptions = {}): IntegrationsPort & {
  /** Every subscription currently in the fake's store, in list order. */
  readonly subscriptions: AdminWebhookSubscription[];
} {
  const subscriptions = [...(options.subscriptions ?? [])];

  return {
    subscriptions,

    async listIntegrationSubscriptions() {
      return { subscriptions: [...subscriptions] };
    },

    async createIntegrationSubscription(input) {
      const created: AdminWebhookSubscription = {
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
      const updated = { ...subscriptions[index]!, status: (paused ? "paused" : "active") as AdminWebhookSubscription["status"] };
      subscriptions[index] = updated;
      return { subscription: updated };
    },

    async deleteIntegrationSubscription(id) {
      const index = subscriptions.findIndex((s) => s.id === id);
      if (index < 0) throw new Error(`fake integrations port: unknown subscription ${id}`);
      const [removed] = subscriptions.splice(index, 1);
      return { subscription: removed! };
    },
  };
}
